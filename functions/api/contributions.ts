import { jsonResponse } from "../_lib/auth";
import { createPaymentProofDraft } from "../_lib/paymentProofs";
import { aatMembershipStatus } from "../../shared/membership";
import {
  auditStatement,
  configuredMonthlyContributionAmount,
  currentBangkokMonthKey,
  DEFAULT_DOJO_ID,
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
  students?: unknown;
  month?: unknown;
  turnstileToken?: unknown;
  contributionType?: unknown;
  dojoId?: unknown;
};

const MAX_MONTHLY_STUDENTS = 10;
type MonthlyReminder = {
  kind: "monthly";
  state: "not_recorded" | "current" | "check_in";
  lastPaidMonth: string | null;
  lastPaidDate: string | null;
};

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, max + 1) : "";
}

const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

function previousMonthKey(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const previous = new Date(Date.UTC(year, monthNumber - 2, 1));
  return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, "0")}`;
}

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
    const currentMonth = currentBangkokMonthKey();
    const month = clean(body.month, 7) || currentMonth;
    const turnstileToken = clean(body.turnstileToken, 2048);
    const contributionType = body.contributionType === "aat_annual" ? "aat_annual" : body.contributionType === "renshinkan_monthly" ? "renshinkan_monthly" : "";
    const configuredMonthlyAmount = configuredMonthlyContributionAmount(env);
    const submittedDojoId = clean(body.dojoId, 80);
    const lookupDojoId = contributionType === "renshinkan_monthly" ? DEFAULT_DOJO_ID : submittedDojoId;
    const submittedStudents = contributionType === "renshinkan_monthly" && Array.isArray(body.students)
      ? body.students.map((entry) => {
        const item = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
        return { publicStudentId: normalizeStudentId(clean(item.studentId, 40)), submittedName: clean(item.studentName, 120) };
      })
      : [{ publicStudentId: normalizeStudentId(clean(body.studentId, 40)), submittedName: clean(body.studentName, 120) }];
    const publicStudentId = submittedStudents[0]?.publicStudentId || "";
    const submittedName = submittedStudents[0]?.submittedName || "";
    if (!publicStudentId || !submittedName || !isMonthKey(month) || !contributionType || !lookupDojoId) {
      return jsonResponse({ error: "Choose a contribution type and dojo, then enter a valid Student ID, student name, and contribution month." }, 400, headers);
    }
    if (contributionType === "renshinkan_monthly") {
      if (configuredMonthlyAmount === null) {
        return jsonResponse({ error: "The monthly contribution amount is not configured. Please ask a sensei for help." }, 503, headers);
      }
      if (submittedStudents.length < 1 || submittedStudents.length > MAX_MONTHLY_STUDENTS || submittedStudents.some((item) => !item.publicStudentId || !item.submittedName)) {
        return jsonResponse({ error: `Add between 1 and ${MAX_MONTHLY_STUDENTS} RenShinKan students, with a Student ID and name for each person.` }, 400, headers);
      }
      if (new Set(submittedStudents.map((item) => item.publicStudentId)).size !== submittedStudents.length) {
        return jsonResponse({ error: "Each student can appear only once in the same monthly payment." }, 400, headers);
      }
    }
    if (month !== currentMonth) {
      return jsonResponse({ error: "The public contribution form accepts the current month only. Ask a sensei about an earlier month." }, 400, headers);
    }
    if (!(await verifyTurnstile(request, env, turnstileToken, "student-records"))) {
      return jsonResponse({ error: "Cloudflare verification failed. Please try again." }, 400, headers);
    }
    const student = await db.prepare(`SELECT s.id, s.public_student_id, s.display_name, s.current_belt, s.dojo_id,
      s.aat_number, s.aat_last_paid_date, d.official_name AS dojo_name
      FROM students s JOIN dojos d ON d.id = s.dojo_id AND d.active = 1
      WHERE UPPER(s.public_student_id) = ? AND s.dojo_id = ?
        AND s.active = 1 AND s.profile_status = 'approved' LIMIT 1`)
      .bind(publicStudentId, lookupDojoId).first<{
        id: string; public_student_id: string; display_name: string; current_belt: string; dojo_id: string;
        aat_number: string | null; aat_last_paid_date: string | null; dojo_name: string;
      }>();
    if (!student || !namesLikelyMatch(submittedName, student.display_name)) {
      return jsonResponse({ error: "We could not verify that dojo, Student ID, and name together. Check the details or ask a sensei for help." }, 404, headers);
    }
    if (contributionType === "aat_annual") {
      const pending = await db.prepare(`SELECT id FROM payments WHERE student_id = ? AND payment_type = 'aat_annual'
        AND status = 'awaiting_payment' ORDER BY created_at DESC LIMIT 1`).bind(student.id).first<{ id: string }>();
      if (pending) return jsonResponse({ error: "An AAT annual contribution is already awaiting payment confirmation for this student." }, 409, headers);
      const now = new Date().toISOString(); const paymentId = crypto.randomUUID();
      const proof = await createPaymentProofDraft(db, {
        studentId: student.id, dojoId: student.dojo_id, paymentType: "aat_annual", paymentReferenceId: paymentId, createdAt: now,
      });
      const membership = aatMembershipStatus(student.aat_number, student.aat_last_paid_date);
      const reminder = {
        kind: "aat" as const,
        state: membership.state === "expired" ? "overdue" : membership.state === "expiring" ? "due_soon" : membership.state === "current" ? "current" : "not_recorded",
        lastPaidDate: student.aat_last_paid_date,
        dueDate: membership.dueDate,
        days: membership.days,
      };
      const response = { ok: true, contributionId: paymentId, month, status: "awaiting_payment", contributionType, dojoName: student.dojo_name, reminder, proofId: proof.proofId, uploadToken: proof.uploadToken };
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
    const students = [student];
    for (const submitted of submittedStudents.slice(1)) {
      const matched = await db.prepare(`SELECT s.id, s.public_student_id, s.display_name, s.current_belt, s.dojo_id,
        s.aat_number, s.aat_last_paid_date, d.official_name AS dojo_name
        FROM students s JOIN dojos d ON d.id = s.dojo_id AND d.active = 1
        WHERE UPPER(s.public_student_id) = ? AND s.dojo_id = ?
          AND s.active = 1 AND s.profile_status = 'approved' LIMIT 1`)
        .bind(submitted.publicStudentId, DEFAULT_DOJO_ID).first<typeof student>();
      if (!matched || !namesLikelyMatch(submitted.submittedName, matched.display_name)) {
        return jsonResponse({ error: "We could not verify every Student ID and name. Check each person in the payment or ask a sensei for help." }, 404, headers);
      }
      students.push(matched);
    }

    const contributionRows: Array<{ student: typeof student; contributionId: string; previousStatus: string; reminder: MonthlyReminder }> = [];
    for (const coveredStudent of students) {
      const duplicate = await db.prepare("SELECT id, status FROM monthly_contributions WHERE student_id = ? AND month_key = ? LIMIT 1")
        .bind(coveredStudent.id, month).first<{ id: string; status: string }>();
      if (duplicate && duplicate.status !== "no_submission") {
        return jsonResponse({ error: `${coveredStudent.public_student_id} already has a contribution request for ${month}. Remove that student before continuing.` }, 409, headers);
      }
      const lastMonthlyPayment = await db.prepare(`SELECT month_key, paid_at FROM monthly_contributions
        WHERE student_id = ? AND status = 'paid' AND month_key < ? ORDER BY month_key DESC LIMIT 1`)
        .bind(coveredStudent.id, month).first<{ month_key: string; paid_at: string | null }>();
      contributionRows.push({
        student: coveredStudent,
        contributionId: duplicate?.id || crypto.randomUUID(),
        previousStatus: duplicate?.status || "no_submission",
        reminder: {
          kind: "monthly",
          state: !lastMonthlyPayment ? "not_recorded" : lastMonthlyPayment.month_key === previousMonthKey(month) ? "current" : "check_in",
          lastPaidMonth: lastMonthlyPayment?.month_key || null,
          lastPaidDate: lastMonthlyPayment?.paid_at?.slice(0, 10) || null,
        },
      });
    }

    const existingPeriod = await db.prepare("SELECT month_key FROM contribution_periods WHERE month_key = ? LIMIT 1")
      .bind(month).first<{ month_key: string }>();
    const monthlyContributionAmount = configuredMonthlyAmount!;
    const activeStudentCount = existingPeriod ? 0 : Number((await db.prepare(`SELECT COUNT(*) AS count FROM students
      WHERE active = 1 AND profile_status = 'approved' AND dojo_id = ?`).bind(DEFAULT_DOJO_ID).first<{ count: number }>())?.count || 0);
    const now = new Date().toISOString();
    const paymentGroupId = crypto.randomUUID();
    const proof = await createPaymentProofDraft(db, {
      studentId: student.id, dojoId: student.dojo_id, paymentType: "renshinkan_monthly", paymentReferenceId: paymentGroupId, createdAt: now,
    });
    const coveredStudents = contributionRows.map((row) => ({
      contributionId: row.contributionId,
      studentId: row.student.public_student_id,
      studentName: row.student.display_name,
      reminder: row.reminder,
    }));
    const response = {
      ok: true, contributionId: paymentGroupId, contributionIds: contributionRows.map((row) => row.contributionId),
      month, status: "awaiting_payment", contributionType, dojoName: student.dojo_name,
      reminder: contributionRows[0].reminder, coveredStudents, studentCount: students.length,
      unitAmount: monthlyContributionAmount, totalAmount: monthlyContributionAmount * students.length,
      proofId: proof.proofId, uploadToken: proof.uploadToken,
    };
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
        current_belt, 1, ? FROM students WHERE active = 1 AND profile_status = 'approved' AND dojo_id = ?`)
        .bind(month, now, DEFAULT_DOJO_ID));
    }
    for (const row of contributionRows) {
      statements.push(
        db.prepare(`INSERT OR IGNORE INTO contribution_period_students (
        id, month_key, student_id, student_name_snapshot, student_public_id_snapshot,
        current_rank_snapshot, active_at_period_start, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, ?)`)
          .bind(crypto.randomUUID(), month, row.student.id, row.student.display_name, row.student.public_student_id, row.student.current_belt, now),
        db.prepare(`INSERT INTO monthly_contributions (
          id, student_id, month_key, student_name_snapshot, student_public_id_snapshot, status,
          submitted_at, status_updated_at, status_updated_by, created_at, updated_at,
          payment_group_id, expected_amount
        ) VALUES (?, ?, ?, ?, ?, 'awaiting_payment', ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(student_id, month_key) DO UPDATE SET
          student_name_snapshot = excluded.student_name_snapshot,
          student_public_id_snapshot = excluded.student_public_id_snapshot,
          status = 'awaiting_payment', submitted_at = excluded.submitted_at,
          paid_at = NULL, paid_by = NULL,
          status_updated_at = excluded.status_updated_at,
          status_updated_by = excluded.status_updated_by,
          payment_group_id = excluded.payment_group_id,
          expected_amount = excluded.expected_amount,
          updated_at = excluded.updated_at`)
          .bind(row.contributionId, row.student.id, month, row.student.display_name, row.student.public_student_id,
            now, now, row.student.id, now, now, paymentGroupId, monthlyContributionAmount),
        db.prepare(`INSERT INTO contribution_status_history (
          id, contribution_id, previous_status, new_status, actor_identifier, request_id, note, created_at
        ) VALUES (?, ?, ?, 'awaiting_payment', ?, ?, 'Contribution form submitted as part of a shared payment; payment not yet confirmed', ?)`)
          .bind(crypto.randomUUID(), row.contributionId, row.previousStatus, row.student.id, requestId, now),
        auditStatement(db, {
          actorType: "student", actorIdentifier: student.id, action: "monthly_contribution_form_submitted",
          entityType: "monthly_contribution", entityId: row.contributionId, studentId: row.student.id,
          studentPublicId: row.student.public_student_id, studentNameSnapshot: row.student.display_name,
          previousValues: { status: row.previousStatus },
          newValues: { status: "awaiting_payment", month, paymentGroupId, expectedAmount: monthlyContributionAmount, groupSize: students.length },
          source: "monthly_contribution_form", requestId, contributionMonth: month,
          summary: `Contribution attempt submitted for ${month} in a ${students.length}-student payment; awaiting manual payment confirmation`, createdAt: now,
        }),
      );
    }
    statements.push(
      db.prepare(`UPDATE contribution_periods SET active_student_count_snapshot = (
        SELECT COUNT(*) FROM contribution_period_students r
        JOIN students s ON s.id = r.student_id
        WHERE r.month_key = ? AND r.active_at_period_start = 1 AND s.dojo_id = ?
      ) WHERE month_key = ?`).bind(month, DEFAULT_DOJO_ID, month),
      proof.statement,
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

export const onRequestGet: PagesFunction<StudentEnv> = async ({ env }) => {
  const amount = configuredMonthlyContributionAmount(env);
  return jsonResponse({
    monthlyContribution: {
      dojoId: DEFAULT_DOJO_ID,
      currency: "THB",
      amount,
      available: amount !== null,
    },
  }, 200, { ...headers, Allow: "GET, POST" });
};
