import { hasValidAdminSession, isSameOriginRequest, jsonResponse } from "../../../../_lib/auth";
import { auditStatement, requestIdentifier, requireStudentDb, type StudentEnv } from "../../../../_lib/studentRecords";

type Env = StudentEnv & { SESSION_SECRET?: string };

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!isSameOriginRequest(request) || !(await hasValidAdminSession(request, env))) return jsonResponse({ error: "Unauthorized" }, 401);
  const requestId = requestIdentifier(request);
  try {
    const body = await request.json<{ applicationId?: unknown; action?: unknown; note?: unknown; confirmed?: unknown }>();
    const applicationId = typeof body.applicationId === "string" ? body.applicationId : "";
    const action = typeof body.action === "string" ? body.action : "";
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 4000) : "";
    if (!applicationId || !["mark_paid", "reverse_payment", "update_note", "complete"].includes(action)) return jsonResponse({ error: "Choose an application action." }, 400);
    if (action === "reverse_payment" && body.confirmed !== true) return jsonResponse({ error: "Confirm the payment reversal." }, 400);
    const db = requireStudentDb(env);
    const studentId = String(params.id);
    const application = await db.prepare(`SELECT ea.id, ea.status, ea.payment_status, ea.administrator_notes, ea.paid_at, ea.paid_by,
        ea.cycle_id, ea.student_name_snapshot, ea.student_public_id_snapshot,
        ecs.id AS cycle_status_id, ecs.status AS cycle_status
      FROM examination_applications ea
      LEFT JOIN exam_cycle_student_status ecs ON ecs.application_id = ea.id
      WHERE ea.id = ? AND ea.student_id = ? LIMIT 1`).bind(applicationId, studentId)
      .first<{ id: string; status: string; payment_status: string; administrator_notes: string; paid_at: string | null; paid_by: string | null;
        cycle_id: string; student_name_snapshot: string; student_public_id_snapshot: string; cycle_status_id: string | null; cycle_status: string | null }>();
    if (!application) return jsonResponse({ error: "Application not found." }, 404);
    const now = new Date().toISOString();
    let nextStatus = application.status;
    let nextPayment = application.payment_status;
    let nextNote = application.administrator_notes;
    let auditAction = "application_note_updated";
    if (action === "mark_paid") {
      if (application.payment_status === "paid") return jsonResponse({ ok: true, status: application.status, paymentStatus: "paid" });
      nextPayment = "paid";
      auditAction = "payment_confirmed";
    } else if (action === "reverse_payment") {
      if (application.payment_status !== "paid") return jsonResponse({ error: "Payment is not currently marked as paid." }, 409);
      nextPayment = "payment_pending";
      auditAction = "payment_confirmation_reversed";
    } else if (action === "complete") {
      nextStatus = "examination_completed";
      auditAction = "examination_application_completed";
    } else {
      nextNote = note;
    }
    const statements = [
      db.prepare(`UPDATE examination_applications SET status = ?, payment_status = ?, administrator_notes = ?,
        paid_at = ?, paid_by = ?, completed_at = ?, updated_at = ? WHERE id = ?`)
        .bind(
          nextStatus, nextPayment, nextNote,
          nextPayment === "paid" ? application.paid_at || now : null,
          nextPayment === "paid" ? application.paid_by || "primary_admin" : null,
          nextStatus === "examination_completed" ? now : null,
          now, applicationId,
        ),
      db.prepare(`INSERT INTO application_status_history
        (id, application_id, previous_status, new_status, previous_payment_status, new_payment_status,
         actor_identifier, note, request_id, created_at) VALUES (?, ?, ?, ?, ?, ?, 'primary_admin', ?, ?, ?)`)
        .bind(crypto.randomUUID(), applicationId, application.status, nextStatus, application.payment_status, nextPayment, note || null, requestId, now),
      auditStatement(db, {
        actorType: "administrator", actorIdentifier: "primary_admin", action: auditAction, entityType: "examination_application", entityId: applicationId,
        studentId, studentPublicId: application.student_public_id_snapshot, studentNameSnapshot: application.student_name_snapshot,
        previousValues: { status: application.status, paymentStatus: application.payment_status, administratorNotes: application.administrator_notes },
        newValues: { status: nextStatus, paymentStatus: nextPayment, administratorNotes: nextNote }, source: "admin_examination_application",
        requestId, examCycleId: application.cycle_id, administratorNote: note || null, summary: auditAction.replace(/_/g, " "), createdAt: now,
      }),
    ];
    if (application.cycle_status_id && (action === "mark_paid" || action === "reverse_payment")) {
      const cycleStatus = action === "mark_paid" ? "paid" : "unpaid";
      statements.push(
        db.prepare("UPDATE exam_cycle_student_status SET status = ?, updated_at = ?, updated_by = 'primary_admin' WHERE id = ?")
          .bind(cycleStatus, now, application.cycle_status_id),
        db.prepare(`INSERT INTO exam_cycle_status_history
          (id, cycle_status_id, previous_status, new_status, actor_identifier, request_id, note, created_at)
          VALUES (?, ?, ?, ?, 'primary_admin', ?, 'Payment status synchronized', ?)`)
          .bind(crypto.randomUUID(), application.cycle_status_id, application.cycle_status, cycleStatus, requestId, now),
      );
    }
    await db.batch(statements);
    return jsonResponse({ ok: true, status: nextStatus, paymentStatus: nextPayment, administratorNotes: nextNote });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "The application could not be updated." }, 400);
  }
};
