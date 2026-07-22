import { canAccessDojo, getAuthorizedAdminSession, jsonResponse } from "../../../_lib/auth";
import { requireStudentDb, type StudentEnv } from "../../../_lib/studentRecords";

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
      ea.administrator_notes, ea.application_notes,
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
