import { jsonResponse } from "../_lib/auth";
import { createPaymentProofDraft } from "../_lib/paymentProofs";
import {
  auditStatement,
  currentBangkokMonthKey,
  enforceLookupRateLimit,
  isMonthKey,
  namesLikelyMatch,
  normalizeStudentId,
  requestIdentifier,
  requireStudentDb,
  type D1PreparedStatement,
  type StudentEnv,
  verifyTurnstile,
} from "../_lib/studentRecords";

type Payload = {
  studentId?: unknown;
  studentName?: unknown;
  month?: unknown;
  turnstileToken?: unknown;
  contributionType?: unknown;
};

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, max + 1) : "";
}

const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

export const onRequestPost: PagesFunction<StudentEnv> = async ({ request, env }) => {
  const requestId = requestIdentifier(request);
  try {
    if (!(await enforceLookupRateLimit(request, env))) {
      return jsonResponse({ error: "Too many attempts. Please wait a few minutes and try again." }, 429, headers);
    }
    const db = requireStudentDb(env);
    const replay = await db.prepare("SELECT response_json FROM mutation_requests WHERE request_id = ? LIMIT 1")
      .bind(requestId).first<{ response_json: string | null }>();
    if (replay?.response_json) return jsonResponse(JSON.parse(replay.response_json), 200, headers);
    const body = await request.json<Payload>();
    const publicStudentId = normalizeStudentId(clean(body.studentId, 40));
    const submittedName = clean(body.studentName, 120);
    const currentMonth = currentBangkokMonthKey();
    const month = clean(body.month, 7) || currentMonth;
    const turnstileToken = clean(body.turnstileToken, 2048);
    const contributionType = body.contributionType === "aat_annual" ? "aat_annual" : body.contributionType === "renshinkan_monthly" ? "renshinkan_monthly" : "";
    if (!publicStudentId || !submittedName || !isMonthKey(month) || !contributionType) {
      return jsonResponse({ error: "Choose a contribution type and enter a valid Student ID, student name, and contribution month." }, 400, headers);
    }
    if (month !== currentMonth) {
      return jsonResponse({ error: "The public contribution form accepts the current month only. Ask a sensei about an earlier month." }, 400, headers);
    }
    if (!(await verifyTurnstile(request, env, turnstileToken))) {
      return jsonResponse({ error: "Cloudflare verification failed. Please try again." }, 400, headers);
    }
    const student = await db.prepare(`SELECT id, public_student_id, display_name, current_belt, dojo_id
      FROM students WHERE UPPER(public_student_id) = ? AND active = 1 AND profile_status = 'approved' LIMIT 1`)
      .bind(publicStudentId).first<{ id: string; public_student_id: string; display_name: string; current_belt: string; dojo_id: string }>();
    if (!student || !namesLikelyMatch(submittedName, student.display_name)) {
      return jsonResponse({ error: "We could not verify that Student ID and name. Check the details or ask a sensei for help." }, 404, headers);
    }
    if (contributionType === "renshinkan_monthly" && student.dojo_id !== "dojo-rsk") {
      return jsonResponse({ error: "Monthly RenShinKan student contributions are available only to RenShinKan students. Choose AAT Annual Contribution instead." }, 403, headers);
    }
    if (contributionType === "aat_annual") {
      const pending = await db.prepare(`SELECT id FROM payments WHERE student_id = ? AND payment_type = 'aat_annual'
        AND status = 'awaiting_payment' ORDER BY created_at DESC LIMIT 1`).bind(student.id).first<{ id: string }>();
      if (pending) return jsonResponse({ error: "An AAT annual contribution is already awaiting payment confirmation for this student." }, 409, headers);
      const now = new Date().toISOString(); const paymentId = crypto.randomUUID();
      const proof = await createPaymentProofDraft(db, {
        studentId: student.id, dojoId: student.dojo_id, paymentType: "aat_annual", paymentReferenceId: paymentId, createdAt: now,
      });
      const response = { ok: true, contributionId: paymentId, month, status: "awaiting_payment", contributionType, proofId: proof.proofId, uploadToken: proof.uploadToken };
      await db.batch([
        db.prepare(`INSERT INTO payments (id, student_id, dojo_id, payment_type, amount, currency, payment_date,
          status, reference, notes, recorded_by, created_at, updated_at)
          VALUES (?, ?, ?, 'aat_annual', NULL, 'THB', NULL, 'awaiting_payment', ?, '', ?, ?, ?)`)
          .bind(paymentId, student.id, student.dojo_id, `AAT online ${month}`, student.id, now, now),
        proof.statement,
        db.prepare(`INSERT INTO payment_history (id, payment_id, previous_status, new_status, changed_by, notes, created_at)
          VALUES (?, ?, NULL, 'awaiting_payment', ?, 'AAT annual contribution form submitted', ?)`)
          .bind(crypto.randomUUID(), paymentId, student.id, now),
        auditStatement(db, { actorType: "student", actorIdentifier: student.id, action: "aat_contribution_form_submitted",
          entityType: "payment", entityId: paymentId, studentId: student.id, studentPublicId: student.public_student_id,
          studentNameSnapshot: student.display_name, previousValues: null, newValues: { status: "awaiting_payment", contributionType },
          source: "contribution_form", requestId, summary: "AAT annual contribution submitted; awaiting manual payment confirmation", createdAt: now }),
        db.prepare("INSERT INTO mutation_requests (request_id, actor_type, action, response_json, created_at) VALUES (?, 'student', 'aat_contribution_form_submitted', ?, ?)").bind(requestId, JSON.stringify(response), now),
      ]);
      return jsonResponse(response, 201, headers);
    }
    const duplicate = await db.prepare("SELECT id, status FROM monthly_contributions WHERE student_id = ? AND month_key = ? LIMIT 1")
      .bind(student.id, month).first<{ id: string; status: string }>();
    if (duplicate && duplicate.status !== "no_submission") {
      return jsonResponse({ error: "A contribution attempt already exists for that Student ID and month. Please send payment proof to the instructor instead of submitting again." }, 409, headers);
    }

    const existingPeriod = await db.prepare("SELECT month_key FROM contribution_periods WHERE month_key = ? LIMIT 1")
      .bind(month).first<{ month_key: string }>();
    const activeStudentCount = existingPeriod ? 0 : Number((await db.prepare(`SELECT COUNT(*) AS count FROM students
      WHERE active = 1 AND profile_status = 'approved' AND dojo_id = 'dojo-rsk'`).first<{ count: number }>())?.count || 0);
    const now = new Date().toISOString();
    const contributionId = duplicate?.id || crypto.randomUUID();
    const proof = await createPaymentProofDraft(db, {
      studentId: student.id, dojoId: student.dojo_id, paymentType: "renshinkan_monthly", paymentReferenceId: contributionId, createdAt: now,
    });
    const response = { ok: true, contributionId, month, status: "awaiting_payment", contributionType, proofId: proof.proofId, uploadToken: proof.uploadToken };
    const statements: D1PreparedStatement[] = [
      db.prepare(`INSERT OR IGNORE INTO contribution_periods
        (month_key, active_student_count_snapshot, created_at, created_by) VALUES (?, ?, ?, 'student_submission')`)
        .bind(month, activeStudentCount, now),
    ];
    if (!existingPeriod) {
      statements.push(db.prepare(`INSERT OR IGNORE INTO contribution_period_students (
        id, month_key, student_id, student_name_snapshot, student_public_id_snapshot,
        current_rank_snapshot, active_at_period_start, created_at
      ) SELECT lower(hex(randomblob(16))), ?, id, display_name, public_student_id,
        current_belt, 1, ? FROM students WHERE active = 1 AND profile_status = 'approved' AND dojo_id = 'dojo-rsk'`)
        .bind(month, now));
    }
    statements.push(
      db.prepare(`INSERT OR IGNORE INTO contribution_period_students (
        id, month_key, student_id, student_name_snapshot, student_public_id_snapshot,
        current_rank_snapshot, active_at_period_start, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, ?)`)
        .bind(crypto.randomUUID(), month, student.id, student.display_name, student.public_student_id, student.current_belt, now),
      db.prepare(`UPDATE contribution_periods SET active_student_count_snapshot = (
        SELECT COUNT(*) FROM contribution_period_students r
        JOIN students s ON s.id = r.student_id
        WHERE r.month_key = ? AND r.active_at_period_start = 1 AND s.dojo_id = 'dojo-rsk'
      ) WHERE month_key = ?`).bind(month, month),
      db.prepare(`INSERT INTO monthly_contributions (
        id, student_id, month_key, student_name_snapshot, student_public_id_snapshot, status,
        submitted_at, status_updated_at, status_updated_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'awaiting_payment', ?, ?, ?, ?, ?)
      ON CONFLICT(student_id, month_key) DO UPDATE SET
        student_name_snapshot = excluded.student_name_snapshot,
        student_public_id_snapshot = excluded.student_public_id_snapshot,
        status = 'awaiting_payment', submitted_at = excluded.submitted_at,
        paid_at = NULL, paid_by = NULL,
        status_updated_at = excluded.status_updated_at,
        status_updated_by = excluded.status_updated_by,
        updated_at = excluded.updated_at`)
        .bind(contributionId, student.id, month, student.display_name, student.public_student_id, now, now, student.id, now, now),
      proof.statement,
      db.prepare(`INSERT INTO contribution_status_history (
        id, contribution_id, previous_status, new_status, actor_identifier, request_id, note, created_at
      ) VALUES (?, ?, 'no_submission', 'awaiting_payment', ?, ?, 'Contribution form submitted; payment not yet confirmed', ?)`)
        .bind(crypto.randomUUID(), contributionId, student.id, requestId, now),
      auditStatement(db, {
        actorType: "student", actorIdentifier: student.id, action: "monthly_contribution_form_submitted",
        entityType: "monthly_contribution", entityId: contributionId, studentId: student.id,
        studentPublicId: student.public_student_id, studentNameSnapshot: student.display_name,
        previousValues: { status: "no_submission" }, newValues: { status: "awaiting_payment", month },
        source: "monthly_contribution_form", requestId, contributionMonth: month,
        summary: `Contribution attempt submitted for ${month}; awaiting manual payment confirmation`, createdAt: now,
      }),
      db.prepare("INSERT INTO mutation_requests (request_id, actor_type, action, response_json, created_at) VALUES (?, 'student', 'monthly_contribution_form_submitted', ?, ?)")
        .bind(requestId, JSON.stringify(response), now),
    );
    await db.batch(statements);
    return jsonResponse(response, 201, headers);
  } catch (error) {
    const duplicate = error instanceof Error && error.message.includes("UNIQUE");
    return jsonResponse({ error: duplicate ? "A contribution attempt already exists for that Student ID and month." : "The contribution attempt could not be recorded. Please try again." }, duplicate ? 409 : 400, headers);
  }
};

export const onRequestGet: PagesFunction = async () => new Response("Method not allowed", {
  status: 405,
  headers: { Allow: "POST", ...headers },
});
