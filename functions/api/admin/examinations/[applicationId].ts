import { canAccessDojo, getAuthorizedAdminSession, isSameOriginRequest, jsonResponse } from "../../../_lib/auth";
import { adminAuditMetadata, auditStatement, requestIdentifier, requireStudentDb, type StudentEnv } from "../../../_lib/studentRecords";

type Env = StudentEnv & { SESSION_SECRET?: string };

type ApplicationRow = {
  id: string;
  student_id: string;
  cycle_id: string;
  dojo_id: string | null;
  student_name: string;
  public_student_id: string;
  dojo_name: string;
  cycle_name: string;
  cycle_status: "active" | "closed";
  examination_type: string;
  answers_json: string;
  current_rank: string;
  attempted_rank: string;
  application_status: string;
  payment_status: string;
  administrator_notes: string;
  application_notes: string;
  student_visible_decision_note: string;
  internal_admin_note: string;
  submitted_at: string;
  updated_at: string;
  completed_at: string | null;
  paid_at: string | null;
  paid_by: string | null;
  last_examination_date: string | null;
  practice_period: string;
  exam_fee: number;
  aat_annual_fee: number;
  other_fees: number;
  total_fee: number;
};

type HistoryRow = {
  id: string;
  previous_status: string | null;
  new_status: string | null;
  previous_payment_status: string | null;
  new_payment_status: string | null;
  actor_identifier: string;
  note: string | null;
  created_at: string;
};

