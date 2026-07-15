import { rankIndex } from "../../../shared/ranks";
import { jsonResponse } from "../../_lib/auth";
import {
  auditStatement,
  enforceLookupRateLimit,
  namesLikelyMatch,
  normalizeInternationalPhone,
  normalizeStudentId,
  normalizedRankOrError,
  requestIdentifier,
  requireStudentDb,
  type StudentEnv,
  verifyTurnstile,
} from "../../_lib/studentRecords";

type Payload = Record<string, unknown> & {
  verificationName?: unknown;
  studentId?: unknown;
  attemptedRank?: unknown;
  turnstileToken?: unknown;
  promiseAccepted?: unknown;
};

function text(value: unknown, max: number, required = false) {
  const result = typeof value === "string" ? value.normalize("NFKC").trim().replace(/\s+/g, " ") : "";
  if (result.length > max || (required && !result)) throw new Error(required ? "Complete every required application field." : `A response is longer than ${max} characters.`);
  return result;
}

function ageOnDate(dateOfBirth: string, at: Date) {
  const dob = new Date(`${dateOfBirth}T12:00:00Z`);
  if (Number.isNaN(dob.getTime()) || dob > at) return null;
  let age = at.getUTCFullYear() - dob.getUTCFullYear();
  if (at.getUTCMonth() < dob.getUTCMonth() || (at.getUTCMonth() === dob.getUTCMonth() && at.getUTCDate() < dob.getUTCDate())) age -= 1;
  return age >= 0 && age <= 120 ? age : null;
}

