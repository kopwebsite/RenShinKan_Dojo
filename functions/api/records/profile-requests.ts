import { jsonResponse } from "../../_lib/auth";
import {
  activeDojo,
  auditStatement,
  DEFAULT_SHARE_FIELDS,
  enforceLookupRateLimit,
  ensureOwnerShareUrl,
  issueStudentAccessSession,
  nextStudentId,
  normalizedRankOrError,
  ownerStudentRecord,
  rankColor,
  requestIdentifier,
  requireStudentDb,
  studentNameVerificationHash,
  type D1Database,
  type StudentEnv,
  type StudentRow,
  verifyTurnstile,
} from "../../_lib/studentRecords";
import { datedProfileKey, validateProfileWebp, type R2Bucket } from "../../_lib/storage";
import { isCanonicalDate } from "../../../shared/date";
import { uploadsEnabled } from "../../_lib/operationalControls";

type Env = StudentEnv & { MEDIA_BUCKET?: R2Bucket; UPLOADS_ENABLED?: string };
type ProfilePayload = {
  englishName?: unknown;
  thaiName?: unknown;
  currentRank?: unknown;
  dojoId?: unknown;
  aatNumber?: unknown;
  aatLastPaidDate?: unknown;
  hasAatMembership?: unknown;
  practiceDuration?: unknown;
  turnstileToken?: unknown;
};

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, max + 1) : "";
}

type CreatedProfile = {
  ok: true;
  requestId: string;
  status: "pending_admin_approval";
  studentName: string;
  studentId: string;
  hasAatMembership: boolean;
};

