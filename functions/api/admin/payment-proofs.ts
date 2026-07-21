import { addOneCalendarYear } from "../../../shared/membership";
import { getAuthorizedAdminSession, isRenShinKanSuperAdmin, isSameOriginRequest, jsonResponse } from "../../_lib/auth";
import { purgeExpiredPaymentProofs } from "../../_lib/paymentProofs";
import {
  adminAuditMetadata, auditStatement, requestIdentifier, requireStudentDb,
  type D1PreparedStatement, type StudentEnv,
} from "../../_lib/studentRecords";
import type { R2Bucket } from "../../_lib/storage";

type Env = StudentEnv & { SESSION_SECRET?: string; MEDIA_BUCKET?: R2Bucket };
type ProofRow = {
  id: string; student_id: string; dojo_id: string; payment_type: "exam" | "aat_annual" | "renshinkan_monthly";
  payment_reference_id: string; status: string; submitted_at: string; expires_at: string;
  student_name: string; public_student_id: string; dojo_name: string; review_note: string;
};

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, max + 1) : "";
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

function bangkokDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const session = await getAuthorizedAdminSession(request, env);
  if (!session) return jsonResponse({ error: "Unauthorized" }, 401);
  const db = requireStudentDb(env);
  await purgeExpiredPaymentProofs(db, env.MEDIA_BUCKET);
  const url = new URL(request.url);
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1);
  const pageSize = 25;
  const query = clean(url.searchParams.get("query"), 120);
  const status = ["pending_review", "approved", "denied"].includes(String(url.searchParams.get("status"))) ? String(url.searchParams.get("status")) : "";
  const paymentType = ["exam", "aat_annual", "renshinkan_monthly"].includes(String(url.searchParams.get("paymentType"))) ? String(url.searchParams.get("paymentType")) : "";
  const now = new Date().toISOString();
  const conditions = ["p.object_key IS NOT NULL", "p.submitted_at IS NOT NULL", "p.expires_at > ?"];
  const bindings: unknown[] = [now];
  if (!isRenShinKanSuperAdmin(session)) { conditions.push("s.dojo_id = ?"); bindings.push(session.selectedDojoId || "__none__"); }
  if (status) { conditions.push("p.status = ?"); bindings.push(status); }
  if (paymentType) { conditions.push("p.payment_type = ?"); bindings.push(paymentType); }
  if (query) {
    const term = `%${escapeLike(query)}%`;
    conditions.push("(s.display_name LIKE ? ESCAPE '\\' COLLATE NOCASE OR s.public_student_id LIKE ? ESCAPE '\\' COLLATE NOCASE)");
    bindings.push(term, term);
  }
  const where = conditions.join(" AND ");
  const scope = isRenShinKanSuperAdmin(session) ? "" : "AND s.dojo_id = ?";
  const scopeBindings = isRenShinKanSuperAdmin(session) ? [] : [session.selectedDojoId || "__none__"];
  const [countResult, rowResult, summaryResult] = await db.batch([
    db.prepare(`SELECT COUNT(*) AS total FROM payment_proofs p JOIN students s ON s.id = p.student_id WHERE ${where}`).bind(...bindings),
    db.prepare(`SELECT p.id, p.student_id, p.dojo_id, p.payment_type, p.payment_reference_id, p.status,
        p.submitted_at, p.reviewed_at, p.reviewed_by, p.review_note, p.expires_at, p.original_filename,
        s.display_name AS student_name, s.public_student_id, d.official_name AS dojo_name
      FROM payment_proofs p JOIN students s ON s.id = p.student_id JOIN dojos d ON d.id = s.dojo_id
      WHERE ${where} ORDER BY p.submitted_at DESC, p.id DESC LIMIT ? OFFSET ?`)
      .bind(...bindings, pageSize, (page - 1) * pageSize),
    db.prepare(`SELECT COUNT(*) AS total,
        SUM(CASE WHEN p.status = 'pending_review' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN p.status = 'approved' THEN 1 ELSE 0 END) AS approved,
        SUM(CASE WHEN p.status = 'denied' THEN 1 ELSE 0 END) AS denied
      FROM payment_proofs p JOIN students s ON s.id = p.student_id
      WHERE p.object_key IS NOT NULL AND p.submitted_at IS NOT NULL AND p.expires_at > ? ${scope}`)
      .bind(now, ...scopeBindings),
  ]);
  const total = Number((countResult.results?.[0] as { total?: number } | undefined)?.total || 0);
  return jsonResponse({
    proofs: rowResult.results || [],
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    summary: summaryResult.results?.[0] || { total: 0, pending: 0, approved: 0, denied: 0 },
  }, 200, { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Forbidden" }, 403);
  const session = await getAuthorizedAdminSession(request, env);
  if (!session) return jsonResponse({ error: "Unauthorized" }, 401);
  const db = requireStudentDb(env);
  const requestId = requestIdentifier(request);
  try {
    await purgeExpiredPaymentProofs(db, env.MEDIA_BUCKET);
    const body = await request.json<{ action?: unknown; proofIds?: unknown; note?: unknown }>();
    const action = body.action === "approve" || body.action === "deny" ? body.action : "";
    const note = clean(body.note, 2000);
    const proofIds = Array.isArray(body.proofIds)
      ? Array.from(new Set(body.proofIds.filter((value): value is string => typeof value === "string" && value.length >= 8))).slice(0, 25)
      : [];
    if (!action || !proofIds.length) return jsonResponse({ error: "Select at least one submitted payslip and choose approve or deny." }, 400);
    if (action === "deny" && !note) return jsonResponse({ error: "Add a short reason for denying the payslip." }, 400);
    const placeholders = proofIds.map(() => "?").join(",");
    const scope = isRenShinKanSuperAdmin(session) ? "" : "AND s.dojo_id = ?";
    const rows = (await db.prepare(`SELECT p.id, p.student_id, p.dojo_id, p.payment_type, p.payment_reference_id,
        p.status, p.submitted_at, p.expires_at, p.review_note,
        s.display_name AS student_name, s.public_student_id, d.official_name AS dojo_name
      FROM payment_proofs p JOIN students s ON s.id = p.student_id JOIN dojos d ON d.id = s.dojo_id
      WHERE p.id IN (${placeholders}) AND p.status = 'pending_review' AND p.object_key IS NOT NULL
        AND p.expires_at > ? ${scope}`)
      .bind(...proofIds, new Date().toISOString(), ...(isRenShinKanSuperAdmin(session) ? [] : [session.selectedDojoId || "__none__"]))
      .all<ProofRow>()).results || [];
    if (rows.length !== proofIds.length) return jsonResponse({ error: "One or more selected payslips is unavailable, already reviewed, expired, or outside your dojo." }, 409);

    const now = new Date().toISOString();
    const paymentDate = bangkokDateKey(new Date(now));
    const bulkOperationId = crypto.randomUUID();
    const statements: D1PreparedStatement[] = [];
    for (const row of rows) {
      if (action === "approve" && row.payment_type === "exam") {
        const target = await db.prepare(`SELECT ea.status, ea.payment_status, ea.paid_at, ea.paid_by, ea.cycle_id,
            ecs.id AS cycle_status_id, ecs.status AS cycle_status
          FROM examination_applications ea LEFT JOIN exam_cycle_student_status ecs ON ecs.application_id = ea.id
          WHERE ea.id = ? AND ea.student_id = ? LIMIT 1`).bind(row.payment_reference_id, row.student_id)
          .first<{ status: string; payment_status: string; paid_at: string | null; paid_by: string | null; cycle_id: string; cycle_status_id: string | null; cycle_status: string | null }>();
        if (!target) throw new Error(`The examination application for ${row.public_student_id} no longer exists.`);
        statements.push(
          db.prepare("UPDATE examination_applications SET payment_status = 'paid', paid_at = COALESCE(paid_at, ?), paid_by = COALESCE(paid_by, ?), updated_at = ? WHERE id = ?")
            .bind(now, session.adminName, now, row.payment_reference_id),
          db.prepare(`INSERT INTO application_status_history
            (id, application_id, previous_status, new_status, previous_payment_status, new_payment_status,
             actor_identifier, note, bulk_operation_id, request_id, created_at) VALUES (?, ?, ?, ?, ?, 'paid', ?, ?, ?, ?, ?)`)
            .bind(crypto.randomUUID(), row.payment_reference_id, target.status, target.status, target.payment_status, session.adminName, note || "Payslip approved", bulkOperationId, requestId, now),
        );
        if (target.cycle_status_id) statements.push(
          db.prepare("UPDATE exam_cycle_student_status SET status = 'paid', updated_at = ?, updated_by = ? WHERE id = ?")
            .bind(now, session.adminName, target.cycle_status_id),
          db.prepare(`INSERT INTO exam_cycle_status_history
            (id, cycle_status_id, previous_status, new_status, actor_identifier, bulk_operation_id, request_id, note, created_at)
            VALUES (?, ?, ?, 'paid', ?, ?, ?, 'Payment proof approved', ?)`)
            .bind(crypto.randomUUID(), target.cycle_status_id, target.cycle_status, session.adminName, bulkOperationId, requestId, now),
        );
      } else if (action === "approve" && row.payment_type === "renshinkan_monthly") {
        const target = await db.prepare("SELECT status, month_key, internal_note FROM monthly_contributions WHERE id = ? AND student_id = ? LIMIT 1")
          .bind(row.payment_reference_id, row.student_id).first<{ status: string; month_key: string; internal_note: string }>();
        if (!target) throw new Error(`The monthly contribution for ${row.public_student_id} no longer exists.`);
        statements.push(
          db.prepare("UPDATE monthly_contributions SET status = 'paid', paid_at = ?, paid_by = ?, status_updated_at = ?, status_updated_by = ?, updated_at = ? WHERE id = ?")
            .bind(now, session.adminName, now, session.adminName, now, row.payment_reference_id),
          db.prepare(`INSERT INTO contribution_status_history
            (id, contribution_id, previous_status, new_status, actor_identifier, bulk_operation_id, request_id, note, created_at)
            VALUES (?, ?, ?, 'paid', ?, ?, ?, ?, ?)`)
            .bind(crypto.randomUUID(), row.payment_reference_id, target.status, session.adminName, bulkOperationId, requestId, note || "Payslip approved", now),
          db.prepare(`INSERT INTO payments (id, student_id, dojo_id, payment_type, amount, currency, payment_date,
            status, reference, notes, recorded_by, created_at, updated_at)
            VALUES (?, ?, ?, 'renshinkan_monthly', NULL, 'THB', ?, 'paid', ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET payment_date = excluded.payment_date, status = 'paid',
              notes = excluded.notes, recorded_by = excluded.recorded_by, updated_at = excluded.updated_at`)
            .bind(row.payment_reference_id, row.student_id, row.dojo_id, paymentDate, `Payslip ${row.id}`, note || target.internal_note, session.adminName, now, now),
          db.prepare("INSERT INTO payment_history (id, payment_id, previous_status, new_status, changed_by, notes, created_at) VALUES (?, ?, ?, 'paid', ?, ?, ?)")
            .bind(crypto.randomUUID(), row.payment_reference_id, target.status === "paid" ? "paid" : "awaiting_payment", session.adminName, note || "Payslip approved", now),
        );
      } else if (action === "approve" && row.payment_type === "aat_annual") {
        const target = await db.prepare(`SELECT p.status, p.amount, p.notes, s.aat_number, s.aat_last_paid_date, s.aat_notes
          FROM payments p JOIN students s ON s.id = p.student_id WHERE p.id = ? AND p.student_id = ? AND p.payment_type = 'aat_annual' LIMIT 1`)
          .bind(row.payment_reference_id, row.student_id)
          .first<{ status: string; amount: number | null; notes: string; aat_number: string | null; aat_last_paid_date: string | null; aat_notes: string }>();
        if (!target) throw new Error(`The AAT annual contribution for ${row.public_student_id} no longer exists.`);
        const renewalDueDate = addOneCalendarYear(paymentDate)!;
        statements.push(
          db.prepare(`UPDATE students SET aat_last_paid_date = CASE WHEN aat_last_paid_date IS NULL OR aat_last_paid_date < ? THEN ? ELSE aat_last_paid_date END,
            updated_at = ? WHERE id = ?`).bind(paymentDate, paymentDate, now, row.student_id),
          db.prepare(`INSERT OR IGNORE INTO aat_membership_payments
            (id, student_id, dojo_id, payment_date, renewal_due_date, amount, currency, notes,
             recorded_by, recorded_by_role, recorded_by_dojo_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 'THB', ?, ?, ?, ?, ?)`)
            .bind(row.payment_reference_id, row.student_id, row.dojo_id, paymentDate, renewalDueDate, target.amount,
              note || target.notes, session.adminName, isRenShinKanSuperAdmin(session) ? "central" : "dojo", session.selectedDojoId || row.dojo_id, now),
          db.prepare("UPDATE payments SET payment_date = ?, status = 'paid', reference = ?, notes = ?, recorded_by = ?, updated_at = ? WHERE id = ?")
            .bind(paymentDate, `Payslip ${row.id}`, note || target.notes, session.adminName, now, row.payment_reference_id),
          db.prepare("INSERT INTO payment_history (id, payment_id, previous_status, new_status, changed_by, notes, created_at) VALUES (?, ?, ?, 'paid', ?, ?, ?)")
            .bind(crypto.randomUUID(), row.payment_reference_id, target.status, session.adminName, note || "Payslip approved", now),
        );
      }

      statements.push(
        db.prepare(`UPDATE payment_proofs SET status = ?, reviewed_at = ?, reviewed_by = ?, review_note = ?, updated_at = ?
          WHERE id = ? AND status = 'pending_review'`).bind(action === "approve" ? "approved" : "denied", now, session.adminName, note, now, row.id),
        auditStatement(db, {
          actorType: "administrator", ...adminAuditMetadata(session, request), action: action === "approve" ? "payment_proof_approved" : "payment_proof_denied",
          entityType: "payment_proof", entityId: row.id, studentId: row.student_id, studentPublicId: row.public_student_id,
          studentNameSnapshot: row.student_name, previousValues: { status: row.status },
          newValues: { status: action === "approve" ? "approved" : "denied", paymentType: row.payment_type },
          source: "admin_payment_proofs", bulkOperationId, requestId, administratorNote: note || null,
          summary: `${action === "approve" ? "Approved" : "Denied"} ${row.payment_type.replace(/_/g, " ")} payslip for ${row.public_student_id}`, createdAt: now,
        }),
      );
    }
    await db.batch(statements);
    return jsonResponse({ ok: true, action, count: rows.length, bulkOperationId }, 200, { "Cache-Control": "no-store" });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "The payslip review could not be completed." }, 400);
  }
};