export const onRequestPost: PagesFunction<StudentEnv> = async ({ request, env }) => {
  const requestId = requestIdentifier(request);
  try {
    if (!(await enforceLookupRateLimit(request, env))) return jsonResponse({ error: "Too many requests. Please wait and try again." }, 429);
    const db = requireStudentDb(env);
    const replay = await db.prepare("SELECT response_json FROM mutation_requests WHERE request_id = ? LIMIT 1").bind(requestId)
      .first<{ response_json: string | null }>();
    if (replay?.response_json) return jsonResponse(JSON.parse(replay.response_json), 200, { "Cache-Control": "no-store" });
    const body = await request.json<Payload>();
    const verificationName = text(body.verificationName, 120, true);
    const publicStudentId = normalizeStudentId(text(body.studentId, 40, true));
    const turnstileToken = text(body.turnstileToken, 2048, true);
    if (!(await verifyTurnstile(request, env, turnstileToken))) return jsonResponse({ error: "Cloudflare verification failed. Please try again." }, 400);
    const student = await db.prepare(`SELECT id, public_student_id, display_name, current_belt FROM students
      WHERE UPPER(public_student_id) = ?
      AND active = 1 AND public_visible = 1 AND profile_status = 'approved' LIMIT 1`)
      .bind(publicStudentId)
      .first<{ id: string; public_student_id: string; display_name: string; current_belt: string }>();
    if (!student || !namesLikelyMatch(verificationName, student.display_name)) {
      return jsonResponse({ error: "The student verification details do not match an approved record." }, 403);
    }
    const attemptedRank = normalizedRankOrError(body.attemptedRank);
    const currentRank = normalizedRankOrError(student.current_belt);
    if (rankIndex(attemptedRank) <= rankIndex(currentRank)) return jsonResponse({ error: "The attempted rank must be above the student's current rank." }, 400);
    if (body.promiseAccepted !== true) return jsonResponse({ error: "Confirm the Aikido Association Thailand promise before submitting." }, 400);

    const nowDate = new Date();
    const now = nowDate.toISOString();
    const dateOfBirth = text(body.dateOfBirth, 10, true);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return jsonResponse({ error: "Enter a valid date of birth." }, 400);
    const age = ageOnDate(dateOfBirth, nowDate);
    if (age === null) return jsonResponse({ error: "Enter a valid date of birth." }, 400);

    const telephoneCountry = text(body.phoneCountry, 80, true);
    const telephoneCallingCode = text(body.phoneCallingCode, 8, true);
    const telephone = normalizeInternationalPhone(telephoneCallingCode, body.phone);
    const answers: Record<string, string | number | boolean> = {
      aat_number: text(body.aatNumber, 40),
      date: now.slice(0, 10),
      name: text(body.firstName, 80, true),
      surname: text(body.surname, 80, true),
      nationality: text(body.nationality, 80, true),
      sex: text(body.sex, 60, true),
      dob: dateOfBirth,
      age: age,
      permanent_address: text(body.permanentAddress, 500, true),
      present_address: text(body.presentAddress, 500),
      telephone_country: `${telephoneCountry} (${telephoneCallingCode})`,
      tel: telephone,
      school: text(body.school, 160),
      class: text(body.classLevel, 80),
      office: text(body.office, 160),
      position: text(body.position, 120),
      certificate: text(body.certificate, 200),
      games_experience: text(body.gamesExperience, 1000),
      applicant_signature: text(body.applicantSignature, 160, true),
      promise_accepted: true,
      current_rank: currentRank,
      attempted_rank: attemptedRank,
      official_note: "",
    };
    for (let index = 1; index <= 13; index += 1) answers[`official_rank_${index}`] = "";

    const cycle = await db.prepare("SELECT id, name FROM examination_cycles WHERE status = 'active' ORDER BY created_at DESC LIMIT 1")
      .first<{ id: string; name: string }>();
    if (!cycle) return jsonResponse({ error: "There is no open examination cycle. Please contact a sensei." }, 409);
    const existing = await db.prepare(`SELECT id FROM examination_applications
      WHERE student_id = ? AND cycle_id = ? AND status IN ('application_submitted', 'examination_completed') LIMIT 1`)
      .bind(student.id, cycle.id).first<{ id: string }>();
    if (existing) return jsonResponse({ error: "An application for this student is already open in the current examination cycle." }, 409);

    const existingCycleStatus = await db.prepare(`SELECT id, status FROM exam_cycle_student_status
      WHERE student_id = ? AND cycle_id = ? LIMIT 1`).bind(student.id, cycle.id)
      .first<{ id: string; status: string }>();

    const applicationId = crypto.randomUUID();
    const historyId = crypto.randomUUID();
    const cycleStatusId = existingCycleStatus?.id || crypto.randomUUID();
    const response = { ok: true, applicationId, status: "application_submitted", paymentStatus: "payment_pending", cycle: cycle.name };
    await db.batch([
      db.prepare(`INSERT INTO examination_applications
        (id, student_id, cycle_id, answers_json, current_rank, attempted_rank, status, payment_status,
         submitted_at, updated_at, student_name_snapshot, student_public_id_snapshot)
        VALUES (?, ?, ?, ?, ?, ?, 'application_submitted', 'payment_pending', ?, ?, ?, ?)`)
        .bind(applicationId, student.id, cycle.id, JSON.stringify(answers), currentRank, attemptedRank, now, now, student.display_name, student.public_student_id),
      db.prepare(`INSERT INTO exam_cycle_student_status (
          id, student_id, cycle_id, application_id, student_name_snapshot, student_public_id_snapshot,
          current_rank_snapshot, requested_rank_snapshot, status, application_date, updated_at, updated_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'unpaid', ?, ?, ?)
        ON CONFLICT(student_id, cycle_id) DO UPDATE SET
          application_id = excluded.application_id,
          student_name_snapshot = excluded.student_name_snapshot,
          student_public_id_snapshot = excluded.student_public_id_snapshot,
          current_rank_snapshot = excluded.current_rank_snapshot,
          requested_rank_snapshot = excluded.requested_rank_snapshot,
          status = 'unpaid', application_date = excluded.application_date,
          updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
        .bind(cycleStatusId, student.id, cycle.id, applicationId, student.display_name, student.public_student_id,
          currentRank, attemptedRank, now, now, student.id),
      db.prepare(`INSERT INTO exam_cycle_status_history
        (id, cycle_status_id, previous_status, new_status, actor_identifier, request_id, note, created_at)
        VALUES (?, ?, ?, 'unpaid', ?, ?, 'Application submitted', ?)`)
        .bind(crypto.randomUUID(), cycleStatusId, existingCycleStatus?.status || "not_signed_up", student.id, requestId, now),
      db.prepare(`INSERT INTO application_status_history
        (id, application_id, new_status, new_payment_status, actor_identifier, note, request_id, created_at)
        VALUES (?, ?, 'application_submitted', 'payment_pending', ?, 'Application submitted', ?, ?)`)
        .bind(historyId, applicationId, student.id, requestId, now),
      auditStatement(db, {
        actorType: "student", actorIdentifier: student.id, action: "examination_application_submitted", entityType: "examination_application",
        entityId: applicationId, studentId: student.id, newValues: { currentRank, attemptedRank, status: "application_submitted", paymentStatus: "payment_pending", cycleId: cycle.id },
        studentPublicId: student.public_student_id, studentNameSnapshot: student.display_name, examCycleId: cycle.id,
        source: "student_examination_application", requestId, summary: `Submitted a belt examination application for ${attemptedRank}`, createdAt: now,
      }),
      db.prepare("INSERT INTO mutation_requests (request_id, actor_type, action, response_json, created_at) VALUES (?, 'student', 'examination_application_submitted', ?, ?)")
        .bind(requestId, JSON.stringify(response), now),
    ]);
    return jsonResponse(response, 201, { "Cache-Control": "no-store" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The application could not be submitted.";
    return jsonResponse({ error: message.includes("UNIQUE") ? "This application was already submitted." : message }, message.includes("UNIQUE") ? 409 : 400);
  }
};
