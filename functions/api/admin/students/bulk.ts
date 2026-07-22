import { promoteRank } from "../../../../shared/ranks";
import { canAccessDojo, getAuthorizedAdminSession, isSameOriginRequest, jsonResponse } from "../../../_lib/auth";
import { adminAuditMetadata, auditStatement, rankColor, requestIdentifier, requireStudentDb, type D1PreparedStatement, type StudentEnv } from "../../../_lib/studentRecords";

type Env = StudentEnv & { SESSION_SECRET?: string };
type Student = { id: string; display_name: string; current_belt: string; total_hours: number; dojo_id: string; active: number; profile_status: string; archived_at: string | null };
type PendingHourRequest = { id: string; student_id: string; submitted_hours: number; previous_total: number; requested_total: number };

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Forbidden" }, 403);
  const session = await getAuthorizedAdminSession(request, env);
  if (!session) return jsonResponse({ error: "Unauthorized" }, 401);
  const requestId = requestIdentifier(request);
  const bulkOperationId = crypto.randomUUID();
  const db = requireStudentDb(env);
  try {
    const replay = await db.prepare("SELECT response_json FROM mutation_requests WHERE request_id = ? LIMIT 1").bind(requestId)
      .first<{ response_json: string | null }>();
    if (replay?.response_json) return jsonResponse(JSON.parse(replay.response_json), 200);
    const body = await request.json<{ action?: unknown; studentIds?: unknown; hours?: unknown; levels?: unknown; location?: unknown; examinationDate?: unknown }>();
    const action = body.action === "add_hours" || body.action === "approve_pending_hours" || body.action === "mass_rank_change" || body.action === "mass_promotion" ? body.action : "";
    const studentIds = Array.isArray(body.studentIds)
      ? Array.from(new Set(body.studentIds.filter((value): value is string => typeof value === "string" && value.length >= 8))).slice(0, 50)
      : [];
    if (!action || studentIds.length === 0) return jsonResponse({ error: "Select at least one student and choose a bulk action." }, 400);
    const placeholders = studentIds.map(() => "?").join(",");
    const students = (await db.prepare(`SELECT s.id, s.display_name, s.current_belt, s.dojo_id, s.active, s.profile_status, s.archived_at,
      COALESCE((SELECT SUM(verified_hours) FROM training_hours h WHERE h.student_id = s.id), 0) + s.training_hours_adjustment AS total_hours
      FROM students s WHERE s.id IN (${placeholders})`).bind(...studentIds).all<Student>()).results || [];
    if (students.length !== studentIds.length) return jsonResponse({ error: "One or more selected students no longer exist. Refresh and try again." }, 409);
    if (students.some((student) => !canAccessDojo(session, student.dojo_id))) return jsonResponse({ error: "One or more selected students belongs to another dojo." }, 403);
    if (students.some((student) => student.active !== 1 || student.archived_at || student.profile_status !== "approved")) {
      return jsonResponse({ error: "Active-student actions can only be applied to active, approved records. Refresh the selection and try again." }, 409);
    }
    const now = new Date().toISOString();
    const statements: D1PreparedStatement[] = [];
    const results: Array<Record<string, unknown>> = [];

    if (action === "add_hours") {
      const hours = Number(body.hours);
      const location = typeof body.location === "string" ? body.location.normalize("NFKC").trim().replace(/\s+/g, " ") : "";
      if (!Number.isFinite(hours) || hours <= 0 || hours > 1000) return jsonResponse({ error: "Enter a positive number of hours, up to 1,000." }, 400);
      if (location.length > 200) return jsonResponse({ error: "Training location must be 200 characters or fewer." }, 400);
      for (const student of students) {
        const recordId = crypto.randomUUID();
        const previous = Number(student.total_hours || 0);
        const next = previous + hours;
        statements.push(
          db.prepare(`INSERT INTO request_decisions
            (id, request_type, request_id, decision, reviewer_identifier, student_visible_note, internal_admin_note, decided_at)
            VALUES (?, 'training_hours', ?, 'approved', ?, 'Your submitted training hours were approved.',
              'Approved through the administrator bulk review', ?)`)
            .bind(crypto.randomUUID(), pending.id, session.adminName, now),
          db.prepare(`INSERT INTO training_hours
            (id, student_id, entry_date, verified_hours, source, internal_note, training_location, created_at)
            VALUES (?, ?, ?, ?, 'admin_bulk_hours', NULL, ?, ?)`)
            .bind(recordId, student.id, now.slice(0, 10), hours, location || null, now),
          db.prepare("UPDATE students SET updated_at = ? WHERE id = ?").bind(now, student.id),
          auditStatement(db, {
            actorType: "administrator", ...adminAuditMetadata(session, request), action: "bulk_training_hours_added", entityType: "training_hours",
            entityId: recordId, studentId: student.id, previousValues: { totalHours: previous }, newValues: { hoursAdded: hours, location: location || null, totalHours: next },
            source: "admin_bulk_hours", bulkOperationId, requestId, summary: `Bulk added ${hours} hours${location ? ` at ${location}` : ""} (${previous} → ${next})`, createdAt: now,
          }),
        );
        results.push({ studentId: student.id, name: student.display_name, previousTotal: previous, newTotal: next });
      }
    } else if (action === "approve_pending_hours") {
      const pendingRequests = (await db.prepare(`SELECT id, student_id, submitted_hours, previous_total, requested_total
        FROM training_hour_requests WHERE status = 'pending' AND student_id IN (${placeholders})
        ORDER BY submitted_at ASC, id ASC`).bind(...studentIds).all<PendingHourRequest>()).results || [];
      if (!pendingRequests.length) return jsonResponse({ error: "None of the selected students has a pending training-hour request." }, 409);

      const studentsById = new Map(students.map((student) => [student.id, student]));
      const totals = new Map(students.map((student) => [student.id, Number(student.total_hours || 0)]));
      const approvedByStudent = new Map<string, { requestCount: number; hours: number }>();
      for (const pending of pendingRequests) {
        const student = studentsById.get(pending.student_id);
        if (!student) throw new Error("A pending request belongs to a student outside the selected records.");
        const previous = totals.get(student.id) || 0;
        const next = previous + Number(pending.submitted_hours);
        const hourId = crypto.randomUUID();
        totals.set(student.id, next);
        const approved = approvedByStudent.get(student.id) || { requestCount: 0, hours: 0 };
        approved.requestCount += 1;
        approved.hours += Number(pending.submitted_hours);
        approvedByStudent.set(student.id, approved);
        statements.push(
          db.prepare(`INSERT INTO training_hours
            (id, student_id, entry_date, verified_hours, source, internal_note, created_at, hour_request_id)
            VALUES (?, ?, ?, ?, 'student_self_service_bulk_approved', 'Approved through the administrator bulk review', ?, ?)`)
            .bind(hourId, student.id, now.slice(0, 10), pending.submitted_hours, now, pending.id),
          db.prepare(`UPDATE training_hour_requests SET status = 'approved', reviewed_at = ?, reviewed_by = ?,
            review_note = 'Approved through the administrator bulk review',
            student_visible_note = 'Your submitted training hours were approved.',
            internal_admin_note = 'Approved through the administrator bulk review'
            WHERE id = ? AND status = 'pending'`).bind(now, session.adminName, pending.id),
          auditStatement(db, {
            actorType: "administrator", ...adminAuditMetadata(session, request), action: "bulk_student_hours_approved", entityType: "training_hour_request",
            entityId: pending.id, studentId: student.id,
            previousValues: { status: "pending", submittedHours: pending.submitted_hours, previousTotal: pending.previous_total, requestedTotal: pending.requested_total, currentTotalAtReview: previous },
            newValues: { status: "approved", resultingTotal: next, trainingHourId: hourId }, source: "admin_bulk_hours_approval",
            bulkOperationId, requestId, summary: `Bulk approved ${pending.submitted_hours} student-submitted training hours (${previous} → ${next})`, createdAt: now,
          }),
        );
      }
      for (const student of students) {
        const approved = approvedByStudent.get(student.id);
        if (!approved) continue;
        statements.push(db.prepare("UPDATE students SET updated_at = ? WHERE id = ?").bind(now, student.id));
        results.push({ studentId: student.id, name: student.display_name, requestsApproved: approved.requestCount, hoursApproved: approved.hours, previousTotal: student.total_hours, newTotal: totals.get(student.id) });
      }
    } else {
      const levels = Number(body.levels);
      const location = typeof body.location === "string" ? body.location.normalize("NFKC").trim().replace(/\s+/g, " ") : "";
      const examinationDate = typeof body.examinationDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.examinationDate) ? body.examinationDate : "";
      if (!Number.isInteger(levels) || levels <= 0 || levels > 14) return jsonResponse({ error: "Promotion levels must be a positive whole number." }, 400);
      if (action === "mass_promotion" && (!location || location.length > 200)) return jsonResponse({ error: "Enter the examination location." }, 400);
      if (action === "mass_promotion" && !examinationDate) return jsonResponse({ error: "Choose the examination date." }, 400);
      const promotions = students.map((student) => ({ student, rankAfter: promoteRank(student.current_belt, levels) }));
      const invalid = promotions.find((item) => !item.rankAfter);
      if (invalid) return jsonResponse({ error: `${invalid.student.display_name} cannot be promoted ${levels} level${levels === 1 ? "" : "s"} from ${invalid.student.current_belt}.` }, 400);
      for (const { student, rankAfter } of promotions) {
        const nextRank = rankAfter!;
        if (action === "mass_rank_change") {
          statements.push(
            db.prepare("UPDATE students SET current_belt = ?, belt_color = ?, updated_at = ? WHERE id = ?")
              .bind(nextRank, rankColor(nextRank), now, student.id),
            auditStatement(db, {
              actorType: "administrator", ...adminAuditMetadata(session, request), action: "mass_rank_change", entityType: "student", entityId: student.id,
              studentId: student.id, previousValues: { currentRank: student.current_belt },
              newValues: { levels, rankAfter: nextRank }, source: "admin_mass_rank_change", bulkOperationId, requestId,
              summary: `Mass promotion: ${student.current_belt} → ${nextRank}`, createdAt: now,
            }),
          );
          results.push({ studentId: student.id, name: student.display_name, previousRank: student.current_belt, newRank: nextRank, examinationRecorded: false });
        } else {
          const examId = crypto.randomUUID();
          statements.push(
            db.prepare(`INSERT INTO belt_examinations
              (id, student_id, examination_date, belt_awarded, belt_color, rank, created_at, rank_before, rank_attempted,
               passed, examination_location, rank_after, administrator_id, examination_timestamp, bulk_operation_id)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`)
              .bind(examId, student.id, examinationDate, nextRank, rankColor(nextRank), nextRank, now, student.current_belt, nextRank, location, nextRank, session.adminName, now, bulkOperationId),
            db.prepare("UPDATE students SET current_belt = ?, belt_color = ?, updated_at = ? WHERE id = ?")
              .bind(nextRank, rankColor(nextRank), now, student.id),
            auditStatement(db, {
              actorType: "administrator", ...adminAuditMetadata(session, request), action: "mass_exam_pass", entityType: "belt_examination", entityId: examId,
              studentId: student.id, previousValues: { currentRank: student.current_belt },
              newValues: { levels, rankAfter: nextRank, passed: true, location, examinationDate }, source: "admin_mass_exam_pass", bulkOperationId, requestId,
              summary: `Mass exam pass: ${student.current_belt} → ${nextRank}`, createdAt: now,
            }),
          );
          results.push({ studentId: student.id, name: student.display_name, previousRank: student.current_belt, newRank: nextRank, examinationRecorded: true, examinationDate });
        }
      }
    }

    const affectedStudents = action === "approve_pending_hours" ? results.length : students.length;
    const response = {
      ok: true, action, bulkOperationId, count: affectedStudents, results,
      requestCount: action === "approve_pending_hours" ? results.reduce((total, result) => total + Number(result.requestsApproved || 0), 0) : undefined,
      hoursApproved: action === "approve_pending_hours" ? results.reduce((total, result) => total + Number(result.hoursApproved || 0), 0) : undefined,
    };
    statements.push(db.prepare("INSERT INTO mutation_requests (request_id, actor_type, action, response_json, created_at) VALUES (?, 'administrator', ?, ?, ?)")
      .bind(requestId, action, JSON.stringify(response), now));
    await db.batch(statements);
    return jsonResponse(response, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The bulk operation failed.";
    if (message.includes("UNIQUE")) {
      const replay = await db.prepare("SELECT response_json FROM mutation_requests WHERE request_id = ? LIMIT 1").bind(requestId)
        .first<{ response_json: string | null }>();
      if (replay?.response_json) return jsonResponse(JSON.parse(replay.response_json), 200);
      return jsonResponse({ error: "This bulk operation was already applied." }, 409);
    }
    try {
      await db.prepare(`INSERT INTO operation_failures
        (id, action, entity_type, request_id, error_summary, created_at) VALUES (?, 'bulk_student_update', 'student', ?, ?, ?)`)
        .bind(crypto.randomUUID(), requestId, message.slice(0, 300), new Date().toISOString()).run();
    } catch { /* The original error is still the useful response. */ }
    return jsonResponse({ error: message }, 400);
  }
};
