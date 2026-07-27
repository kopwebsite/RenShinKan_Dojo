import { addOneCalendarYear } from "../../../shared/membership";
import { bangkokCanonicalDate } from "../../../shared/date";
import { getAuthorizedAdminSession, isRenShinKanSuperAdmin, isSameOriginRequest, jsonResponse } from "../../_lib/auth";
import {
  adminAuditMetadata, auditStatement, requestIdentifier, requireStudentDb,
  type D1PreparedStatement, type StudentEnv,
} from "../../_lib/studentRecords";
import type { R2Bucket } from "../../_lib/storage";

type Env = StudentEnv & { SESSION_SECRET?: string; MEDIA_BUCKET?: R2Bucket };
type ProofRow = {
  id: string; student_id: string; dojo_id: string; payment_type: "exam" | "aat_annual" | "renshinkan_monthly";
  payment_reference_id: string; status: string; submitted_at: string;
  student_name: string; public_student_id: string; dojo_name: string;
  student_visible_note: string; internal_admin_note: string;
  covered_student_count: number; covered_students: string;
};

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
  const pageSize = 25;
  const query = clean(url.searchParams.get("query"), 120);
  const status = ["pending_review", "approved", "denied"].includes(String(url.searchParams.get("status"))) ? String(url.searchParams.get("status")) : "";
  const paymentType = ["exam", "aat_annual", "renshinkan_monthly"].includes(String(url.searchParams.get("paymentType"))) ? String(url.searchParams.get("paymentType")) : "";
  const conditions = ["p.object_key IS NOT NULL", "p.submitted_at IS NOT NULL"];
  const bindings: unknown[] = [];
  if (!isRenShinKanSuperAdmin(session)) {
    const dojoId = session.selectedDojoId || "__none__";
    conditions.push(
      "s.dojo_id = ?",
      "p.payment_type <> 'renshinkan_monthly'",
      `(p.payment_type <> 'aat_annual' OR NOT EXISTS (
        SELECT 1 FROM payment_request_items scoped_item
        WHERE scoped_item.payment_request_id = p.payment_reference_id AND scoped_item.dojo_id <> ?
      ))`,
    );
    bindings.push(dojoId, dojoId);
  }
  if (status) { conditions.push("p.status = ?"); bindings.push(status); }
  if (paymentType) { conditions.push("p.payment_type = ?"); bindings.push(paymentType); }
  if (query) {
    const term = `%${escapeLike(query)}%`;
    conditions.push(`(s.display_name LIKE ? ESCAPE '\\' COLLATE NOCASE OR s.public_student_id LIKE ? ESCAPE '\\' COLLATE NOCASE
      OR EXISTS (SELECT 1 FROM monthly_contributions mc WHERE mc.payment_group_id = p.payment_reference_id
        AND (mc.student_name_snapshot LIKE ? ESCAPE '\\' COLLATE NOCASE OR mc.student_public_id_snapshot LIKE ? ESCAPE '\\' COLLATE NOCASE))
      OR EXISTS (SELECT 1 FROM payment_request_items pri JOIN students ps ON ps.id = pri.student_id
        WHERE pri.payment_request_id = p.payment_reference_id
        AND (ps.display_name LIKE ? ESCAPE '\\' COLLATE NOCASE OR ps.public_student_id LIKE ? ESCAPE '\\' COLLATE NOCASE)))`);
    bindings.push(term, term, term, term, term, term);
  }
  const where = conditions.join(" AND ");
  const scope = isRenShinKanSuperAdmin(session) ? "" : `AND s.dojo_id = ? AND p.payment_type <> 'renshinkan_monthly'
    AND (p.payment_type <> 'aat_annual' OR NOT EXISTS (
      SELECT 1 FROM payment_request_items scoped_item
      WHERE scoped_item.payment_request_id = p.payment_reference_id AND scoped_item.dojo_id <> ?
    ))`;
  const scopeBindings = isRenShinKanSuperAdmin(session) ? [] : [session.selectedDojoId || "__none__", session.selectedDojoId || "__none__"];
  const [countResult, rowResult, summaryResult] = await db.batch([
    db.prepare(`SELECT COUNT(*) AS total FROM payment_proofs p JOIN students s ON s.id = p.student_id WHERE ${where}`).bind(...bindings),
    db.prepare(`SELECT p.id, p.student_id, p.dojo_id, p.payment_type, p.payment_reference_id, p.status,
        p.submitted_at, p.reviewed_at, p.reviewed_by, p.student_visible_note, p.internal_admin_note,
        p.content_type, p.original_filename,
        s.display_name AS student_name, s.public_student_id, s.profile_image_url, d.official_name AS dojo_name,
        CASE WHEN p.payment_type IN ('renshinkan_monthly', 'aat_annual') THEN MAX(1, (SELECT COUNT(*) FROM payment_request_items pri WHERE pri.payment_request_id = p.payment_reference_id)) ELSE 1 END AS covered_student_count,
        CASE WHEN p.payment_type = 'aat_annual' THEN COALESCE((SELECT GROUP_CONCAT(ps.display_name || ' (' || ps.public_student_id || ')', ', ')
          FROM payment_request_items pri JOIN students ps ON ps.id = pri.student_id WHERE pri.payment_request_id = p.payment_reference_id), s.display_name || ' (' || s.public_student_id || ')')
        WHEN p.payment_type = 'renshinkan_monthly' THEN COALESCE((SELECT GROUP_CONCAT(mc.student_name_snapshot || ' (' || mc.student_public_id_snapshot || ')', ', ')
          FROM monthly_contributions mc WHERE mc.payment_group_id = p.payment_reference_id), s.display_name || ' (' || s.public_student_id || ')')
          ELSE s.display_name || ' (' || s.public_student_id || ')' END AS covered_students
      FROM payment_proofs p JOIN students s ON s.id = p.student_id JOIN dojos d ON d.id = s.dojo_id
      WHERE ${where} ORDER BY p.submitted_at DESC, p.id DESC LIMIT ? OFFSET ?`)
      .bind(...bindings, pageSize, (page - 1) * pageSize),
    db.prepare(`SELECT COUNT(*) AS total,
        SUM(CASE WHEN p.status = 'pending_review' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN p.status = 'approved' THEN 1 ELSE 0 END) AS approved,
        SUM(CASE WHEN p.status = 'denied' THEN 1 ELSE 0 END) AS denied
      FROM payment_proofs p JOIN students s ON s.id = p.student_id
      WHERE p.object_key IS NOT NULL AND p.submitted_at IS NOT NULL ${scope}`)
      .bind(...scopeBindings),
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
    const body = await request.json<{ action?: unknown; proofIds?: unknown; studentVisibleNote?: unknown; internalNote?: unknown }>();
    const action = body.action === "approve" || body.action === "deny" ? body.action : "";
    const studentVisibleNote = clean(body.studentVisibleNote, 2000);
    const internalNote = clean(body.internalNote, 2000);
    const proofIds = Array.isArray(body.proofIds)
      ? Array.from(new Set(body.proofIds.filter((value): value is string => typeof value === "string" && value.length >= 8))).slice(0, 25)
      : [];
    if (!action || !proofIds.length) return jsonResponse({ error: "Select at least one submitted payslip and choose approve or deny." }, 400);
    if (action === "deny" && !studentVisibleNote) return jsonResponse({ error: "Add a short explanation that the student can see." }, 400);
    const placeholders = proofIds.map(() => "?").join(",");
    const scope = isRenShinKanSuperAdmin(session) ? "" : `AND s.dojo_id = ? AND p.payment_type <> 'renshinkan_monthly'
      AND (p.payment_type <> 'aat_annual' OR NOT EXISTS (
        SELECT 1 FROM payment_request_items scoped_item
        WHERE scoped_item.payment_request_id = p.payment_reference_id AND scoped_item.dojo_id <> ?
      ))`;
    const rows = (await db.prepare(`SELECT p.id, p.student_id, p.dojo_id, p.payment_type, p.payment_reference_id,
        p.status, p.submitted_at, p.student_visible_note, p.internal_admin_note,
        s.display_name AS student_name, s.public_student_id, d.official_name AS dojo_name,
        CASE WHEN p.payment_type IN ('renshinkan_monthly', 'aat_annual') THEN MAX(1, (SELECT COUNT(*) FROM payment_request_items pri WHERE pri.payment_request_id = p.payment_reference_id)) ELSE 1 END AS covered_student_count,
        CASE WHEN p.payment_type = 'aat_annual' THEN COALESCE((SELECT GROUP_CONCAT(ps.display_name || ' (' || ps.public_student_id || ')', ', ')
          FROM payment_request_items pri JOIN students ps ON ps.id = pri.student_id WHERE pri.payment_request_id = p.payment_reference_id), s.display_name || ' (' || s.public_student_id || ')')
        WHEN p.payment_type = 'renshinkan_monthly' THEN COALESCE((SELECT GROUP_CONCAT(mc.student_name_snapshot || ' (' || mc.student_public_id_snapshot || ')', ', ')
          FROM monthly_contributions mc WHERE mc.payment_group_id = p.payment_reference_id), s.display_name || ' (' || s.public_student_id || ')')
          ELSE s.display_name || ' (' || s.public_student_id || ')' END AS covered_students
      FROM payment_proofs p JOIN students s ON s.id = p.student_id JOIN dojos d ON d.id = s.dojo_id
      WHERE p.id IN (${placeholders}) AND p.status = 'pending_review' AND p.object_key IS NOT NULL ${scope}`)
      .bind(...proofIds, ...(isRenShinKanSuperAdmin(session) ? [] : [session.selectedDojoId || "__none__", session.selectedDojoId || "__none__"]))
      .all<ProofRow>()).results || [];
    if (rows.length !== proofIds.length) return jsonResponse({ error: "One or more selected payslips is unavailable, already reviewed, or outside your dojo." }, 409);

    const now = new Date().toISOString();
    const paymentDate = bangkokCanonicalDate(new Date(now));
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
        if (target.status !== "application_submitted") throw new Error(`The examination application for ${row.public_student_id} has already been processed.`);
        statements.push(
          db.prepare("UPDATE examination_applications SET payment_status = 'paid', paid_at = COALESCE(paid_at, ?), paid_by = COALESCE(paid_by, ?), updated_at = ? WHERE id = ?")
            .bind(now, session.adminName, now, row.payment_reference_id),
          db.prepare(`INSERT INTO application_status_history
            (id, application_id, previous_status, new_status, previous_payment_status, new_payment_status,
             actor_identifier, note, bulk_operation_id, request_id, created_at) VALUES (?, ?, ?, ?, ?, 'paid', ?, ?, ?, ?, ?)`)
            .bind(crypto.randomUUID(), row.payment_reference_id, target.status, target.status, target.payment_status, session.adminName, internalNote || "Payslip approved", bulkOperationId, requestId, now),
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
        const targets = (await db.prepare(`SELECT id, student_id, status, month_key, internal_note, expected_amount
          FROM monthly_contributions
          WHERE payment_group_id = ? OR (id = ? AND student_id = ?)
          ORDER BY student_public_id_snapshot`).bind(row.payment_reference_id, row.payment_reference_id, row.student_id)
          .all<{ id: string; student_id: string; status: string; month_key: string; internal_note: string; expected_amount: number | null }>()).results || [];
        if (!targets.length) throw new Error(`The monthly contribution for ${row.public_student_id} no longer exists.`);
        for (const target of targets) {
          if (target.expected_amount === null || !Number.isFinite(Number(target.expected_amount))) {
            throw new Error(`The configured monthly amount for ${target.month_key} is missing. Set it before approving this payslip.`);
          }
          statements.push(
          db.prepare("UPDATE monthly_contributions SET status = 'paid', paid_at = ?, paid_by = ?, status_updated_at = ?, status_updated_by = ?, updated_at = ? WHERE id = ?")
            .bind(now, session.adminName, now, session.adminName, now, target.id),
          db.prepare(`INSERT INTO contribution_status_history
            (id, contribution_id, previous_status, new_status, actor_identifier, bulk_operation_id, request_id, note, created_at)
            VALUES (?, ?, ?, 'paid', ?, ?, ?, ?, ?)`)
            .bind(crypto.randomUUID(), target.id, target.status, session.adminName, bulkOperationId, requestId, internalNote || "Shared payslip approved", now),
          db.prepare(`INSERT INTO payments (id, student_id, dojo_id, payment_type, amount, currency, payment_date,
            status, reference, notes, recorded_by, created_at, updated_at)
            VALUES (?, ?, ?, 'renshinkan_monthly', ?, 'THB', ?, 'paid', ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET amount = excluded.amount, payment_date = excluded.payment_date, status = 'paid',
              notes = excluded.notes, recorded_by = excluded.recorded_by, updated_at = excluded.updated_at`)
            .bind(target.id, target.student_id, row.dojo_id, Number(target.expected_amount), paymentDate, `Payslip ${row.id}`, internalNote || target.internal_note, session.adminName, now, now),
          db.prepare("INSERT INTO payment_history (id, payment_id, previous_status, new_status, changed_by, notes, created_at) VALUES (?, ?, ?, 'paid', ?, ?, ?)")
            .bind(crypto.randomUUID(), target.id, target.status === "paid" ? "paid" : "awaiting_payment", session.adminName, internalNote || "Shared payslip approved", now),
          );
        }
      } else if (action === "approve" && row.payment_type === "aat_annual") {
        const groupTargets = (await db.prepare(`SELECT pri.id AS item_id, pri.payment_request_id, pri.payment_reference_id,
            pri.student_id, pri.dojo_id, pri.status AS item_status, p.status, p.amount, p.notes,
            s.public_student_id, s.display_name
          FROM payment_request_items pri
          JOIN payments p ON p.id = pri.payment_reference_id AND p.payment_type = 'aat_annual'
          JOIN students s ON s.id = pri.student_id
          WHERE pri.payment_request_id = ? ORDER BY s.public_student_id`).bind(row.payment_reference_id)
          .all<{
            item_id: string; payment_request_id: string; payment_reference_id: string; student_id: string; dojo_id: string;
            item_status: string; status: string; amount: number | null; notes: string;
            public_student_id: string; display_name: string;
          }>()).results || [];
        const targets = groupTargets.length ? groupTargets : (await db.prepare(`SELECT '' AS item_id, '' AS payment_request_id,
            p.id AS payment_reference_id, p.student_id, p.dojo_id, '' AS item_status, p.status, p.amount, p.notes,
            s.public_student_id, s.display_name
          FROM payments p JOIN students s ON s.id = p.student_id
          WHERE p.id = ? AND p.student_id = ? AND p.payment_type = 'aat_annual' LIMIT 1`)
          .bind(row.payment_reference_id, row.student_id).all<typeof groupTargets[number]>()).results || [];
        if (!targets.length) throw new Error(`The AAT annual contribution for ${row.public_student_id} no longer exists.`);
        const renewalDueDate = addOneCalendarYear(paymentDate)!;
        for (const target of targets) {
          statements.push(
            db.prepare(`UPDATE students SET aat_last_paid_date = CASE WHEN aat_last_paid_date IS NULL OR aat_last_paid_date < ? THEN ? ELSE aat_last_paid_date END,
              aat_membership_verification_status = 'confirmed', updated_at = ? WHERE id = ?`)
              .bind(paymentDate, paymentDate, now, target.student_id),
            db.prepare(`INSERT OR IGNORE INTO aat_membership_payments
              (id, student_id, dojo_id, payment_date, renewal_due_date, amount, currency, notes,
               recorded_by, recorded_by_role, recorded_by_dojo_id, created_at)
              VALUES (?, ?, ?, ?, ?, ?, 'THB', ?, ?, ?, ?, ?)`)
              .bind(target.payment_reference_id, target.student_id, target.dojo_id, paymentDate, renewalDueDate, target.amount,
                internalNote || target.notes, session.adminName, isRenShinKanSuperAdmin(session) ? "central" : "dojo", session.selectedDojoId || target.dojo_id, now),
            db.prepare("UPDATE payments SET payment_date = ?, status = 'paid', reference = ?, notes = ?, recorded_by = ?, updated_at = ? WHERE id = ?")
              .bind(paymentDate, `Payslip ${row.id}`, internalNote || target.notes, session.adminName, now, target.payment_reference_id),
            db.prepare("INSERT INTO payment_history (id, payment_id, previous_status, new_status, changed_by, notes, created_at) VALUES (?, ?, ?, 'paid', ?, ?, ?)")
              .bind(crypto.randomUUID(), target.payment_reference_id, target.status, session.adminName, internalNote || "Shared payslip approved", now),
            auditStatement(db, {
              actorType: "administrator", ...adminAuditMetadata(session, request), action: "aat_contribution_approved",
              entityType: "payment", entityId: target.payment_reference_id, studentId: target.student_id,
              studentPublicId: target.public_student_id, studentNameSnapshot: target.display_name,
              previousValues: { status: target.status },
              newValues: { status: "paid", amount: target.amount, paymentDate, renewalDueDate, paymentRequestId: target.payment_request_id || null },
              source: "admin_payment_proofs", bulkOperationId, requestId, administratorNote: internalNote || null,
              summary: `Approved AAT annual contribution for ${target.public_student_id}`, createdAt: now,
            }),
          );
          if (target.item_id) statements.push(
            db.prepare("UPDATE payment_request_items SET status = 'paid', next_due_date = ?, updated_at = ? WHERE id = ?")
              .bind(renewalDueDate, now, target.item_id),
          );
        }
        if (groupTargets.length) statements.push(
          db.prepare("UPDATE payment_requests SET status = 'approved', updated_at = ? WHERE id = ?")
            .bind(now, row.payment_reference_id),
        );
      }

      if (action === "deny" && (row.payment_type === "aat_annual" || row.payment_type === "renshinkan_monthly")) {
        statements.push(
          db.prepare("UPDATE payment_requests SET status = 'denied', updated_at = ? WHERE id = ?")
            .bind(now, row.payment_reference_id),
          db.prepare("UPDATE payment_request_items SET status = 'denied', updated_at = ? WHERE payment_request_id = ? AND status <> 'paid'")
            .bind(now, row.payment_reference_id),
        );
      }
      if (action === "approve" && row.payment_type === "renshinkan_monthly") {
        statements.push(
          db.prepare("UPDATE payment_requests SET status = 'approved', updated_at = ? WHERE id = ?")
            .bind(now, row.payment_reference_id),
          db.prepare("UPDATE payment_request_items SET status = 'paid', updated_at = ? WHERE payment_request_id = ?")
            .bind(now, row.payment_reference_id),
        );
      }

      statements.push(
        db.prepare(`INSERT INTO request_decisions
          (id, request_type, request_id, decision, reviewer_identifier, student_visible_note, internal_admin_note, decided_at)
          VALUES (?, 'payslip', ?, ?, ?, ?, ?, ?)`)
          .bind(crypto.randomUUID(), row.id, action === "approve" ? "approved" : "denied", session.adminName, studentVisibleNote, internalNote, now),
        db.prepare(`UPDATE payment_proofs SET status = ?, reviewed_at = ?, reviewed_by = ?, review_note = ?,
          student_visible_note = ?, internal_admin_note = ?, updated_at = ?
          WHERE id = ? AND status = 'pending_review'`).bind(
            action === "approve" ? "approved" : "denied", now, session.adminName, internalNote,
            studentVisibleNote, internalNote, now, row.id,
          ),
        auditStatement(db, {
          actorType: "administrator", ...adminAuditMetadata(session, request), action: action === "approve" ? "payment_proof_approved" : "payment_proof_denied",
          entityType: "payment_proof", entityId: row.id, studentId: row.student_id, studentPublicId: row.public_student_id,
          studentNameSnapshot: row.student_name, previousValues: { status: row.status },
          newValues: { status: action === "approve" ? "approved" : "denied", paymentType: row.payment_type, studentVisibleNote },
          source: "admin_payment_proofs", bulkOperationId, requestId, administratorNote: internalNote || null,
          summary: `${action === "approve" ? "Approved" : "Denied"} ${row.payment_type.replace(/_/g, " ")} payslip for ${row.public_student_id}`, createdAt: now,
        }),
      );
    }
    await db.batch(statements);
    return jsonResponse({ ok: true, action, count: rows.length, bulkOperationId }, 200, { "Cache-Control": "no-store" });
  } catch (error) {
    const conflict = error instanceof Error && /(?:UNIQUE constraint|request_decisions|already been processed|cannot be marked paid)/i.test(error.message);
    return jsonResponse({ error: conflict ? "Another administrator has already reviewed a selected payslip or its related request." : error instanceof Error ? error.message : "The payslip review could not be completed." }, conflict ? 409 : 400);
  }
};
