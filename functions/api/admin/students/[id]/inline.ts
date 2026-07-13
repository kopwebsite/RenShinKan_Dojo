import { hasValidAdminSession, isSameOriginRequest, jsonResponse } from "../../../../_lib/auth";
import { auditStatement, normalizedRankOrError, rankColor, requestIdentifier, requireStudentDb, type StudentEnv } from "../../../../_lib/studentRecords";

type Env = StudentEnv & { SESSION_SECRET?: string };

export const onRequestPatch: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!isSameOriginRequest(request) || !(await hasValidAdminSession(request, env))) return jsonResponse({ error: "Unauthorized" }, 401);
  const requestId = requestIdentifier(request);
  try {
    const db = requireStudentDb(env);
    const id = String(params.id);
    const body = await request.json<{ field?: unknown; value?: unknown }>();
    const student = await db.prepare(`SELECT s.current_belt, s.belt_color, s.training_hours_adjustment,
      COALESCE((SELECT SUM(verified_hours) FROM training_hours h WHERE h.student_id = s.id), 0) AS recorded_hours
      FROM students s WHERE s.id = ? LIMIT 1`).bind(id)
      .first<{ current_belt: string; belt_color: string; training_hours_adjustment: number; recorded_hours: number }>();
    if (!student) return jsonResponse({ error: "Student not found." }, 404);
    const now = new Date().toISOString();

    if (body.field === "total_hours") {
      const previous = Number(student.recorded_hours || 0) + Number(student.training_hours_adjustment || 0);
      const next = Number(body.value);
      if (!Number.isFinite(next) || next < 0 || next > 1_000_000) return jsonResponse({ error: "Training hours must be zero or a positive number." }, 400);
      const response = { ok: true, field: "total_hours", previousValue: previous, value: next };
      await db.batch([
        db.prepare("UPDATE students SET training_hours_adjustment = ?, updated_at = ? WHERE id = ?")
          .bind(next - Number(student.recorded_hours || 0), now, id),
        auditStatement(db, {
          actorType: "administrator", actorIdentifier: "primary_admin", action: "training_hours_total_edited", entityType: "student", entityId: id,
          studentId: id, previousValues: { totalHours: previous }, newValues: { totalHours: next }, source: "admin_inline_edit", requestId,
          summary: `Edited total training hours (${previous} → ${next})`, createdAt: now,
        }),
        db.prepare("INSERT INTO mutation_requests (request_id, actor_type, action, response_json, created_at) VALUES (?, 'administrator', 'training_hours_total_edited', ?, ?)")
          .bind(requestId, JSON.stringify(response), now),
      ]);
      return jsonResponse(response);
    }

    if (body.field === "current_rank") {
      const next = normalizedRankOrError(body.value);
      const previous = normalizedRankOrError(student.current_belt);
      const response = { ok: true, field: "current_rank", previousValue: previous, value: next };
      if (next === previous) return jsonResponse(response);
      await db.batch([
        db.prepare("UPDATE students SET current_belt = ?, belt_color = ?, updated_at = ? WHERE id = ?")
          .bind(next, rankColor(next, student.belt_color), now, id),
        auditStatement(db, {
          actorType: "administrator", actorIdentifier: "primary_admin", action: "rank_changed", entityType: "student", entityId: id,
          studentId: id, previousValues: { currentRank: previous }, newValues: { currentRank: next }, source: "admin_inline_edit", requestId,
          summary: `Changed current rank (${previous} → ${next})`, createdAt: now,
        }),
        db.prepare("INSERT INTO mutation_requests (request_id, actor_type, action, response_json, created_at) VALUES (?, 'administrator', 'rank_changed', ?, ?)")
          .bind(requestId, JSON.stringify(response), now),
      ]);
      return jsonResponse(response);
    }
    return jsonResponse({ error: "Choose a supported inline field." }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The inline change could not be saved.";
    return jsonResponse({ error: message.includes("UNIQUE") ? "This update was already applied." : message }, message.includes("UNIQUE") ? 409 : 400);
  }
};
