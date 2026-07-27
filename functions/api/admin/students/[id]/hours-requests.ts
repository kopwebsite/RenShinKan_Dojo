import { getAuthorizedAdminSession, isSameOriginRequest, jsonResponse } from "../../../../_lib/auth";
import { adminAuditMetadata, assertStudentAccess, auditStatement, requestIdentifier, requireStudentDb, studentTotal, type D1PreparedStatement, type StudentEnv } from "../../../../_lib/studentRecords";

type Env = StudentEnv & { SESSION_SECRET?: string };

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Forbidden" }, 403);
  const session = await getAuthorizedAdminSession(request, env);
  if (!session) return jsonResponse({ error: "Unauthorized" }, 401);
  const operationRequestId = requestIdentifier(request);
  try {
    const body = await request.json<{ hourRequestId?: unknown; action?: unknown; studentVisibleNote?: unknown; internalNote?: unknown }>();
    const hourRequestId = typeof body.hourRequestId === "string" ? body.hourRequestId : "";
    const action = body.action === "approve" || body.action === "reject" ? body.action : "";
    const studentVisibleNote = typeof body.studentVisibleNote === "string" ? body.studentVisibleNote.trim().slice(0, 1000) : "";
    const internalNote = typeof body.internalNote === "string" ? body.internalNote.trim().slice(0, 1000) : "";
    if (!hourRequestId || !action) return jsonResponse({ error: "Choose a pending request and review action." }, 400);
    if (action === "reject" && !studentVisibleNote) return jsonResponse({ error: "Add a short explanation that the student can see." }, 400);
    const db = requireStudentDb(env);
    const studentId = String(params.id);
    const access = await assertStudentAccess(db, session, studentId);
    if (!access.ok) return jsonResponse({ error: access.error }, access.status);
    const pending = await db.prepare(`SELECT id, submitted_hours, previous_total, requested_total, status,
      training_date, source_type, organization, source_details, student_notes, hours_quarters FROM training_hour_requests
      WHERE id = ? AND student_id = ? LIMIT 1`).bind(hourRequestId, studentId)
      .first<{
        id: string; submitted_hours: number; previous_total: number; requested_total: number; status: string;
        training_date: string | null; source_type: string | null; organization: string | null;
        source_details: string | null; student_notes: string | null; hours_quarters: number | null;
      }>();
    if (!pending) return jsonResponse({ error: "Training-hour request not found." }, 404);
    if (pending.status !== "pending") return jsonResponse({ error: "This request has already been reviewed." }, 409);
    const now = new Date().toISOString();
    const statements: D1PreparedStatement[] = [];
    let resultingTotal: number | null = null;
    if (action === "approve") {
      const currentTotal = await studentTotal(db, studentId);
      if (currentTotal === null) return jsonResponse({ error: "Student not found." }, 404);
      resultingTotal = currentTotal + Number(pending.submitted_hours);
      const hourId = crypto.randomUUID();
      statements.push(
        db.prepare(`INSERT INTO training_hours
          (id, student_id, entry_date, verified_hours, source, internal_note, created_at, hour_request_id,
           source_type, organization, source_details, notes, hours_quarters)
          VALUES (?, ?, ?, ?, 'student_self_service_approved', ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(hourId, studentId, pending.training_date || now.slice(0, 10), pending.submitted_hours,
            internalNote || null, now, pending.id, pending.source_type, pending.organization,
            pending.source_details, pending.student_notes, pending.hours_quarters),
        db.prepare("UPDATE students SET updated_at = ? WHERE id = ?").bind(now, studentId),
      );
    }
    statements.push(
      db.prepare(`INSERT INTO request_decisions
        (id, request_type, request_id, decision, reviewer_identifier, student_visible_note, internal_admin_note, decided_at)
        VALUES (?, 'training_hours', ?, ?, ?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), hourRequestId, action === "approve" ? "approved" : "denied", session.adminName, studentVisibleNote, internalNote, now),
      db.prepare(`UPDATE training_hour_requests SET status = ?, reviewed_at = ?, reviewed_by = ?, review_note = ?,
        student_visible_note = ?, internal_admin_note = ? WHERE id = ? AND status = 'pending'`)
        .bind(action === "approve" ? "approved" : "rejected", now, session.adminName, internalNote || null, studentVisibleNote, internalNote, hourRequestId),
      auditStatement(db, {
        actorType: "administrator", ...adminAuditMetadata(session, request), action: action === "approve" ? "student_hours_approved" : "student_hours_rejected",
        entityType: "training_hour_request", entityId: hourRequestId, studentId,
        previousValues: { status: "pending", submittedHours: pending.submitted_hours, previousTotal: pending.previous_total, requestedTotal: pending.requested_total },
        newValues: {
          status: action === "approve" ? "approved" : "rejected", resultingTotal, studentVisibleNote,
          trainingDate: pending.training_date, sourceType: pending.source_type,
          organization: pending.organization, sourceDetails: pending.source_details,
        }, source: "admin_student_hours_review",
        requestId: operationRequestId, administratorNote: internalNote || null,
        summary: `${action === "approve" ? "Approved" : "Rejected"} ${pending.submitted_hours} student-submitted training hours`, createdAt: now,
      }),
    );
    await db.batch(statements);
    return jsonResponse({ ok: true, status: action === "approve" ? "approved" : "rejected", resultingTotal });
  } catch (error) {
    const conflict = error instanceof Error && /(?:UNIQUE constraint|request_decisions)/i.test(error.message);
    return jsonResponse({ error: conflict ? "Another administrator has already reviewed this training-hour request." : error instanceof Error ? error.message : "The hours request could not be reviewed." }, conflict ? 409 : 400);
  }
};