async function completedProfileResponse(
  db: D1Database,
  env: Env,
  request: Request,
  response: CreatedProfile,
) {
  const student = await db.prepare(`SELECT s.id, s.public_student_id, s.display_name, s.english_name, s.thai_name,
    s.account_created_date, s.dojo_joined_date, s.current_belt, s.belt_color,
    s.profile_image_url, s.profile_image_consent, s.public_visible, s.active, s.profile_status, s.share_fields, s.dojo_name,
    s.training_hours_adjustment, s.updated_at, s.created_at, s.dojo_id, s.aat_number, s.aat_last_paid_date,
    s.practice_duration, s.profile_reviewed_at, s.profile_student_visible_note,
    d.logo_url AS dojo_logo
    FROM students s LEFT JOIN dojos d ON d.id = s.dojo_id WHERE s.id = ?
    AND s.active = 1 AND s.public_visible = 1
    AND s.profile_status IN ('pending_admin_approval', 'approved') LIMIT 1`)
    .bind(response.requestId).first<StudentRow>();
  if (!student) return response;
  const record = await ownerStudentRecord(db, student);
  const [share, accessToken] = await Promise.all([
    ensureOwnerShareUrl(db, env, student.id, request),
    issueStudentAccessSession(db, student.id, requestIdentifier(request)),
  ]);
  return {
    ...response,
    record: { ...record, studentAccessToken: accessToken },
    shareUrl: share.url,
    accessToken,
  };
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const requestId = requestIdentifier(request);
  let pendingKey = "";
  let committed = false;
  let committedResponse: CreatedProfile | null = null;
  try {
    if (!(await enforceLookupRateLimit(request, env))) return jsonResponse({ error: "Too many requests. Please wait and try again." }, 429);
    const db = requireStudentDb(env);
    const replay = await db.prepare("SELECT response_json FROM mutation_requests WHERE request_id = ? LIMIT 1").bind(requestId)
      .first<{ response_json: string | null }>();
    if (replay?.response_json) {
      const response = JSON.parse(replay.response_json) as CreatedProfile;
      return jsonResponse(await completedProfileResponse(db, env, request, response), 200, { "Cache-Control": "no-store" });
    }

    const form = await request.formData();
    const payloadValue = form.get("payload");
    const fileValue = form.get("file");
    const file = fileValue instanceof File && fileValue.size > 0 ? fileValue : null;
    if (file && !uploadsEnabled(env)) return jsonResponse({ error: "Profile photo uploads are temporarily paused. Remove the optional photo and submit the form again." }, 503);
    if (typeof payloadValue !== "string") return jsonResponse({ error: "Complete the profile form." }, 400);
    if (file && !env.MEDIA_BUCKET) return jsonResponse({ error: "Profile image storage is temporarily unavailable. Remove the optional photo and try again." }, 503);
    const payload = JSON.parse(payloadValue) as ProfilePayload;
    const englishName = clean(payload.englishName, 120);
    const thaiName = clean(payload.thaiName, 120) || null;
    const dojoId = clean(payload.dojoId, 80);
    const dojo = await activeDojo(db, dojoId);
    const hasAatMembership = payload.hasAatMembership === true;
    const aatNumber = hasAatMembership ? clean(payload.aatNumber, 40) || null : null;
    const aatSelfReportedPaidDate = hasAatMembership && isCanonicalDate(payload.aatLastPaidDate) ? String(payload.aatLastPaidDate) : null;
    const practiceDuration = clean(payload.practiceDuration, 160);
    const turnstileToken = typeof payload.turnstileToken === "string" ? payload.turnstileToken : "";
    if (!englishName || englishName.length > 120) return jsonResponse({ error: "Enter the student's English name." }, 400);
    if (!dojo) return jsonResponse({ error: "Choose the dojo where the student currently trains." }, 400);
    if (practiceDuration.length > 160) return jsonResponse({ error: "The practice-start answer is too long." }, 400);
    if (!(await verifyTurnstile(request, env, turnstileToken, "student-records"))) return jsonResponse({ error: "Cloudflare verification failed. Please try again." }, 400);
    const rank = normalizedRankOrError(payload.currentRank);
    const studentId = await nextStudentId(db, dojo.id);
    const studentUuid = crypto.randomUUID();
    const nameHash = await studentNameVerificationHash(env, englishName);
    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    if (file && env.MEDIA_BUCKET) {
      const image = await validateProfileWebp(file);
      pendingKey = datedProfileKey("pending-student-profiles");
      await env.MEDIA_BUCKET.put(pendingKey, image.bytes, {
        httpMetadata: { contentType: "image/webp", cacheControl: "private, no-store" },
        customMetadata: { uploadedAt: now, purpose: "pending-student-profile", width: String(image.width), height: String(image.height) },
      });
    }

    const response: CreatedProfile = {
      ok: true,
      requestId: studentUuid,
      status: "pending_admin_approval",
      studentName: englishName,
      studentId,
      hasAatMembership,
    };
    committedResponse = response;
    await db.batch([
      db.prepare(`INSERT INTO students (
        id, public_student_id, lookup_code_hash, name_verification_hash, display_name, english_name, thai_name, current_belt, belt_color,
        profile_image_url, profile_image_consent, guardian_consent, public_visible, active, share_fields, dojo_name,
        admin_notes, training_hours_adjustment, created_at, updated_at, profile_status, practice_duration,
        pending_profile_image_key, dojo_id, aat_number, aat_last_paid_date,
        account_created_date, dojo_joined_date, aat_self_reported_paid_date, aat_membership_verification_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 0, 1, 1, ?, ?, '', 0, ?, ?, 'pending_admin_approval', ?, ?, ?, ?, NULL, ?, ?, ?, ?)`)
        .bind(
          studentUuid, studentId, "", nameHash, englishName, englishName, thaiName, rank, rankColor(rank),
          file ? 1 : 0, JSON.stringify(DEFAULT_SHARE_FIELDS), dojo.official_name, now, now, practiceDuration, pendingKey || null,
          dojo.id, aatNumber, today, today, aatSelfReportedPaidDate, hasAatMembership ? "self_reported" : "not_reported",
        ),
      auditStatement(db, {
        actorType: "student",
        actorIdentifier: studentUuid,
        action: "profile_request_submitted",
        entityType: "student",
        entityId: studentUuid,
        studentId: studentUuid,
        previousValues: null,
        newValues: {
          studentId, englishName, thaiName, currentRank: rank, dojoId: dojo.id, dojoName: dojo.official_name,
          hasAatMembership, aatNumber, aatSelfReportedPaidDate, aatDateVerification: aatSelfReportedPaidDate ? "self_reported" : "not_reported",
          practiceDuration, profileStatus: "pending_admin_approval", profileImage: file ? "submitted" : "not_submitted",
        },
        source: "student_profile_request",
        requestId,
        summary: "Submitted a new student profile request",
        createdAt: now,
      }),
      db.prepare("INSERT INTO mutation_requests (request_id, actor_type, action, response_json, created_at) VALUES (?, 'student', 'profile_request_submitted', ?, ?)")
        .bind(requestId, JSON.stringify(response), now),
    ]);
    committed = true;
    return jsonResponse(await completedProfileResponse(db, env, request, response), 201, { "Cache-Control": "no-store" });
  } catch (error) {
    if (committed && committedResponse)
      return jsonResponse(committedResponse, 201, { "Cache-Control": "no-store" });
    if (pendingKey && env.MEDIA_BUCKET) await env.MEDIA_BUCKET.delete(pendingKey);
    const message = error instanceof Error ? error.message : "The profile request could not be submitted.";
    if (message.includes("UNIQUE")) {
      try {
        const db = requireStudentDb(env);
        const replay = await db.prepare("SELECT response_json FROM mutation_requests WHERE request_id = ? LIMIT 1")
          .bind(requestId).first<{ response_json: string | null }>();
        if (replay?.response_json) {
          const response = JSON.parse(replay.response_json) as CreatedProfile;
          return jsonResponse(await completedProfileResponse(db, env, request, response), 200, { "Cache-Control": "no-store" });
        }
      } catch {
        // A concurrent request may not be visible yet; the client can safely
        // retry the same idempotency key.
      }
      return jsonResponse({ error: "This request is still being completed. Please try again." }, 409);
    }
    return jsonResponse({ error: message }, 400);
  }
};
