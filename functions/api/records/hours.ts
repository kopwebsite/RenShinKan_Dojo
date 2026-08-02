import { jsonResponse } from "../../_lib/auth";
import {
  auditStatement,
  normalizeStudentId,
  requestIdentifier,
  requireStudentDb,
  studentTotal,
  type StudentEnv,
  validStudentAccessSession,
} from "../../_lib/studentRecords";
import { isCanonicalDate } from "../../../shared/date";

type Payload = {
  studentId?: unknown; accessToken?: unknown; hours?: unknown; trainingDate?: unknown;
  sourceType?: unknown; organization?: unknown; sourceDetails?: unknown; notes?: unknown;
};

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, max + 1) : "";
}

export const onRequestPost: PagesFunction<StudentEnv> = async ({ request, env }) => {
  const requestId = requestIdentifier(request);
  try {
    const db = requireStudentDb(env);
    const replay = await db.prepare("SELECT response_json FROM mutation_requests WHERE request_id = ? LIMIT 1").bind(requestId)
      .first<{ response_json: string | null }>();
    if (replay?.response_json) return jsonResponse(JSON.parse(replay.response_json), 200, { "Cache-Control": "no-store" });
    const body = await request.json<Payload>();
    const publicStudentId = normalizeStudentId(typeof body.studentId === "string" ? body.studentId : "");
    const accessToken = typeof body.accessToken === "string" ? body.accessToken : "";
    const hours = Number(body.hours);
    const hoursQuarters = Math.round(hours * 4);
    const trainingDate = isCanonicalDate(body.trainingDate) ? String(body.trainingDate) : "";
    const sourceType = body.sourceType === "renshinkan" || body.sourceType === "aat" || body.sourceType === "other" ? body.sourceType : "";
    const organization = clean(body.organization, 160);
    const sourceDetails = clean(body.sourceDetails, 240);
    const notes = clean(body.notes, 1000);
    if (!Number.isFinite(hours) || hours <= 0 || hours > 1000 || Math.abs(hoursQuarters / 4 - hours) > 0.0001) {
      return jsonResponse({ error: "Enter hours in quarter-hour increments, up to 1,000." }, 400);
    }
    if (!trainingDate) return jsonResponse({ error: "Enter the training date in DD/MM/YYYY Gregorian format." }, 400);
    if (!sourceType) return jsonResponse({ error: "Choose where the training hours came from." }, 400);
    if (sourceType === "other" && !sourceDetails) return jsonResponse({ error: "Describe the other training source." }, 400);
    if (organization.length > 160 || sourceDetails.length > 240 || notes.length > 1000) return jsonResponse({ error: "One of the training details is too long." }, 400);
    const student = await db.prepare(`SELECT s.id FROM students s
      WHERE (UPPER(s.public_student_id) = ? OR EXISTS (
        SELECT 1 FROM student_id_aliases a WHERE a.student_id = s.id
        AND UPPER(a.alias_public_student_id) = ?
      )) AND s.active = 1 AND s.public_visible = 1
      AND s.profile_status IN ('pending_admin_approval', 'approved') LIMIT 1`)
      .bind(publicStudentId, publicStudentId).first<{ id: string }>();
    if (!student) return jsonResponse({ error: "The verified student session is unavailable. Look up the record again." }, 403);
    const session = await validStudentAccessSession(db, student.id, accessToken);
    if (!session) return jsonResponse({ error: "Your secure record session expired. Look up the record again before submitting hours." }, 403);
    const previousTotal = await studentTotal(db, student.id);
    if (previousTotal === null) return jsonResponse({ error: "Student record not found." }, 404);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const response = { ok: true, id, status: "pending", previousTotal, requestedTotal: previousTotal + hoursQuarters / 4 };
    await db.batch([
      db.prepare(`INSERT INTO training_hour_requests
        (id, student_id, submitted_hours, previous_total, requested_total, status, submitted_at, request_id,
         training_date, source_type, organization, source_details, student_notes, hours_quarters)
        VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(id, student.id, hoursQuarters / 4, previousTotal, previousTotal + hoursQuarters / 4, now, requestId,
          trainingDate, sourceType, organization || null, sourceDetails || null, notes || null, hoursQuarters),
      db.prepare("UPDATE student_access_sessions SET used_at = ? WHERE id = ? AND used_at IS NULL").bind(now, session.id),
      auditStatement(db, {
        actorType: "student", actorIdentifier: student.id, action: "training_hours_submitted", entityType: "training_hour_request", entityId: id,
        studentId: student.id, previousValues: { totalHours: previousTotal },
        newValues: {
          hoursEntered: hoursQuarters / 4, requestedTotal: previousTotal + hoursQuarters / 4,
          trainingDate, sourceType, organization: organization || null, sourceDetails: sourceDetails || null,
          notes: notes || null, reviewStatus: "pending",
        },
        source: "student_self_service", requestId, summary: `Submitted ${hours} training hours for administrator review`, createdAt: now,
      }),
      db.prepare("INSERT INTO mutation_requests (request_id, actor_type, action, response_json, created_at) VALUES (?, 'student', 'training_hours_submitted', ?, ?)")
        .bind(requestId, JSON.stringify(response), now),
    ]);
    return jsonResponse(response, 201, { "Cache-Control": "no-store" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Training hours could not be submitted.";
    return jsonResponse({ error: message.includes("UNIQUE") ? "These hours were already submitted." : message }, message.includes("UNIQUE") ? 409 : 400);
  }
};
