import { rankIndex } from "../../../../../shared/ranks";
import { getAuthorizedAdminSession, isSameOriginRequest, jsonResponse } from "../../../../_lib/auth";
import { adminAuditMetadata, assertStudentAccess, auditStatement, normalizedRankOrError, rankColor, requestIdentifier, requireStudentDb, type StudentEnv } from "../../../../_lib/studentRecords";

type Env = StudentEnv & { SESSION_SECRET?: string };

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Forbidden" }, 403);
  const session = await getAuthorizedAdminSession(request, env);
  if (!session) return jsonResponse({ error: "Unauthorized" }, 401);
  const requestId = requestIdentifier(request);
  try {
    const body = await request.json<{ currentRank?: unknown; attemptedRank?: unknown; passed?: unknown; location?: unknown; examinationDate?: unknown }>();
    const db = requireStudentDb(env);
    const studentId = String(params.id);
    const access = await assertStudentAccess(db, session, studentId);
    if (!access.ok) return jsonResponse({ error: access.error }, access.status);
    const student = await db.prepare("SELECT current_belt FROM students WHERE id = ? LIMIT 1").bind(studentId).first<{ current_belt: string }>();
    if (!student) return jsonResponse({ error: "Student not found." }, 404);
    const currentRank = normalizedRankOrError(body.currentRank ?? student.current_belt);
    const attemptedRank = normalizedRankOrError(body.attemptedRank);
    const passed = body.passed === true;
    const location = typeof body.location === "string" ? body.location.normalize("NFKC").trim().replace(/\s+/g, " ") : "";
    const examinationDate = isCanonicalDate(body.examinationDate) ? body.examinationDate : "";
    const parsedExaminationDate = examinationDate ? new Date(`${examinationDate}T12:00:00.000Z`) : null;
    if (currentRank !== normalizedRankOrError(student.current_belt)) return jsonResponse({ error: "The student's current rank changed. Refresh and try again." }, 409);
    if (rankIndex(attemptedRank) <= rankIndex(currentRank)) return jsonResponse({ error: "The attempted rank must be higher than the current rank." }, 400);
    if (!location || location.length > 200) return jsonResponse({ error: "Enter the examination location." }, 400);
    if (!parsedExaminationDate || Number.isNaN(parsedExaminationDate.getTime()) || parsedExaminationDate.toISOString().slice(0, 10) !== examinationDate) return jsonResponse({ error: "Choose a valid examination date." }, 400);
    const rankAfter = passed ? attemptedRank : currentRank;
    const examId = crypto.randomUUID();
    const now = new Date().toISOString();
    const application = await db.prepare(`SELECT ea.id, ea.status, ea.payment_status FROM examination_applications ea
      JOIN examination_cycles ec ON ec.id = ea.cycle_id AND ec.status = 'active'
      WHERE ea.student_id = ? AND ea.status = 'application_submitted' ORDER BY ea.submitted_at DESC LIMIT 1`)
      .bind(studentId).first<{ id: string; status: string; payment_status: string }>();
    const statements = [
      db.prepare(`INSERT INTO belt_examinations
        (id, student_id, examination_date, belt_awarded, belt_color, rank, examiner, public_notes, internal_notes, created_at,
         rank_before, rank_attempted, passed, examination_location, rank_after, administrator_id, examination_timestamp)
        VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(examId, studentId, examinationDate, attemptedRank, rankColor(attemptedRank), attemptedRank, now, currentRank, attemptedRank, passed ? 1 : 0, location, rankAfter, session.adminName, parsedExaminationDate.toISOString()),
      db.prepare("UPDATE students SET current_belt = ?, belt_color = ?, updated_at = ? WHERE id = ?")
        .bind(rankAfter, rankColor(rankAfter), now, studentId),
      auditStatement(db, {
        actorType: "administrator", ...adminAuditMetadata(session, request), action: passed ? "examination_passed" : "examination_failed",
        entityType: "belt_examination", entityId: examId, studentId,
        previousValues: { currentRank }, newValues: { attemptedRank, passed, location, examinationDate, rankAfter }, source: "admin_student_edit", requestId,
        summary: `Recorded ${passed ? "passed" : "failed"} examination: ${currentRank} → ${rankAfter}`, createdAt: now,
      }),
      db.prepare("INSERT INTO mutation_requests (request_id, actor_type, action, response_json, created_at) VALUES (?, 'administrator', ?, ?, ?)")
        .bind(requestId, passed ? "examination_passed" : "examination_failed", JSON.stringify({ ok: true, id: examId, rankAfter, passed }), now),
    ];
    if (application) {
      statements.splice(statements.length - 1, 0,
        db.prepare(`INSERT INTO request_decisions
          (id, request_type, request_id, decision, reviewer_identifier, student_visible_note, internal_admin_note, decided_at)
          VALUES (?, 'examination_application', ?, 'approved', ?, '', ?, ?)`)
          .bind(crypto.randomUUID(), application.id, session.adminName, passed ? `Examination passed: ${rankAfter}` : `Examination attempt recorded: ${attemptedRank}`, now),
        db.prepare("UPDATE examination_applications SET status = 'examination_completed', completed_at = ?, updated_at = ? WHERE id = ?")
          .bind(now, now, application.id),
        db.prepare(`INSERT INTO application_status_history
          (id, application_id, previous_status, new_status, previous_payment_status, new_payment_status,
           actor_identifier, note, request_id, created_at) VALUES (?, ?, ?, 'examination_completed', ?, ?, ?, ?, ?, ?)`)
          .bind(crypto.randomUUID(), application.id, application.status, application.payment_status, application.payment_status,
            session.adminName, passed ? `Examination passed: ${rankAfter}` : `Examination attempt recorded: ${attemptedRank}`, requestId, now),
      );
    }
    await db.batch(statements);
    return jsonResponse({ ok: true, id: examId, rankAfter, passed }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The examination could not be recorded.";
    const conflict = /(?:UNIQUE|request_decisions|cannot be completed)/i.test(message);
    return jsonResponse({ error: conflict ? "This examination application was already processed." : message }, conflict ? 409 : 400);
  }
};
import { isCanonicalDate } from "../../../../../shared/date";
