import { getAdminSession, isSameOriginRequest, jsonResponse, requiresCentralAdmin, type AdminSession } from "../../_lib/auth";
import {
  adminAuditMetadata,
  auditStatement,
  currentBangkokMonthKey,
  isMonthKey,
  recentMonthKeys,
  requestIdentifier,
  requireStudentDb,
  type D1Database,
  type D1PreparedStatement,
  type StudentEnv,
} from "../../_lib/studentRecords";

type Env = StudentEnv & { SESSION_SECRET?: string };
type ContributionRow = {
  student_id: string;
  student_name: string;
  public_student_id: string;
  current_rank: string;
  contribution_id: string | null;
  status: "no_submission" | "awaiting_payment" | "paid";
  submitted_at: string | null;
  paid_at: string | null;
  paid_by: string | null;
  status_updated_at: string | null;
  internal_note: string | null;
};

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, max + 1) : "";
}

async function ensureCurrentPeriod(db: D1Database, month: string, requestId: string, session: AdminSession, request: Request) {
  const existing = await db.prepare("SELECT month_key FROM contribution_periods WHERE month_key = ? LIMIT 1")
    .bind(month).first<{ month_key: string }>();
  const activeStudentCount = Number((await db.prepare(`SELECT COUNT(*) AS count FROM students
    WHERE active = 1 AND profile_status = 'approved' AND dojo_id = 'dojo-rsk'`).first<{ count: number }>())?.count || 0);
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [
    db.prepare(`INSERT OR IGNORE INTO contribution_periods
      (month_key, active_student_count_snapshot, created_at, created_by) VALUES (?, ?, ?, 'system')`)
      .bind(month, activeStudentCount, now),
    db.prepare(`INSERT OR IGNORE INTO contribution_period_students (
      id, month_key, student_id, student_name_snapshot, student_public_id_snapshot,
      current_rank_snapshot, active_at_period_start, created_at
    ) SELECT lower(hex(randomblob(16))), ?, id, display_name, public_student_id,
      current_belt, 1, ? FROM students WHERE active = 1 AND profile_status = 'approved' AND dojo_id = 'dojo-rsk'`)
      .bind(month, now),
    db.prepare(`UPDATE contribution_periods SET active_student_count_snapshot = (
      SELECT COUNT(*) FROM contribution_period_students
      WHERE month_key = ? AND active_at_period_start = 1
    ) WHERE month_key = ?`).bind(month, month),
  ];
  if (!existing) {
    statements.push(auditStatement(db, {
      actorType: "administrator", ...adminAuditMetadata(session, request),
      action: "contribution_period_created", entityType: "contribution_period", entityId: month,
      previousValues: null, newValues: { month, activeStudentCount },
      source: "admin_monthly_contributions", requestId, contributionMonth: month,
      summary: `Created the ${month} contribution roster snapshot`, createdAt: now,
    }));
  }
  await db.batch(statements);
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const session = await getAdminSession(request, env);
  if (!requiresCentralAdmin(session)) return jsonResponse({ error: "Only the RenShinKan administrator may manage monthly RenShinKan contributions." }, session ? 403 : 401);
  const db = requireStudentDb(env);
  const url = new URL(request.url);
  const currentMonth = currentBangkokMonthKey();
  const requestedMonth = clean(url.searchParams.get("month"), 7);
  const month = isMonthKey(requestedMonth) ? requestedMonth : currentMonth;
  const period = await db.prepare("SELECT month_key FROM contribution_periods WHERE month_key = ? LIMIT 1")
    .bind(month).first<{ month_key: string }>();
  let roster: ContributionRow[] = [];
  if (period) {
    roster = ((await db.prepare(`SELECT
        r.student_id,
        r.student_name_snapshot AS student_name,
        r.student_public_id_snapshot AS public_student_id,
        r.current_rank_snapshot AS current_rank,
        c.id AS contribution_id,
        COALESCE(c.status, 'no_submission') AS status,
        c.submitted_at,
        c.paid_at,
        c.paid_by,
        c.status_updated_at,
        c.internal_note
      FROM contribution_period_students r
      LEFT JOIN monthly_contributions c ON c.student_id = r.student_id AND c.month_key = r.month_key
      WHERE r.month_key = ? AND r.active_at_period_start = 1
      ORDER BY r.student_name_snapshot COLLATE NOCASE, r.student_public_id_snapshot COLLATE NOCASE`)
      .bind(month).all<ContributionRow>()).results || []);
  } else if (month === currentMonth) {
    roster = ((await db.prepare(`SELECT
        s.id AS student_id,
        s.display_name AS student_name,
        s.public_student_id,
        s.current_belt AS current_rank,
        NULL AS contribution_id,
        'no_submission' AS status,
        NULL AS submitted_at,
        NULL AS paid_at,
        NULL AS paid_by,
        NULL AS status_updated_at,
        NULL AS internal_note
      FROM students s
      WHERE s.active = 1 AND s.profile_status = 'approved' AND s.dojo_id = 'dojo-rsk'
      ORDER BY s.display_name COLLATE NOCASE, s.public_student_id COLLATE NOCASE`)
      .all<ContributionRow>()).results || []);
  }

  const summary = roster.reduce((counts, row) => {
    counts.total += 1;
    if (row.status !== "no_submission") counts.submitted += 1;
    if (row.status === "awaiting_payment") counts.awaiting += 1;
    if (row.status === "paid") counts.paid += 1;
    return counts;
  }, { total: 0, submitted: 0, awaiting: 0, paid: 0 });
  const query = clean(url.searchParams.get("query"), 120).toLocaleLowerCase("und");
  const status = clean(url.searchParams.get("status"), 30);
  const filtered = roster.filter((row) => {
    if (status && row.status !== status) return false;
    if (!query) return true;
    return row.student_name.toLocaleLowerCase("und").includes(query)
      || row.public_student_id.toLocaleLowerCase("und").includes(query);
  });
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1);
  const pageSize = 50;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const storedMonths = ((await db.prepare("SELECT month_key FROM contribution_periods ORDER BY month_key DESC LIMIT 36")
    .all<{ month_key: string }>()).results || []).map((row) => row.month_key);
  const months = Array.from(new Set([...recentMonthKeys(12), ...storedMonths])).sort().reverse();
  const graphRows = (await db.prepare(`SELECT
      p.month_key,
      p.active_student_count_snapshot AS total_active,
      SUM(CASE WHEN c.status = 'paid' THEN 1 ELSE 0 END) AS paid
    FROM contribution_periods p
    LEFT JOIN monthly_contributions c ON c.month_key = p.month_key
    GROUP BY p.month_key, p.active_student_count_snapshot
    ORDER BY p.month_key DESC LIMIT 12`).all<{ month_key: string; total_active: number; paid: number }>()).results || [];
  const graph = [...graphRows].reverse().map((row) => ({
    month: row.month_key,
    totalActive: Number(row.total_active || 0),
    paid: Number(row.paid || 0),
    paidPercentage: Number(row.total_active || 0) > 0 ? Math.round((Number(row.paid || 0) / Number(row.total_active)) * 100) : 0,
  }));
  return jsonResponse({
    month,
    currentMonth,
    months,
    contributions: filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    pagination: { page: safePage, pageSize, total: filtered.length, totalPages },
    summary: { ...summary, paidPercentage: summary.total > 0 ? Math.round((summary.paid / summary.total) * 100) : 0 },
    graph,
  }, 200, { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Forbidden" }, 403);
  const session = await getAdminSession(request, env);
  if (!requiresCentralAdmin(session)) return jsonResponse({ error: "Only the RenShinKan administrator may manage monthly RenShinKan contributions." }, session ? 403 : 401);
  const db = requireStudentDb(env);
  const requestId = requestIdentifier(request);
  try {
    const replay = await db.prepare("SELECT response_json FROM mutation_requests WHERE request_id = ? LIMIT 1")
      .bind(requestId).first<{ response_json: string | null }>();
    if (replay?.response_json) return jsonResponse(JSON.parse(replay.response_json), 200, { "Cache-Control": "no-store" });
    const body = await request.json<Record<string, unknown>>();
    if (body.contributionType !== "renshinkan_monthly") return jsonResponse({ error: "Choose Monthly RenShinKan Student Contribution." }, 400);
    if (body.action !== "update_status" || body.confirmed !== true) return jsonResponse({ error: "Confirm the contribution status change." }, 400);
    const month = clean(body.month, 7);
    const newStatus = body.status === "no_submission" || body.status === "awaiting_payment" || body.status === "paid" ? body.status : "";
    const note = clean(body.note, 2000);
    const reference = clean(body.reference, 200);
    const amount = body.amount === "" || body.amount == null ? null : Number(body.amount);
    if (amount !== null && (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000)) return jsonResponse({ error: "Enter a valid contribution amount." }, 400);
    const studentIds = Array.isArray(body.studentIds)
      ? Array.from(new Set(body.studentIds.filter((value): value is string => typeof value === "string" && value.length >= 8)))
      : [];
    if (studentIds.length > 30) return jsonResponse({ error: "Update at most 30 contribution records in one audited batch." }, 400);
    if (!isMonthKey(month) || !newStatus || studentIds.length === 0) return jsonResponse({ error: "Select students, a month, and a valid contribution status." }, 400);
    if (month === currentBangkokMonthKey()) await ensureCurrentPeriod(db, month, requestId, session!, request);
    const placeholders = studentIds.map(() => "?").join(",");
    const rows = (await db.prepare(`SELECT
        r.student_id, r.student_name_snapshot, r.student_public_id_snapshot,
        c.id AS contribution_id, COALESCE(c.status, 'no_submission') AS current_status,
        c.submitted_at, c.internal_note, s.dojo_id
      FROM contribution_period_students r JOIN students s ON s.id = r.student_id
      LEFT JOIN monthly_contributions c ON c.student_id = r.student_id AND c.month_key = r.month_key
      WHERE r.month_key = ? AND r.student_id IN (${placeholders}) AND r.active_at_period_start = 1 AND s.dojo_id = 'dojo-rsk'`)
      .bind(month, ...studentIds).all<{
        student_id: string; student_name_snapshot: string; student_public_id_snapshot: string;
        contribution_id: string | null; current_status: string; submitted_at: string | null; internal_note: string | null; dojo_id: string;
      }>()).results || [];
    if (rows.length !== studentIds.length) return jsonResponse({ error: "One or more selected students are not in this month's roster. Refresh and try again." }, 409);
    const now = new Date().toISOString();
    const bulkOperationId = crypto.randomUUID();
    const statements: D1PreparedStatement[] = [];
    for (const row of rows) {
      const contributionId = row.contribution_id || crypto.randomUUID();
      const submittedAt = row.submitted_at || (newStatus === "no_submission" ? null : now);
      const paidAt = newStatus === "paid" ? now : null;
      const paidBy = newStatus === "paid" ? session!.adminName : null;
      const generalizedStatus = newStatus === "paid" ? "paid" : newStatus === "awaiting_payment" ? "awaiting_payment" : "cancelled";
      statements.push(
        db.prepare(`INSERT INTO monthly_contributions (
          id, student_id, month_key, student_name_snapshot, student_public_id_snapshot, status,
          submitted_at, paid_at, paid_by, status_updated_at, status_updated_by, internal_note, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(student_id, month_key) DO UPDATE SET status = excluded.status,
          submitted_at = COALESCE(monthly_contributions.submitted_at, excluded.submitted_at),
          paid_at = excluded.paid_at, paid_by = excluded.paid_by,
          status_updated_at = excluded.status_updated_at, status_updated_by = excluded.status_updated_by,
          internal_note = excluded.internal_note, updated_at = excluded.updated_at`)
          .bind(contributionId, row.student_id, month, row.student_name_snapshot, row.student_public_id_snapshot,
            newStatus, submittedAt, paidAt, paidBy, now, session!.adminName, note || row.internal_note || "", now, now),
        db.prepare(`INSERT INTO contribution_status_history (
          id, contribution_id, previous_status, new_status, actor_identifier, bulk_operation_id, request_id, note, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(crypto.randomUUID(), contributionId, row.current_status, newStatus, session!.adminName, bulkOperationId, requestId, note || null, now),
        db.prepare(`INSERT INTO payments (id, student_id, dojo_id, payment_type, amount, currency, payment_date,
          status, reference, notes, recorded_by, created_at, updated_at)
          VALUES (?, ?, 'dojo-rsk', 'renshinkan_monthly', ?, 'THB', ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET amount = excluded.amount, payment_date = excluded.payment_date,
            status = excluded.status, reference = excluded.reference, notes = excluded.notes,
            recorded_by = excluded.recorded_by, updated_at = excluded.updated_at`)
          .bind(contributionId, row.student_id, amount, paidAt, generalizedStatus, reference, note, session!.adminName, now, now),
        db.prepare(`INSERT INTO payment_history (id, payment_id, previous_status, new_status, changed_by, notes, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .bind(crypto.randomUUID(), contributionId,
            row.current_status === "paid" ? "paid" : row.current_status === "awaiting_payment" ? "awaiting_payment" : null,
            generalizedStatus, session!.adminName, note || null, now),
        auditStatement(db, {
          actorType: "administrator", ...adminAuditMetadata(session!, request),
          action: newStatus === "paid" ? "contribution_manually_marked_paid" : rows.length > 1 ? "contribution_status_changed_bulk" : "contribution_status_changed",
          entityType: "monthly_contribution", entityId: contributionId, studentId: row.student_id,
          studentPublicId: row.student_public_id_snapshot, studentNameSnapshot: row.student_name_snapshot,
          previousValues: { status: row.current_status }, newValues: { contributionType: "renshinkan_monthly", status: newStatus, amount, reference, paidAt },
          source: "admin_monthly_contributions", bulkOperationId, requestId, contributionMonth: month,
          administratorNote: note || null,
          summary: `${row.student_public_id_snapshot}: ${row.current_status.replace(/_/g, " ")} to ${newStatus.replace(/_/g, " ")}`, createdAt: now,
        }),
      );
    }
    const response = { ok: true, month, status: newStatus, count: rows.length, bulkOperationId };
    statements.push(db.prepare("INSERT INTO mutation_requests (request_id, actor_type, action, response_json, created_at) VALUES (?, 'administrator', 'contribution_status_update', ?, ?)")
      .bind(requestId, JSON.stringify(response), now));
    await db.batch(statements);
    return jsonResponse(response, 200, { "Cache-Control": "no-store" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The contribution workflow could not be updated.";
    return jsonResponse({ error: message.includes("UNIQUE") ? "This contribution update was already completed." : message }, message.includes("UNIQUE") ? 409 : 400);
  }
};
