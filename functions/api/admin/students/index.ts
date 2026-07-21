import { RANKS, normalizeRank } from "../../../../shared/ranks";
import { addOneCalendarYear } from "../../../../shared/membership";
import { canAccessDojo, getAuthorizedAdminSession, isRenShinKanSuperAdmin, isSameOriginRequest, jsonResponse } from "../../../_lib/auth";
import {
  activeDojo,
  adminAuditMetadata,
  auditStatement,
  currentBangkokMonthKey,
  DEFAULT_DOJO_ID, DEFAULT_SHARE_FIELDS,
  isValidStudentId,
  nextStudentId,
  normalizeStudentId,
  rankColor,
  requestIdentifier,
  requireStudentDb,
  studentNameVerificationHash,
  suggestedStudentId,
  syncStudentIdSequenceStatement,
  type StudentEnv,
} from "../../../_lib/studentRecords";

type Env = StudentEnv & { SESSION_SECRET?: string };

function integerParam(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

function validProfileUrl(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const url = String(value);
  return /^\/uploads\/student-profiles\/\d{4}\/\d{2}\/[a-f0-9-]{36}\.webp$/i.test(url) ? url : undefined;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const session = await getAuthorizedAdminSession(request, env);
  if (!session) return jsonResponse({ error: "Unauthorized" }, 401);

  const db = requireStudentDb(env);
  const url = new URL(request.url);
  const page = integerParam(url.searchParams.get("page"), 1, 1, 1_000_000);
  const pageSize = integerParam(url.searchParams.get("pageSize"), 20, 5, 100);
  const query = (url.searchParams.get("query") || "").trim().slice(0, 120);
  const rank = (url.searchParams.get("rank") || "").trim().slice(0, 80);
  const profileStatus = (url.searchParams.get("profileStatus") || "").trim();
  const examinationStatus = (url.searchParams.get("examinationStatus") || "").trim();
  const paymentStatus = (url.searchParams.get("paymentStatus") || "").trim();
  const hoursStatus = (url.searchParams.get("hoursStatus") || "").trim();
  const requestedStatus = url.searchParams.get("status");
  const status = requestedStatus === "active" || requestedStatus === "archived" ? requestedStatus : "all";
  const dojoId = (url.searchParams.get("dojoId") || "").trim();
  const aatStatus = (url.searchParams.get("aatStatus") || "").trim();
  const sort = url.searchParams.get("sort") || "name";
  const direction = url.searchParams.get("direction") === "desc" ? "DESC" : "ASC";
  const totalExpression = "COALESCE((SELECT SUM(verified_hours) FROM training_hours h WHERE h.student_id = s.id), 0) + s.training_hours_adjustment";
  const applicationStatusExpression = "COALESCE((SELECT ea.status FROM examination_applications ea JOIN examination_cycles ec ON ec.id = ea.cycle_id AND ec.status = 'active' WHERE ea.student_id = s.id AND ea.status <> 'archived' ORDER BY ea.submitted_at DESC LIMIT 1), 'none')";
  const paymentStatusExpression = "COALESCE((SELECT ea.payment_status FROM examination_applications ea JOIN examination_cycles ec ON ec.id = ea.cycle_id AND ec.status = 'active' WHERE ea.student_id = s.id AND ea.status <> 'archived' ORDER BY ea.submitted_at DESC LIMIT 1), 'not_applicable')";
  const sortColumns: Record<string, string> = {
    name: "s.display_name COLLATE NOCASE",
    studentId: "s.public_student_id COLLATE NOCASE",
    rank: "s.current_belt COLLATE NOCASE",
    trainingHours: totalExpression,
    profileStatus: "s.profile_status",
    examinationStatus: applicationStatusExpression,
    paymentStatus: paymentStatusExpression,
    updated: "s.updated_at",
  };
  const orderBy = sortColumns[sort] || sortColumns.name;
  const conditions: string[] = [];
  const bindings: unknown[] = [];

  if (!isRenShinKanSuperAdmin(session)) {
    conditions.push("s.dojo_id = ?");
    bindings.push(session.selectedDojoId || "__none__");
  } else if (dojoId) {
    conditions.push("s.dojo_id = ?");
    bindings.push(dojoId);
  }
  if (query) {
    conditions.push("(s.display_name LIKE ? ESCAPE '\\' COLLATE NOCASE OR s.public_student_id LIKE ? ESCAPE '\\' COLLATE NOCASE OR COALESCE(s.aat_number, '') LIKE ? ESCAPE '\\' COLLATE NOCASE)");
    const term = `%${escapeLike(query)}%`;
    bindings.push(term, term, term);
  }
  if (rank) { conditions.push("s.current_belt = ? COLLATE NOCASE"); bindings.push(rank); }
  if (profileStatus) { conditions.push("s.profile_status = ?"); bindings.push(profileStatus); }
  if (examinationStatus) { conditions.push(`${applicationStatusExpression} = ?`); bindings.push(examinationStatus); }
  if (paymentStatus) { conditions.push(`${paymentStatusExpression} = ?`); bindings.push(paymentStatus); }
  if (hoursStatus === "pending") conditions.push("EXISTS (SELECT 1 FROM training_hour_requests phr WHERE phr.student_id = s.id AND phr.status = 'pending')");
  if (aatStatus === "new") conditions.push("s.aat_number IS NULL");
  else if (aatStatus === "unpaid") conditions.push("s.aat_number IS NOT NULL AND s.aat_last_paid_date IS NULL");
  else if (aatStatus === "expired") conditions.push("s.aat_number IS NOT NULL AND s.aat_last_paid_date IS NOT NULL AND date(s.aat_last_paid_date, '+1 year') < date('now')");
  else if (aatStatus === "current") conditions.push("s.aat_number IS NOT NULL AND s.aat_last_paid_date IS NOT NULL AND date(s.aat_last_paid_date, '+1 year') >= date('now')");
  conditions.push("s.deleted_at IS NULL");
  if (status === "archived") conditions.push("s.archived_at IS NOT NULL");
  else if (status === "active") conditions.push("s.active = 1");

  const summaryConditions = ["s.deleted_at IS NULL"];
  const summaryBindings: unknown[] = [];
  if (!isRenShinKanSuperAdmin(session)) {
    summaryConditions.push("s.dojo_id = ?");
    summaryBindings.push(session.selectedDojoId || "__none__");
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const [countResult, rowsResult, summaryResult] = await db.batch([
    db.prepare(`SELECT COUNT(*) AS total FROM students s ${where}`).bind(...bindings),
    db.prepare(`SELECT s.id, s.public_student_id, s.display_name, s.current_belt, s.profile_image_url, s.active, s.archived_at,
      s.dojo_id, d.official_name AS dojo_name, s.aat_number, s.aat_last_paid_date,
      s.updated_at, s.profile_status, ${totalExpression} AS total_hours,
      ${applicationStatusExpression} AS examination_status, ${paymentStatusExpression} AS payment_status,
      (SELECT COUNT(*) FROM training_hour_requests thr WHERE thr.student_id = s.id AND thr.status = 'pending') AS pending_hours,
      EXISTS(SELECT 1 FROM share_tokens st WHERE st.student_id = s.id AND st.active = 1) AS sharing_active
      FROM students s JOIN dojos d ON d.id = s.dojo_id ${where} ORDER BY ${orderBy} ${direction}, s.id ASC LIMIT ? OFFSET ?`)
      .bind(...bindings, pageSize, (page - 1) * pageSize),
    db.prepare(`SELECT COUNT(*) AS total,
      SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN archived_at IS NOT NULL THEN 1 ELSE 0 END) AS archived,
      SUM(CASE WHEN profile_status = 'pending_admin_approval' THEN 1 ELSE 0 END) AS pending_profiles
      FROM students s WHERE ${summaryConditions.join(" AND ")}`).bind(...summaryBindings),
  ]);

  const total = Number((countResult.results?.[0] as { total?: number } | undefined)?.total || 0);
  return jsonResponse({
    students: rowsResult.results || [],
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    summary: summaryResult.results?.[0] || { total: 0, active: 0, archived: 0, pending_profiles: 0 },
    ranks: RANKS,
    suggestedStudentId: await suggestedStudentId(db, isRenShinKanSuperAdmin(session) ? session.selectedDojoId || DEFAULT_DOJO_ID : session.selectedDojoId || "__none__"),
    dojos: (await db.prepare(`SELECT id, official_name, short_name, code, logo_url, slug, active, sort_order
      FROM dojos WHERE active = 1 ${isRenShinKanSuperAdmin(session) ? "" : "AND id = ?"}
      ORDER BY sort_order, official_name COLLATE NOCASE`)
      .bind(...(isRenShinKanSuperAdmin(session) ? [] : [session.selectedDojoId || "__none__"])).all()).results || [],
  }, 200, { "Cache-Control": "no-store" });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Forbidden" }, 403);
  const session = await getAuthorizedAdminSession(request, env);
  if (!session) return jsonResponse({ error: "Unauthorized" }, 401);
  const requestId = requestIdentifier(request);
  try {
    const body = await request.json<Record<string, unknown>>();
    const displayName = String(body.displayName || "").normalize("NFKC").trim().replace(/\s+/g, " ");
    const currentBelt = normalizeRank(body.currentBelt || "Unranked");
    const dojoId = isRenShinKanSuperAdmin(session)
      ? String(body.dojoId || session.selectedDojoId || "").trim()
      : session.selectedDojoId || "";
    const adminNotes = String(body.adminNotes || "").trim();
    const currentTrainingHours = Number(body.currentTrainingHours ?? 0);
    const profileImageUrl = validProfileUrl(body.profileImageUrl);
    const manualStudentId = body.manualStudentId === true;

    if (!displayName || displayName.length > 120) return jsonResponse({ error: "Enter a student name of 120 characters or fewer." }, 400);
    if (!currentBelt) return jsonResponse({ error: "Choose a valid rank from the official progression." }, 400);
    const dojo = await activeDojo(requireStudentDb(env), dojoId);
    if (!dojo) return jsonResponse({ error: "Choose an active dojo." }, 400);
    if (!canAccessDojo(session, dojo.id)) return jsonResponse({ error: "You do not have access to that dojo." }, 403);
    if (adminNotes.length > 5_000) return jsonResponse({ error: "Additional information must be 5,000 characters or fewer." }, 400);
    if (!Number.isFinite(currentTrainingHours) || currentTrainingHours < 0 || currentTrainingHours > 1_000_000) return jsonResponse({ error: "Current training hours must be zero or a positive number." }, 400);
    if (profileImageUrl === undefined) return jsonResponse({ error: "The profile image location is invalid." }, 400);

    const db = requireStudentDb(env);
    const aatNumber = String(body.aatNumber || "").normalize("NFKC").trim().slice(0, 40) || null;
    const aatLastPaidDate = typeof body.aatLastPaidDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.aatLastPaidDate) ? body.aatLastPaidDate : null;
    const requestedId = normalizeStudentId(String(body.studentId || ""));
    if (manualStudentId && !isValidStudentId(requestedId)) return jsonResponse({ error: "Student ID must use a format such as RSK-6901." }, 400);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const shareFields = JSON.stringify(body.shareFields && typeof body.shareFields === "object" ? body.shareFields : DEFAULT_SHARE_FIELDS);
    let studentId = requestedId;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (!manualStudentId) studentId = await nextStudentId(db, dojo.id);
      const duplicate = await db.prepare("SELECT id FROM students WHERE UPPER(public_student_id) = ? LIMIT 1").bind(studentId).first();
      if (duplicate) {
        if (manualStudentId) return jsonResponse({ error: "That Student ID is already in use." }, 409);
        continue;
      }
      const nameHash = await studentNameVerificationHash(env, displayName);
      try {
        const cycle = await db.prepare("SELECT id FROM examination_cycles WHERE status = 'active' ORDER BY created_at DESC LIMIT 1")
          .first<{ id: string }>();
        const currentMonth = currentBangkokMonthKey();
        const contributionPeriod = await db.prepare("SELECT month_key FROM contribution_periods WHERE month_key = ? LIMIT 1")
          .bind(currentMonth).first<{ month_key: string }>();
        const statements = [db.prepare(`INSERT INTO students (
          id, public_student_id, lookup_code_hash, name_verification_hash, display_name, current_belt, belt_color,
          profile_image_url, profile_image_consent, guardian_consent, public_visible, active, share_fields, dojo_name,
          admin_notes, training_hours_adjustment, profile_status, dojo_id, aat_number, aat_last_paid_date, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, 'approved', ?, ?, ?, ?, ?)`)
          .bind(id, studentId, "", nameHash, displayName, currentBelt, rankColor(currentBelt),
            profileImageUrl, body.profileImageConsent ? 1 : 0, body.guardianConsent ? 1 : 0,
            body.publicVisible === false ? 0 : 1, shareFields, dojo.official_name, adminNotes, currentTrainingHours,
            dojo.id, aatNumber, aatLastPaidDate, now, now)];
        if (cycle) {
          statements.push(db.prepare(`INSERT OR IGNORE INTO exam_cycle_student_status (
            id, student_id, cycle_id, student_name_snapshot, student_public_id_snapshot,
            current_rank_snapshot, status, updated_at, updated_by
            ) VALUES (?, ?, ?, ?, ?, ?, 'not_signed_up', ?, ?)`)
            .bind(crypto.randomUUID(), id, cycle.id, displayName, studentId, currentBelt, now, session.adminName));
        }
        if (contributionPeriod && dojo.id === "dojo-rsk") {
          statements.push(
            db.prepare(`INSERT OR IGNORE INTO contribution_period_students (
              id, month_key, student_id, student_name_snapshot, student_public_id_snapshot,
              current_rank_snapshot, active_at_period_start, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, 1, ?)`)
              .bind(crypto.randomUUID(), currentMonth, id, displayName, studentId, currentBelt, now),
            db.prepare(`UPDATE contribution_periods SET active_student_count_snapshot = (
              SELECT COUNT(*) FROM contribution_period_students r
              JOIN students s ON s.id = r.student_id
              WHERE r.month_key = ? AND r.active_at_period_start = 1 AND s.dojo_id = 'dojo-rsk'
            ) WHERE month_key = ?`).bind(currentMonth, currentMonth),
          );
        }
        if (aatLastPaidDate) {
          const membershipPaymentId = crypto.randomUUID();
          statements.push(
            db.prepare(`INSERT INTO aat_membership_payments (id, student_id, dojo_id, payment_date,
              renewal_due_date, amount, currency, notes, recorded_by, recorded_by_role, recorded_by_dojo_id, created_at)
              VALUES (?, ?, ?, ?, ?, NULL, 'THB', 'Recorded during student creation', ?, ?, ?, ?)`)
              .bind(membershipPaymentId, id, dojo.id, aatLastPaidDate, addOneCalendarYear(aatLastPaidDate), session.adminName, isRenShinKanSuperAdmin(session) ? "central" : "dojo", session.selectedDojoId, now),
            db.prepare(`INSERT INTO payments (id, student_id, dojo_id, payment_type, amount, currency, payment_date,
              status, reference, notes, recorded_by, created_at, updated_at)
              VALUES (?, ?, ?, 'aat_annual', NULL, 'THB', ?, 'paid', ?, 'Recorded during student creation', ?, ?, ?)`)
              .bind(membershipPaymentId, id, dojo.id, aatLastPaidDate, `AAT ${aatLastPaidDate}`, session.adminName, now, now),
            db.prepare(`INSERT INTO payment_history (id, payment_id, previous_status, new_status, changed_by, notes, created_at)
              VALUES (?, ?, NULL, 'paid', ?, 'Recorded during student creation', ?)`)
              .bind(crypto.randomUUID(), membershipPaymentId, session.adminName, now),
          );
        }
        if (manualStudentId) {
          const sequenceStatement = syncStudentIdSequenceStatement(db, dojo.id, dojo.code, studentId, now);
          if (sequenceStatement) statements.push(sequenceStatement);
        }
        statements.push(auditStatement(db, {
          actorType: "administrator", ...adminAuditMetadata(session, request), action: "student_created", entityType: "student", entityId: id,
          studentId: id, previousValues: null, newValues: { studentId, displayName, currentBelt, currentTrainingHours, dojoId: dojo.id, dojoName: dojo.official_name, aatNumber, aatLastPaidDate, profileImageUrl, profileImageConsent: Boolean(body.profileImageConsent && profileImageUrl), active: true },
          studentPublicId: studentId, studentNameSnapshot: displayName,
          source: "admin_students", requestId, summary: `Created student record ${studentId}`, createdAt: now,
        }));
        await db.batch(statements);
        return jsonResponse({ ok: true, id, studentId }, 201);
      } catch (error) {
        const duplicateError = error instanceof Error && error.message.includes("UNIQUE");
        if (!duplicateError || manualStudentId || attempt === 4) throw error;
      }
    }
    return jsonResponse({ error: "A unique Student ID could not be allocated. Please try again." }, 409);
  } catch (error) {
    const duplicate = error instanceof Error && error.message.includes("UNIQUE");
    return jsonResponse({ error: duplicate ? "That Student ID is already in use." : error instanceof Error ? error.message : "The student could not be added." }, duplicate ? 409 : 400);
  }
};
