import { aatMembershipStatus, addOneCalendarYear } from "../../../shared/membership";
import { canAccessDojo, getAuthorizedAdminSession, isRenShinKanSuperAdmin, isSameOriginRequest, jsonResponse } from "../../_lib/auth";
import { adminAuditMetadata, assertStudentAccess, auditStatement, requestIdentifier, requireStudentDb, type StudentEnv } from "../../_lib/studentRecords";

type Env = StudentEnv & { SESSION_SECRET?: string };

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, max + 1) : "";
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const session = await getAuthorizedAdminSession(request, env);
  if (!session) return jsonResponse({ error: "Unauthorized" }, 401);
  const db = requireStudentDb(env);
  const url = new URL(request.url);
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1);
  const pageSize = 40;
  const query = clean(url.searchParams.get("query"), 120);
  const requestedDojoId = clean(url.searchParams.get("dojoId"), 80);
  const dojoId = isRenShinKanSuperAdmin(session) ? requestedDojoId : session.selectedDojoId;
  if (dojoId && !canAccessDojo(session, dojoId)) return jsonResponse({ error: "You do not have access to that dojo." }, 403);
  const conditions = ["s.deleted_at IS NULL"];
  const bindings: unknown[] = [];
  if (dojoId) { conditions.push("s.dojo_id = ?"); bindings.push(dojoId); }
  if (query) {
    const term = `%${escapeLike(query)}%`;
    conditions.push("(s.display_name LIKE ? ESCAPE '\\' COLLATE NOCASE OR s.public_student_id LIKE ? ESCAPE '\\' COLLATE NOCASE OR COALESCE(s.aat_number, '') LIKE ? ESCAPE '\\' COLLATE NOCASE)");
    bindings.push(term, term, term);
  }
  const today = new Date().toISOString().slice(0, 10);
  const dueDateSql = `CASE WHEN strftime('%m-%d', s.aat_last_paid_date) = '02-29'
    THEN date(s.aat_last_paid_date, '+1 year', 'start of month', '-1 day')
    ELSE date(s.aat_last_paid_date, '+1 year') END`;
  const stateSql = `CASE
    WHEN s.aat_last_paid_date IS NULL OR s.aat_last_paid_date = '' THEN CASE WHEN COALESCE(TRIM(s.aat_number), '') = '' THEN 'new' ELSE 'unpaid' END
    WHEN ${dueDateSql} < ? THEN 'expired'
    WHEN ${dueDateSql} <= date(?, '+45 days') THEN 'expiring'
    ELSE 'current' END`;
  const statusFilter = clean(url.searchParams.get("status"), 30);
  if (statusFilter === "pending_payment") {
    conditions.push(`EXISTS(SELECT 1 FROM payments pending WHERE pending.student_id = s.id
      AND pending.payment_type = 'aat_annual' AND pending.status = 'awaiting_payment')`);
  } else if (["payment_required", "new", "unpaid", "expired", "expiring", "current"].includes(statusFilter)) {
    if (statusFilter === "payment_required") conditions.push(`(${stateSql}) IN ('new', 'unpaid')`);
    else if (statusFilter === "new" || statusFilter === "unpaid") conditions.push(`(${stateSql}) IN ('new', 'unpaid')`);
    else conditions.push(`(${stateSql}) = ?`);
    bindings.push(today, today);
    if (!["payment_required", "new", "unpaid"].includes(statusFilter)) bindings.push(statusFilter);
  }
  const whereSql = conditions.join(" AND ");
  const total = Number((await db.prepare(`SELECT COUNT(*) AS total FROM students s WHERE ${whereSql}`)
    .bind(...bindings).first<{ total: number }>())?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const rows = (await db.prepare(`SELECT s.id, s.display_name, s.public_student_id, s.current_belt, s.profile_image_url,
      s.dojo_id, d.official_name AS dojo_name, s.aat_number, s.aat_last_paid_date, s.aat_notes,
      EXISTS(SELECT 1 FROM payments pending WHERE pending.student_id = s.id
        AND pending.payment_type = 'aat_annual' AND pending.status = 'awaiting_payment') AS payment_awaiting_review,
      (SELECT json_group_array(json_object('id', ap.id, 'paymentDate', ap.payment_date,
        'renewalDueDate', ap.renewal_due_date, 'amount', ap.amount, 'currency', ap.currency,
        'notes', ap.notes, 'recordedBy', ap.recorded_by, 'createdAt', ap.created_at,
        'paymentStatus', COALESCE(ledger.status, 'paid')))
       FROM aat_membership_payments ap LEFT JOIN payments ledger ON ledger.id = ap.id
       WHERE ap.student_id = s.id ORDER BY ap.payment_date DESC) AS history_json
    FROM students s JOIN dojos d ON d.id = s.dojo_id
    WHERE ${whereSql} ORDER BY s.display_name COLLATE NOCASE, s.public_student_id COLLATE NOCASE
    LIMIT ? OFFSET ?`).bind(...bindings, pageSize, (safePage - 1) * pageSize).all<Record<string, unknown>>()).results || [];
  const mapped = rows.map((row) => {
    const membership = aatMembershipStatus(String(row.aat_number || ""), String(row.aat_last_paid_date || ""));
    let history: unknown[] = [];
    try { history = JSON.parse(String(row.history_json || "[]")); } catch { history = []; }
    return { ...row, aatDisplay: row.aat_number || "NEW", membership, history, history_json: undefined };
  });
  return jsonResponse({
    memberships: mapped,
    pagination: { page: safePage, pageSize, total, totalPages },
  }, 200, { "Cache-Control": "no-store" });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Forbidden" }, 403);
  const session = await getAuthorizedAdminSession(request, env);
  if (!session) return jsonResponse({ error: "Unauthorized" }, 401);
  try {
    const body = await request.json<Record<string, unknown>>();
    if (body.action === "mark_unpaid") {
      if (body.confirmed !== true) return jsonResponse({ error: "Confirm removal of the paid status." }, 400);
      const studentId = clean(body.studentId, 80);
      const paymentId = clean(body.paymentId, 120);
      const reason = clean(body.reason, 2_000);
      if (!studentId || !paymentId) return jsonResponse({ error: "Choose the exact student and payment to reverse." }, 400);
      const db = requireStudentDb(env);
      const access = await assertStudentAccess(db, session, studentId);
      if (!access.ok) return jsonResponse({ error: access.error }, access.status);
      const payment = await db.prepare(`SELECT p.id, p.student_id, p.dojo_id, p.payment_date, p.status,
          s.display_name, s.public_student_id, s.aat_last_paid_date
        FROM payments p JOIN students s ON s.id = p.student_id
        WHERE p.id = ? AND p.student_id = ? AND p.payment_type = 'aat_annual' LIMIT 1`)
        .bind(paymentId, studentId).first<{
          id: string; student_id: string; dojo_id: string; payment_date: string | null; status: string;
          display_name: string; public_student_id: string; aat_last_paid_date: string | null;
        }>();
      if (!payment) return jsonResponse({ error: "That AAT payment does not exist for this student." }, 404);
      if (payment.status !== "paid") return jsonResponse({ error: "Only a payment currently marked paid can be reversed." }, 409);
      const latestRemaining = await db.prepare(`SELECT payment_date FROM payments
        WHERE student_id = ? AND payment_type = 'aat_annual' AND status = 'paid' AND id <> ?
        ORDER BY payment_date DESC, created_at DESC LIMIT 1`)
        .bind(studentId, paymentId).first<{ payment_date: string | null }>();
      const previousPaidDate = payment.aat_last_paid_date;
      const nextPaidDate = latestRemaining?.payment_date || null;
      const now = new Date().toISOString();
      const requestId = requestIdentifier(request);
      const historyNote = reason || "Paid status removed by administrator";
      await db.batch([
        db.prepare("UPDATE payments SET status = 'cancelled', updated_at = ? WHERE id = ? AND status = 'paid'")
          .bind(now, paymentId),
        db.prepare(`UPDATE payment_request_items SET status = 'cancelled', updated_at = ?
          WHERE payment_reference_id = ? AND status = 'paid'`).bind(now, paymentId),
        db.prepare(`UPDATE payment_requests SET status = 'cancelled', updated_at = ?
          WHERE id IN (SELECT payment_request_id FROM payment_request_items WHERE payment_reference_id = ?)
            AND NOT EXISTS (
              SELECT 1 FROM payment_request_items remaining
              WHERE remaining.payment_request_id = payment_requests.id
                AND remaining.status NOT IN ('cancelled', 'refunded')
            )`).bind(now, paymentId),
        db.prepare("UPDATE students SET aat_last_paid_date = ?, updated_at = ? WHERE id = ?")
          .bind(nextPaidDate, now, studentId),
        db.prepare(`INSERT INTO payment_history (id, payment_id, previous_status, new_status, changed_by, notes, created_at)
          VALUES (?, ?, 'paid', 'cancelled', ?, ?, ?)`)
          .bind(crypto.randomUUID(), paymentId, session.adminName, historyNote, now),
        auditStatement(db, {
          actorType: "administrator", ...adminAuditMetadata(session, request), action: "aat_membership_paid_status_removed",
          entityType: "aat_membership_payment", entityId: paymentId, studentId,
          studentPublicId: payment.public_student_id, studentNameSnapshot: payment.display_name,
          previousValues: { paymentStatus: "paid", latestPaidDate: previousPaidDate },
          newValues: { paymentStatus: "cancelled", latestPaidDate: nextPaidDate, reason: reason || null },
          source: "admin_aat_membership", requestId, administratorNote: reason || null,
          summary: `Removed paid status from AAT payment for ${payment.public_student_id}`, createdAt: now,
        }),
      ]);
      return jsonResponse({ ok: true, paymentId, status: "cancelled", latestPaidDate: nextPaidDate }, 200, { "Cache-Control": "no-store" });
    }
    if (body.action !== "mark_paid" || body.confirmed !== true) return jsonResponse({ error: "Confirm the annual membership payment." }, 400);
    const studentId = clean(body.studentId, 80);
    const paymentDate = clean(body.paymentDate, 10);
    const aatNumber = clean(body.aatNumber, 40) || null;
    const notes = clean(body.notes, 2_000);
    const amount = body.amount === "" || body.amount == null ? null : Number(body.amount);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate) || !addOneCalendarYear(paymentDate)) return jsonResponse({ error: "Choose a valid payment date." }, 400);
    if (amount !== null && (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000)) return jsonResponse({ error: "Enter a valid payment amount." }, 400);
    const db = requireStudentDb(env);
    const access = await assertStudentAccess(db, session, studentId);
    if (!access.ok) return jsonResponse({ error: access.error }, access.status);
    const student = await db.prepare(`SELECT id, dojo_id, display_name, public_student_id, aat_number,
      aat_last_paid_date, aat_notes FROM students WHERE id = ? LIMIT 1`).bind(studentId).first<{
        id: string; dojo_id: string; display_name: string; public_student_id: string;
        aat_number: string | null; aat_last_paid_date: string | null; aat_notes: string;
      }>();
    if (!student) return jsonResponse({ error: "Student not found" }, 404);
    const now = new Date().toISOString();
    const dueDate = addOneCalendarYear(paymentDate)!;
    const pendingPayment = await db.prepare(`SELECT id FROM payments WHERE student_id = ? AND payment_type = 'aat_annual'
      AND status = 'awaiting_payment' ORDER BY created_at DESC LIMIT 1`).bind(studentId).first<{ id: string }>();
    const paymentId = pendingPayment?.id || crypto.randomUUID();
    const requestId = requestIdentifier(request);
    await db.batch([
      db.prepare("UPDATE students SET aat_number = ?, aat_last_paid_date = ?, aat_notes = ?, updated_at = ? WHERE id = ?")
        .bind(aatNumber ?? student.aat_number, paymentDate, notes || student.aat_notes, now, studentId),
      db.prepare(`INSERT INTO aat_membership_payments
        (id, student_id, dojo_id, payment_date, renewal_due_date, amount, currency, notes,
         recorded_by, recorded_by_role, recorded_by_dojo_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'THB', ?, ?, ?, ?, ?)`)
        .bind(paymentId, studentId, student.dojo_id, paymentDate, dueDate, amount, notes, session.adminName, isRenShinKanSuperAdmin(session) ? "central" : "dojo", session.selectedDojoId, now),
      db.prepare(`INSERT INTO payments
        (id, student_id, dojo_id, payment_type, amount, currency, payment_date, status, reference, notes, recorded_by, created_at, updated_at)
        VALUES (?, ?, ?, 'aat_annual', ?, 'THB', ?, 'paid', ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET amount = excluded.amount, payment_date = excluded.payment_date,
          status = 'paid', reference = excluded.reference, notes = excluded.notes,
          recorded_by = excluded.recorded_by, updated_at = excluded.updated_at`)
        .bind(paymentId, studentId, student.dojo_id, amount, paymentDate, `AAT ${paymentDate}`, notes, session.adminName, now, now),
      db.prepare(`INSERT INTO payment_history (id, payment_id, previous_status, new_status, changed_by, notes, created_at)
        VALUES (?, ?, ?, 'paid', ?, ?, ?)`)
        .bind(crypto.randomUUID(), paymentId, pendingPayment ? "awaiting_payment" : null, session.adminName, notes || null, now),
      auditStatement(db, {
        actorType: "administrator", ...adminAuditMetadata(session, request), action: "aat_membership_marked_paid",
        entityType: "aat_membership_payment", entityId: paymentId, studentId,
        studentPublicId: student.public_student_id, studentNameSnapshot: student.display_name,
        previousValues: { aatNumber: student.aat_number, lastPaidDate: student.aat_last_paid_date },
        newValues: { aatNumber: aatNumber ?? student.aat_number, paymentDate, renewalDueDate: dueDate, amount, notes },
        source: "admin_aat_membership", requestId, summary: `Recorded AAT annual membership payment for ${student.public_student_id}`, createdAt: now,
      }),
    ]);
    return jsonResponse({ ok: true, paymentId, renewalDueDate: dueDate }, 201, { "Cache-Control": "no-store" });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "The payment could not be recorded." }, 400);
  }
};