function parseAnswers(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, string | number | boolean | null>
      : {};
  } catch {
    return {};
  }
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const session = await getAuthorizedAdminSession(request, env);
  if (!session) return jsonResponse({ error: "Unauthorized" }, 401);

  const applicationId = String(params.applicationId || "").trim();
  if (!applicationId || applicationId.length > 128) return jsonResponse({ error: "Application not found." }, 404);

  const db = requireStudentDb(env);
  const application = await db.prepare(`SELECT
      ea.id, ea.student_id, ea.cycle_id, COALESCE(ea.dojo_id, s.dojo_id) AS dojo_id,
      COALESCE(NULLIF(ea.student_name_snapshot, ''), s.display_name, 'Student record') AS student_name,
      COALESCE(NULLIF(ea.student_public_id_snapshot, ''), s.public_student_id, 'Unavailable') AS public_student_id,
      COALESCE(d.official_name, s.dojo_name, 'Dojo record') AS dojo_name,
      ec.name AS cycle_name, ec.status AS cycle_status, ec.examination_type,
      ea.answers_json, ea.current_rank, ea.attempted_rank,
      ea.status AS application_status, ea.payment_status,
      ea.administrator_notes, ea.application_notes, ea.student_visible_decision_note, ea.internal_admin_note,
      ea.submitted_at, ea.updated_at, ea.completed_at, ea.paid_at, ea.paid_by,
      ea.last_examination_date, ea.practice_period,
      ea.exam_fee, ea.aat_annual_fee, ea.other_fees, ea.total_fee
    FROM examination_applications ea
    JOIN examination_cycles ec ON ec.id = ea.cycle_id
    LEFT JOIN students s ON s.id = ea.student_id
    LEFT JOIN dojos d ON d.id = COALESCE(ea.dojo_id, s.dojo_id)
    WHERE ea.id = ? LIMIT 1`)
    .bind(applicationId)
    .first<ApplicationRow>();

  if (!application) return jsonResponse({ error: "Application not found." }, 404);
  if (!canAccessDojo(session, application.dojo_id)) return jsonResponse({ error: "You do not have access to this application's dojo." }, 403);

  const history = (await db.prepare(`SELECT id, previous_status, new_status,
      previous_payment_status, new_payment_status, actor_identifier, note, created_at
    FROM application_status_history
    WHERE application_id = ?
    ORDER BY created_at ASC, id ASC`)
    .bind(application.id)
    .all<HistoryRow>()).results || [];

  const { answers_json, ...record } = application;
  return jsonResponse({
    application: { ...record, answers: parseAnswers(answers_json) },
    history: history.map((entry) => ({
      id: entry.id,
      previousStatus: entry.previous_status,
      newStatus: entry.new_status,
      previousPaymentStatus: entry.previous_payment_status,
      newPaymentStatus: entry.new_payment_status,
      actorIdentifier: entry.actor_identifier,
      note: entry.note,
      createdAt: entry.created_at,
    })),
  }, 200, { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Forbidden" }, 403);
  const session = await getAuthorizedAdminSession(request, env);
  if (!session) return jsonResponse({ error: "Unauthorized" }, 401);
  const applicationId = String(params.applicationId || "").trim();
  try {
    const body = await request.json<{ action?: unknown }>();
    if (body.action !== "reject") return jsonResponse({ error: "Choose the reject action." }, 400);
    const db = requireStudentDb(env);
    const application = await db.prepare(`SELECT ea.id, ea.student_id, ea.cycle_id, ea.status, ea.payment_status,
        ea.student_name_snapshot, ea.student_public_id_snapshot, COALESCE(ea.dojo_id, s.dojo_id) AS dojo_id,
        ecs.id AS cycle_status_id, ecs.status AS cycle_status
      FROM examination_applications ea JOIN students s ON s.id = ea.student_id
      LEFT JOIN exam_cycle_student_status ecs ON ecs.application_id = ea.id
      WHERE ea.id = ? LIMIT 1`)
      .bind(applicationId).first<{ id: string; student_id: string; cycle_id: string; status: string; payment_status: string; student_name_snapshot: string; student_public_id_snapshot: string; dojo_id: string; cycle_status_id: string | null; cycle_status: string | null }>();
    if (!application) return jsonResponse({ error: "Application not found." }, 404);
    if (!canAccessDojo(session, application.dojo_id)) return jsonResponse({ error: "You do not have access to this application's dojo." }, 403);
    if (application.status !== "application_submitted") return jsonResponse({ error: "Another administrator has already processed this application." }, 409);
    if (application.payment_status === "paid") return jsonResponse({ error: "Reverse the payment confirmation before rejecting this application." }, 409);
    const now = new Date().toISOString();
    const requestId = requestIdentifier(request);
    await db.batch([
      db.prepare(`INSERT INTO request_decisions
        (id, request_type, request_id, decision, reviewer_identifier, decided_at)
        VALUES (?, 'examination_application', ?, 'denied', ?, ?)`)
        .bind(crypto.randomUUID(), application.id, session.adminName, now),
      db.prepare(`UPDATE examination_applications SET status = 'rejected', updated_at = ?
        WHERE id = ? AND status = 'application_submitted' AND payment_status <> 'paid'`)
        .bind(now, application.id),
      db.prepare(`INSERT INTO application_status_history
        (id, application_id, previous_status, new_status, previous_payment_status, new_payment_status,
         actor_identifier, note, request_id, created_at) VALUES (?, ?, ?, 'rejected', ?, ?, ?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), application.id, application.status, application.payment_status, application.payment_status, session.adminName, null, requestId, now),
      ...(application.cycle_status_id ? [
        db.prepare("UPDATE exam_cycle_student_status SET status = 'not_signed_up', updated_at = ?, updated_by = ? WHERE id = ?")
          .bind(now, session.adminName, application.cycle_status_id),
        db.prepare(`INSERT INTO exam_cycle_status_history
          (id, cycle_status_id, previous_status, new_status, actor_identifier, request_id, note, created_at)
          VALUES (?, ?, ?, 'not_signed_up', ?, ?, ?, ?)`)
          .bind(crypto.randomUUID(), application.cycle_status_id, application.cycle_status, session.adminName, requestId, "Application rejected", now),
      ] : []),
      auditStatement(db, {
        actorType: "administrator", ...adminAuditMetadata(session, request), action: "examination_application_rejected",
        entityType: "examination_application", entityId: application.id, studentId: application.student_id,
        studentPublicId: application.student_public_id_snapshot, studentNameSnapshot: application.student_name_snapshot,
        examCycleId: application.cycle_id, previousValues: { status: application.status },
        newValues: { status: "rejected" },
        source: "admin_examination_application", requestId, summary: `Rejected examination application for ${application.student_public_id_snapshot}`, createdAt: now,
      }),
    ]);
    return jsonResponse({ ok: true, status: "rejected" }, 200, { "Cache-Control": "no-store" });
  } catch (error) {
    const conflict = error instanceof Error && /(?:UNIQUE constraint|request_decisions|already processed)/i.test(error.message);
    return jsonResponse({ error: conflict ? "Another administrator has already processed this application." : error instanceof Error ? error.message : "The application could not be rejected." }, conflict ? 409 : 400);
  }
};
