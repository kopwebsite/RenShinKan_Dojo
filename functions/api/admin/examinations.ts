import { canAccessDojo, getAuthorizedAdminSession, isRenShinKanSuperAdmin, isSameOriginRequest, jsonResponse, requiresCentralAdmin } from "../../_lib/auth";
import {
  adminAuditMetadata,
  auditStatement,
  requestIdentifier,
  requireStudentDb,
  type D1PreparedStatement,
  type StudentEnv,
} from "../../_lib/studentRecords";

type Env = StudentEnv & { SESSION_SECRET?: string };
type Cycle = { id: string; name: string; title: string; status: "active" | "closed"; lifecycle_status: string; rank_category: string; examination_type: string; application_opens_at: string | null; application_closes_at: string | null; examination_at: string | null; venue: string; instructions: string; rank_fee_config_json: string; annual_fee_config_json: string; created_at: string; closed_at: string | null };
type RosterRow = {
  status_id: string | null;
  student_id: string;
  student_name: string;
  public_student_id: string;
  current_rank: string;
  requested_rank: string | null;
  application_id: string | null;
  application_date: string | null;
  status: "not_signed_up" | "unpaid" | "paid";
  profile_image_url: string | null;
  dojo_id: string;
};

function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, max + 1) : "";
}

function cleanFeeConfig(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, number> = {};
  for (const [key, rawAmount] of Object.entries(value)) {
    const safeKey = cleanText(key, 40);
    const amount = Number(rawAmount);
    if (safeKey && Number.isFinite(amount) && amount >= 0 && amount <= 1_000_000) result[safeKey] = Math.round(amount * 100) / 100;
  }
  return result;
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

function replayResponse(value: string | null | undefined) {
  if (!value) return null;
  try { return JSON.parse(value) as Record<string, unknown>; } catch { return null; }
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const session = await getAuthorizedAdminSession(request, env);
  if (!session) return jsonResponse({ error: "Unauthorized" }, 401);
  const db = requireStudentDb(env);
  const url = new URL(request.url);
  const cycles = (await db.prepare(`SELECT id, name, title, status, lifecycle_status, rank_category, examination_type,
    application_opens_at, application_closes_at, examination_at, venue, instructions,
    rank_fee_config_json, annual_fee_config_json, created_at, closed_at
    FROM examination_cycles ORDER BY created_at DESC LIMIT 100`).all<Cycle>()).results || [];
  const requestedCycleId = cleanText(url.searchParams.get("cycleId"), 100);
  const recordsOnly = url.searchParams.get("recordsOnly") === "1";
  const selectedCycle = cycles.find((cycle) => cycle.id === requestedCycleId)
    || (recordsOnly ? cycles.find((cycle) => cycle.status === "closed") : cycles.find((cycle) => cycle.status === "active"))
    || cycles.find((cycle) => cycle.status === "active")
    || cycles[0]
    || null;
  if (!selectedCycle) {
    return jsonResponse({ cycles: [], selectedCycle: null, students: [], pagination: { page: 1, pageSize: 50, total: 0, totalPages: 1 }, summary: { total: 0, not_signed_up: 0, unpaid: 0, paid: 0 } }, 200, { "Cache-Control": "no-store" });
  }

  const query = cleanText(url.searchParams.get("query"), 120);
  const status = cleanText(url.searchParams.get("status"), 30);
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1);
  const pageSize = 50;
  const conditions: string[] = [];
  const filterBindings: unknown[] = [];
  if (recordsOnly) conditions.push("application_id IS NOT NULL");
  if (status) { conditions.push("status = ?"); filterBindings.push(status); }
  if (query) {
    const prefix = `${escapeLike(query)}%`;
    conditions.push("(student_name LIKE ? ESCAPE '\\' COLLATE NOCASE OR public_student_id LIKE ? ESCAPE '\\' COLLATE NOCASE)");
    filterBindings.push(prefix, prefix);
  }

  let rosterSql = "";
  const rosterBindings: unknown[] = [selectedCycle.id];
  if (selectedCycle.status === "active") {
    rosterSql = `SELECT
        ecs.id AS status_id, s.id AS student_id,
        COALESCE(ecs.student_name_snapshot, s.display_name) AS student_name,
        COALESCE(ecs.student_public_id_snapshot, s.public_student_id) AS public_student_id,
        COALESCE(ecs.current_rank_snapshot, s.current_belt) AS current_rank,
        ecs.requested_rank_snapshot AS requested_rank,
        ecs.application_id,
        ecs.application_date,
        COALESCE(ecs.status, 'not_signed_up') AS status,
        s.profile_image_url, s.dojo_id
      FROM students s
      LEFT JOIN exam_cycle_student_status ecs ON ecs.student_id = s.id AND ecs.cycle_id = ?
      WHERE s.active = 1 AND s.profile_status IN ('pending_admin_approval', 'approved') ${isRenShinKanSuperAdmin(session) ? "" : "AND s.dojo_id = ?"}`;
    if (!isRenShinKanSuperAdmin(session)) rosterBindings.push(session.selectedDojoId || "__none__");
  } else {
    rosterSql = `SELECT
        ecs.id AS status_id, ecs.student_id,
        ecs.student_name_snapshot AS student_name,
        ecs.student_public_id_snapshot AS public_student_id,
        ecs.current_rank_snapshot AS current_rank,
        ecs.requested_rank_snapshot AS requested_rank,
        ecs.application_id,
        ecs.application_date,
        ecs.status,
        s.profile_image_url, s.dojo_id
      FROM exam_cycle_student_status ecs
      LEFT JOIN students s ON s.id = ecs.student_id
      WHERE ecs.cycle_id = ? ${isRenShinKanSuperAdmin(session) ? "" : "AND s.dojo_id = ?"}`;
    if (!isRenShinKanSuperAdmin(session)) rosterBindings.push(session.selectedDojoId || "__none__");
  }
  const base = `WITH roster AS (${rosterSql})`;
  const filteredWhere = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const summaryWhere = recordsOnly ? "WHERE application_id IS NOT NULL" : "";
  const [countResult, summaryResult] = await db.batch([
    db.prepare(`${base} SELECT COUNT(*) AS total FROM roster ${filteredWhere}`).bind(...rosterBindings, ...filterBindings),
    db.prepare(`${base} SELECT COUNT(*) AS total,
      SUM(CASE WHEN status = 'not_signed_up' THEN 1 ELSE 0 END) AS not_signed_up,
      SUM(CASE WHEN status = 'unpaid' THEN 1 ELSE 0 END) AS unpaid,
      SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) AS paid
      FROM roster ${summaryWhere}`).bind(...rosterBindings),
  ]);
  const total = Number((countResult.results?.[0] as { total?: number } | undefined)?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const students = ((await db.prepare(`${base} SELECT * FROM roster ${filteredWhere}
    ORDER BY student_name COLLATE NOCASE, public_student_id COLLATE NOCASE LIMIT ? OFFSET ?`)
    .bind(...rosterBindings, ...filterBindings, pageSize, (safePage - 1) * pageSize).all<RosterRow>()).results || []);
  const summaryRow = (summaryResult.results?.[0] || {}) as Record<string, unknown>;
  const summary = {
    total: Number(summaryRow.total || 0),
    not_signed_up: Number(summaryRow.not_signed_up || 0),
    unpaid: Number(summaryRow.unpaid || 0),
    paid: Number(summaryRow.paid || 0),
  };
  return jsonResponse({
    cycles,
    selectedCycle,
    students,
    pagination: { page: safePage, pageSize, total, totalPages },
    summary,
  }, 200, { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Forbidden" }, 403);
  const session = await getAuthorizedAdminSession(request, env);
  if (!session) return jsonResponse({ error: "Unauthorized" }, 401);
  const db = requireStudentDb(env);
  const requestId = requestIdentifier(request);
  try {
    const replay = await db.prepare("SELECT response_json FROM mutation_requests WHERE request_id = ? LIMIT 1")
      .bind(requestId).first<{ response_json: string | null }>();
    const replayBody = replayResponse(replay?.response_json);
    if (replayBody) return jsonResponse(replayBody, 200, { "Cache-Control": "no-store" });
    const body = await request.json<Record<string, unknown>>();
    const action = body.action;
    if (action === "start_cycle") {
      if (!requiresCentralAdmin(session)) return jsonResponse({ error: "Only the RenShinKan administrator may start an examination cycle." }, 403);
      if (body.confirmed !== true) return jsonResponse({ error: "Confirm that the current cycle will become read-only history." }, 400);
      const name = cleanText(body.name, 120);
      if (!name || name.length > 120) return jsonResponse({ error: "Enter a cycle name of 120 characters or fewer." }, 400);
      const current = await db.prepare("SELECT id, name FROM examination_cycles WHERE status = 'active' ORDER BY created_at DESC LIMIT 1")
        .first<{ id: string; name: string }>();
      const rosterCount = Number((await db.prepare(`SELECT COUNT(*) AS count FROM students
        WHERE active = 1 AND profile_status IN ('pending_admin_approval', 'approved')`).first<{ count: number }>())?.count || 0);
      const now = new Date().toISOString();
      const examinationType = cleanText(body.examinationType, 80) || "Belt promotion";
      const rankCategory = cleanText(body.rankCategory, 40) || "Kyu and Dan";
      const applicationOpensAt = cleanText(body.applicationOpensAt, 30) || null;
      const applicationClosesAt = cleanText(body.applicationClosesAt, 30) || null;
      const examinationAt = cleanText(body.examinationAt, 30) || null;
      const venue = cleanText(body.venue, 240);
      const instructions = typeof body.instructions === "string" ? body.instructions.trim().slice(0, 4_000) : "";
      const rankFees = JSON.stringify(cleanFeeConfig(body.rankFees));
      const annualFees = JSON.stringify(cleanFeeConfig(body.annualFees));
      const cycleId = crypto.randomUUID();
      const bulkOperationId = crypto.randomUUID();
      const statements: D1PreparedStatement[] = [];
      if (current) statements.push(db.prepare("UPDATE examination_cycles SET status = 'closed', lifecycle_status = 'closed', closed_at = ?, closed_by = ?, updated_at = ? WHERE status = 'active'").bind(now, session.adminName, now));
      statements.push(db.prepare(`INSERT INTO examination_cycles (id, name, title, status, lifecycle_status, examination_type,
        rank_category, application_opens_at, application_closes_at, examination_at, venue, instructions,
        rank_fee_config_json, annual_fee_config_json, created_by, created_at, updated_at)
        VALUES (?, ?, ?, 'active', 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(cycleId, name, name, examinationType, rankCategory, applicationOpensAt, applicationClosesAt, examinationAt,
          venue, instructions, rankFees, annualFees, session.adminName, now, now));
      statements.push(db.prepare(`INSERT INTO exam_cycle_student_status (
          id, student_id, cycle_id, student_name_snapshot, student_public_id_snapshot,
          current_rank_snapshot, status, updated_at, updated_by
        ) SELECT lower(hex(randomblob(16))), id, ?, display_name, public_student_id,
          current_belt, 'not_signed_up', ?, ?
        FROM students WHERE active = 1 AND profile_status IN ('pending_admin_approval', 'approved')`)
        .bind(cycleId, now, session.adminName));
      const response = { ok: true, action, cycleId, name, rosterCount, previousCycleId: current?.id || null };
      statements.push(
        auditStatement(db, {
          actorType: "administrator", ...adminAuditMetadata(session, request), action: "exam_cycle_created", entityType: "examination_cycle", entityId: cycleId,
          previousValues: current ? { cycleId: current.id, cycleName: current.name, status: "active" } : null,
          newValues: { cycleId, cycleName: name, status: "active", rosterCount, examinationType, rankCategory, applicationOpensAt, applicationClosesAt, examinationAt, venue },
          source: "admin_exam_cycles", bulkOperationId, requestId, examCycleId: cycleId,
          summary: `Started ${name}; the previous cycle is read-only history`, createdAt: now,
        }),
        db.prepare("INSERT INTO mutation_requests (request_id, actor_type, action, response_json, created_at) VALUES (?, 'administrator', 'start_exam_cycle', ?, ?)")
          .bind(requestId, JSON.stringify(response), now),
      );
      await db.batch(statements);
      return jsonResponse(response, 201, { "Cache-Control": "no-store" });
    }

    if (action === "update_cycle") {
      if (!requiresCentralAdmin(session)) return jsonResponse({ error: "Only the RenShinKan administrator may edit an examination cycle." }, 403);
      if (body.confirmed !== true) return jsonResponse({ error: "Confirm the examination-cycle changes." }, 400);
      const cycleId = cleanText(body.cycleId, 100); const name = cleanText(body.name, 120);
      const lifecycle = ["draft", "open", "closed", "completed", "archived"].includes(String(body.lifecycleStatus)) ? String(body.lifecycleStatus) : "";
      if (!cycleId || !name || !lifecycle) return jsonResponse({ error: "Choose a cycle, title, and valid lifecycle state." }, 400);
      const before = await db.prepare("SELECT * FROM examination_cycles WHERE id = ? LIMIT 1").bind(cycleId).first<Record<string, unknown>>();
      if (!before) return jsonResponse({ error: "Examination cycle not found." }, 404);
      const now = new Date().toISOString();
      const next = {
        name, examinationType: cleanText(body.examinationType, 80) || "Belt promotion",
        rankCategory: cleanText(body.rankCategory, 40) || "Kyu and Dan", applicationOpensAt: cleanText(body.applicationOpensAt, 30) || null,
        applicationClosesAt: cleanText(body.applicationClosesAt, 30) || null, examinationAt: cleanText(body.examinationAt, 30) || null,
        venue: cleanText(body.venue, 240), instructions: typeof body.instructions === "string" ? body.instructions.trim().slice(0, 4_000) : "", lifecycleStatus: lifecycle,
        rankFees: cleanFeeConfig(body.rankFees), annualFees: cleanFeeConfig(body.annualFees),
      };
      await db.batch([
        db.prepare(`UPDATE examination_cycles SET name = ?, title = ?, examination_type = ?, rank_category = ?,
          application_opens_at = ?, application_closes_at = ?, examination_at = ?, venue = ?, instructions = ?,
          rank_fee_config_json = ?, annual_fee_config_json = ?, lifecycle_status = ?, updated_at = ? WHERE id = ?`)
          .bind(next.name, next.name, next.examinationType, next.rankCategory, next.applicationOpensAt, next.applicationClosesAt, next.examinationAt, next.venue, next.instructions,
            JSON.stringify(next.rankFees), JSON.stringify(next.annualFees), next.lifecycleStatus, now, cycleId),
        auditStatement(db, { actorType: "administrator", ...adminAuditMetadata(session, request), action: "exam_cycle_updated",
          entityType: "examination_cycle", entityId: cycleId, previousValues: before, newValues: next,
          source: "admin_exam_cycles", requestId, examCycleId: cycleId, summary: `Updated examination cycle ${name}`, createdAt: now }),
      ]);
      return jsonResponse({ ok: true, action, cycleId }, 200, { "Cache-Control": "no-store" });
    }

    if (action !== "update_status") return jsonResponse({ error: "Choose an examination action." }, 400);
    if (body.confirmed !== true) return jsonResponse({ error: "Confirm the examination status change." }, 400);
    const newStatus = body.status === "not_signed_up" || body.status === "unpaid" || body.status === "paid" ? body.status : "";
    const cycleId = cleanText(body.cycleId, 100);
    const studentIds = Array.isArray(body.studentIds)
      ? Array.from(new Set(body.studentIds.filter((value): value is string => typeof value === "string" && value.length >= 8)))
      : [];
    if (studentIds.length > 15) return jsonResponse({ error: "Update at most 15 examination records in one audited batch." }, 400);
    if (!newStatus || !cycleId || studentIds.length === 0) return jsonResponse({ error: "Select students and a valid status." }, 400);
    const cycle = await db.prepare("SELECT id, name, status FROM examination_cycles WHERE id = ? LIMIT 1").bind(cycleId)
      .first<{ id: string; name: string; status: string }>();
    if (!cycle) return jsonResponse({ error: "Examination cycle not found." }, 404);
    if (cycle.status !== "active") return jsonResponse({ error: "Historical examination cycles are read-only." }, 409);
    const placeholders = studentIds.map(() => "?").join(",");
    const students = (await db.prepare(`SELECT
        s.id, s.display_name, s.public_student_id, s.current_belt, s.dojo_id,
        ecs.id AS status_id, COALESCE(ecs.status, 'not_signed_up') AS status,
        ecs.application_id, ecs.requested_rank_snapshot,
        COALESCE(ecs.application_date, ea.submitted_at) AS application_date,
        COALESCE(ecs.application_id, ea.id) AS resolved_application_id,
        ea.payment_status AS current_payment_status
      FROM students s
      LEFT JOIN exam_cycle_student_status ecs ON ecs.student_id = s.id AND ecs.cycle_id = ?
      LEFT JOIN examination_applications ea ON ea.student_id = s.id AND ea.cycle_id = ? AND ea.status <> 'archived'
      WHERE s.id IN (${placeholders}) AND s.active = 1`)
      .bind(cycleId, cycleId, ...studentIds).all<{
        id: string; display_name: string; public_student_id: string; current_belt: string; dojo_id: string;
        status_id: string | null; status: string; application_id: string | null; requested_rank_snapshot: string | null;
        application_date: string | null; resolved_application_id: string | null; current_payment_status: string | null;
      }>()).results || [];
    if (students.length !== studentIds.length) return jsonResponse({ error: "One or more selected students are unavailable. Refresh and try again." }, 409);
    if (students.some((student) => !canAccessDojo(session, student.dojo_id))) return jsonResponse({ error: "One or more selected students belongs to another dojo." }, 403);
    const now = new Date().toISOString();
    const bulkOperationId = crypto.randomUUID();
    const statements: D1PreparedStatement[] = [];
    for (const student of students) {
      const statusId = student.status_id || crypto.randomUUID();
      statements.push(
        db.prepare(`INSERT INTO exam_cycle_student_status (
          id, student_id, cycle_id, application_id, student_name_snapshot, student_public_id_snapshot,
          current_rank_snapshot, requested_rank_snapshot, status, application_date, updated_at, updated_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(student_id, cycle_id) DO UPDATE SET
          application_id = COALESCE(excluded.application_id, exam_cycle_student_status.application_id),
          student_name_snapshot = excluded.student_name_snapshot,
          student_public_id_snapshot = excluded.student_public_id_snapshot,
          current_rank_snapshot = excluded.current_rank_snapshot,
          requested_rank_snapshot = COALESCE(excluded.requested_rank_snapshot, exam_cycle_student_status.requested_rank_snapshot),
          status = excluded.status,
          application_date = COALESCE(excluded.application_date, exam_cycle_student_status.application_date),
          updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
          .bind(statusId, student.id, cycleId, student.resolved_application_id, student.display_name, student.public_student_id,
            student.current_belt, student.requested_rank_snapshot, newStatus, student.application_date, now, session.adminName),
        db.prepare(`INSERT INTO exam_cycle_status_history
          (id, cycle_status_id, previous_status, new_status, actor_identifier, bulk_operation_id, request_id, note, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'Administrator status change', ?)`)
          .bind(crypto.randomUUID(), statusId, student.status, newStatus, session.adminName, bulkOperationId, requestId, now),
        auditStatement(db, {
          actorType: "administrator", ...adminAuditMetadata(session, request),
          action: students.length > 1 ? "exam_status_changed_bulk" : "exam_status_changed",
          entityType: "exam_cycle_student_status", entityId: statusId, studentId: student.id,
          studentPublicId: student.public_student_id, studentNameSnapshot: student.display_name,
          previousValues: { status: student.status }, newValues: { status: newStatus },
          source: "admin_exam_applications", bulkOperationId, requestId, examCycleId: cycleId,
          summary: `${student.public_student_id}: ${student.status.replace(/_/g, " ")} to ${newStatus.replace(/_/g, " ")}`, createdAt: now,
        }),
      );
      if (student.resolved_application_id) {
        const paymentStatus = newStatus === "paid" ? "paid" : "payment_pending";
        statements.push(
          db.prepare(`UPDATE examination_applications SET payment_status = ?, paid_at = ?, paid_by = ?, updated_at = ? WHERE id = ?`)
            .bind(paymentStatus, newStatus === "paid" ? now : null, newStatus === "paid" ? session.adminName : null, now, student.resolved_application_id),
          db.prepare(`INSERT INTO application_status_history (
            id, application_id, previous_payment_status, new_payment_status, actor_identifier,
            note, bulk_operation_id, request_id, created_at
          ) VALUES (?, ?, ?, ?, ?, 'Synchronized with current-cycle status', ?, ?, ?)`)
            .bind(crypto.randomUUID(), student.resolved_application_id, student.current_payment_status, paymentStatus, session.adminName, bulkOperationId, requestId, now),
        );
      }
    }
    const response = { ok: true, action, cycleId, status: newStatus, count: students.length, bulkOperationId };
    statements.push(db.prepare("INSERT INTO mutation_requests (request_id, actor_type, action, response_json, created_at) VALUES (?, 'administrator', 'exam_status_update', ?, ?)")
      .bind(requestId, JSON.stringify(response), now));
    await db.batch(statements);
    return jsonResponse(response, 200, { "Cache-Control": "no-store" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The examination workflow could not be updated.";
    return jsonResponse({ error: message.includes("UNIQUE") ? "This examination action was already completed." : message }, message.includes("UNIQUE") ? 409 : 400);
  }
};
