import { jsonResponse } from "../_lib/auth";
import { operationalEvent } from "../_lib/observability";
import { createPaymentProofDraft } from "../_lib/paymentProofs";
import { aatMembershipStatus } from "../../shared/membership";
import {
  auditStatement,
  configuredAatAnnualContributionAmount,
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
  students?: unknown;
  month?: unknown;
  turnstileToken?: unknown;
  contributionType?: unknown;
  studentId?: unknown;
  studentName?: unknown;
  dojoId?: unknown;
};

type StudentRow = {
  id: string;
  public_student_id: string;
  display_name: string;
  current_belt: string;
  dojo_id: string;
  dojo_name: string;
  aat_number: string | null;
  aat_last_paid_date: string | null;
};

type MonthlyReminder = {
  kind: "monthly";
  state: "not_recorded" | "current" | "check_in";
  lastPaidMonth: string | null;
  lastPaidDate: string | null;
};

const MAX_CONTRIBUTION_STUDENTS = 10;
const headers = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
};

function clean(value: unknown, max: number) {
  return typeof value === "string"
    ? value
        .normalize("NFKC")
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, max + 1)
    : "";
}

function previousMonthKey(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const previous = new Date(Date.UTC(year, monthNumber - 2, 1));
  return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, "0")}`;
}

function aatReminder(student: StudentRow) {
  const membership = aatMembershipStatus(
    student.aat_number,
    student.aat_last_paid_date,
  );
  return {
    kind: "aat" as const,
    state:
      membership.state === "expired"
        ? ("overdue" as const)
        : membership.state === "expiring"
          ? ("due_soon" as const)
          : membership.state === "current"
            ? ("current" as const)
            : ("not_recorded" as const),
    lastPaidDate: student.aat_last_paid_date,
    dueDate: membership.dueDate,
    days: membership.days,
  };
}

async function lookupStudent(
  db: ReturnType<typeof requireStudentDb>,
  publicStudentId: string,
  dojoId: string,
  submittedName: string,
) {
  const student = await db
    .prepare(
      `SELECT s.id, s.public_student_id, s.display_name, s.current_belt,
    s.dojo_id, s.aat_number, s.aat_last_paid_date, d.official_name AS dojo_name
    FROM students s JOIN dojos d ON d.id = s.dojo_id AND d.active = 1
    WHERE (UPPER(s.public_student_id) = ? OR EXISTS (
      SELECT 1 FROM student_id_aliases a WHERE a.student_id = s.id
      AND UPPER(a.alias_public_student_id) = ?
    )) AND s.dojo_id = ? AND s.active = 1
      AND s.profile_status IN ('pending_admin_approval', 'approved')
      AND s.deleted_at IS NULL LIMIT 1`,
    )
    .bind(publicStudentId, publicStudentId, dojoId)
    .first<StudentRow>();
  return student && namesLikelyMatch(submittedName, student.display_name)
    ? student
    : null;
}

export const onRequestPost: PagesFunction<StudentEnv> = async ({
  request,
  env,
}) => {
  const requestId = requestIdentifier(request);
  try {
    if (!(await enforceLookupRateLimit(request, env))) {
      return jsonResponse(
        {
          error: "Too many attempts. Please wait a few minutes and try again.",
        },
        429,
        headers,
      );
    }
    const db = requireStudentDb(env);
    const replay = await db
      .prepare(
        "SELECT response_json FROM mutation_requests WHERE request_id = ? LIMIT 1",
      )
      .bind(requestId)
      .first<{ response_json: string | null }>();
    if (replay?.response_json)
      return jsonResponse(JSON.parse(replay.response_json), 200, headers);

    const body = await request.json<Payload>();
    const currentMonth = currentBangkokMonthKey();
    const month = clean(body.month, 7) || currentMonth;
    const turnstileToken = clean(body.turnstileToken, 2048);
    const contributionType =
      body.contributionType === "aat_annual" ||
      body.contributionType === "renshinkan_monthly"
        ? body.contributionType
        : "";
    const rawStudents = Array.isArray(body.students)
      ? body.students
      : [
          {
            studentId: body.studentId,
            studentName: body.studentName,
            dojoId: body.dojoId,
          },
        ];
    const submittedStudents = rawStudents.map((entry) => {
      const item =
        entry && typeof entry === "object"
          ? (entry as Record<string, unknown>)
          : {};
      return {
        publicStudentId: normalizeStudentId(clean(item.studentId, 40)),
        submittedName: clean(item.studentName, 120),
        dojoId:
          contributionType === "renshinkan_monthly"
            ? DEFAULT_DOJO_ID
            : clean(item.dojoId, 80),
      };
    });
    if (!contributionType || !isMonthKey(month) || month !== currentMonth) {
      return jsonResponse(
        { error: "Choose a contribution type for the current month." },
        400,
        headers,
      );
    }
    if (
      submittedStudents.length < 1 ||
      submittedStudents.length > MAX_CONTRIBUTION_STUDENTS ||
      submittedStudents.some(
        (student) =>
          !student.publicStudentId || !student.submittedName || !student.dojoId,
      )
    ) {
      return jsonResponse(
        {
          error: `Add between 1 and ${MAX_CONTRIBUTION_STUDENTS} students with a dojo, Student ID, and name for each person.`,
        },
        400,
        headers,
      );
    }
    if (
      new Set(submittedStudents.map((student) => student.publicStudentId))
        .size !== submittedStudents.length
    ) {
      return jsonResponse(
        {
          error:
            "Each student can appear only once in the same payment request.",
        },
        400,
        headers,
      );
    }
    const monthlyAmount = configuredMonthlyContributionAmount(env);
    const aatAnnualAmount = configuredAatAnnualContributionAmount(env);
    if (contributionType === "renshinkan_monthly" && monthlyAmount === null) {
      return jsonResponse(
        {
          error:
            "The monthly contribution amount is not configured. Please ask a sensei for help.",
        },
        503,
        headers,
      );
    }
    if (contributionType === "aat_annual" && aatAnnualAmount === null) {
      return jsonResponse(
        {
          error:
            "The AAT annual contribution amount is not configured. Please ask a sensei for help.",
        },
        503,
        headers,
      );
    }
    if (
      !(await verifyTurnstile(request, env, turnstileToken, "student-records"))
    ) {
      return jsonResponse(
        { error: "Cloudflare verification failed. Please try again." },
        400,
        headers,
      );
    }

    const students: StudentRow[] = [];
    for (const submitted of submittedStudents) {
      const student = await lookupStudent(
        db,
        submitted.publicStudentId,
        submitted.dojoId,
        submitted.submittedName,
      );
      if (!student) {
        return jsonResponse(
          {
            error: `We could not verify ${submitted.publicStudentId} with that dojo and name. Check the row or ask a sensei for help.`,
          },
          404,
          headers,
        );
      }
      students.push(student);
    }

    const now = new Date().toISOString();
    const paymentRequestId = crypto.randomUUID();
    const unitAmount =
      contributionType === "aat_annual" ? aatAnnualAmount! : monthlyAmount!;
    const totalAmount = unitAmount * students.length;
    const proof = await createPaymentProofDraft(db, {
      studentId: students[0].id,
      dojoId: students[0].dojo_id,
      paymentType: contributionType,
      paymentReferenceId: paymentRequestId,
      createdAt: now,
    });
    const statements: D1PreparedStatement[] = [
      db
        .prepare(
          `INSERT INTO payment_requests
        (id, payment_type, dojo_id, total_amount_thb, currency, status, request_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'THB', 'awaiting_upload', ?, ?, ?)`,
        )
        .bind(
          paymentRequestId,
          contributionType,
          new Set(students.map((student) => student.dojo_id)).size === 1
            ? students[0].dojo_id
            : null,
          totalAmount,
          requestId,
          now,
          now,
        ),
    ];

    if (contributionType === "aat_annual") {
      const coveredStudents: Array<Record<string, unknown>> = [];
      for (const student of students) {
        const pending = await db
          .prepare(
            `SELECT id FROM payments WHERE student_id = ? AND payment_type = 'aat_annual'
          AND status = 'awaiting_payment' ORDER BY created_at DESC LIMIT 1`,
          )
          .bind(student.id)
          .first<{ id: string }>();
        if (pending)
          return jsonResponse(
            {
              error: `${student.public_student_id} already has an AAT contribution awaiting payment confirmation.`,
            },
            409,
            headers,
          );
        const paymentId = crypto.randomUUID();
        const reminder = aatReminder(student);
        coveredStudents.push({
          contributionId: paymentId,
          studentId: student.public_student_id,
          studentName: student.display_name,
          dojoId: student.dojo_id,
          dojoName: student.dojo_name,
          amount: unitAmount,
          reminder,
          status: "awaiting_payment",
        });
        statements.push(
          db
            .prepare(
              `INSERT INTO payments (id, student_id, dojo_id, payment_type, amount, currency, payment_date,
            status, reference, notes, recorded_by, created_at, updated_at)
            VALUES (?, ?, ?, 'aat_annual', ?, 'THB', NULL, 'awaiting_payment', ?, '', ?, ?, ?)`,
            )
            .bind(
              paymentId,
              student.id,
              student.dojo_id,
              unitAmount,
              `AAT shared ${paymentRequestId}`,
              student.id,
              now,
              now,
            ),
          db
            .prepare(
              `INSERT INTO payment_request_items (
            id, payment_request_id, student_id, dojo_id, payment_reference_id, period_key,
            amount_thb, status, last_verified_date, next_due_date, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'awaiting_payment', ?, ?, ?, ?)`,
            )
            .bind(
              crypto.randomUUID(),
              paymentRequestId,
              student.id,
              student.dojo_id,
              paymentId,
              month.slice(0, 4),
              unitAmount,
              reminder.lastPaidDate,
              reminder.dueDate,
              now,
              now,
            ),
          db
            .prepare(
              `INSERT INTO payment_history
            (id, payment_id, previous_status, new_status, changed_by, notes, created_at)
            VALUES (?, ?, NULL, 'awaiting_payment', ?, 'Shared AAT contribution request submitted', ?)`,
            )
            .bind(crypto.randomUUID(), paymentId, student.id, now),
          auditStatement(db, {
            actorType: "student",
            actorIdentifier: students[0].id,
            action: "aat_contribution_form_submitted",
            entityType: "payment",
            entityId: paymentId,
            studentId: student.id,
            studentPublicId: student.public_student_id,
            studentNameSnapshot: student.display_name,
            previousValues: null,
            newValues: {
              status: "awaiting_payment",
              contributionType,
              paymentRequestId,
              amountThb: unitAmount,
              groupSize: students.length,
            },
            source: "contribution_form",
            requestId,
            summary: `AAT contribution submitted in a ${students.length}-student payment request`,
            createdAt: now,
          }),
        );
      }
      const dojoName =
        new Set(students.map((student) => student.dojo_id)).size === 1
          ? students[0].dojo_name
          : "Multiple participating dojos";
      const response = {
        ok: true,
        contributionId: paymentRequestId,
        month,
        status: "awaiting_payment",
        contributionType,
        dojoName,
        reminder: coveredStudents[0].reminder,
        coveredStudents,
        studentCount: students.length,
        unitAmount,
        totalAmount,
        proofId: proof.proofId,
        uploadToken: proof.uploadToken,
      };
      statements.push(
        proof.statement,
        db
          .prepare(
            "INSERT INTO mutation_requests (request_id, actor_type, action, response_json, created_at) VALUES (?, 'student', 'aat_contribution_form_submitted', ?, ?)",
          )
          .bind(requestId, JSON.stringify(response), now),
      );
      await db.batch(statements);
      return jsonResponse(response, 201, headers);
    }

    const existingPeriod = await db
      .prepare(
        "SELECT month_key FROM contribution_periods WHERE month_key = ? LIMIT 1",
      )
      .bind(month)
      .first<{ month_key: string }>();
    const activeStudentCount = existingPeriod
      ? 0
      : Number(
          (
            await db
              .prepare(
                `SELECT COUNT(*) AS count FROM students
      WHERE active = 1 AND profile_status IN ('pending_admin_approval', 'approved') AND dojo_id = ?`,
              )
              .bind(DEFAULT_DOJO_ID)
              .first<{ count: number }>()
          )?.count || 0,
        );
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO contribution_periods
      (month_key, active_student_count_snapshot, created_at, created_by) VALUES (?, ?, ?, 'student_submission')`,
        )
        .bind(month, activeStudentCount, now),
    );
    if (!existingPeriod) {
      statements.push(
        db
          .prepare(
            `INSERT OR IGNORE INTO contribution_period_students (
        id, month_key, student_id, student_name_snapshot, student_public_id_snapshot,
        current_rank_snapshot, active_at_period_start, created_at
      ) SELECT lower(hex(randomblob(16))), ?, id, display_name, public_student_id,
        current_belt, 1, ? FROM students WHERE active = 1 AND profile_status IN ('pending_admin_approval', 'approved') AND dojo_id = ?`,
          )
          .bind(month, now, DEFAULT_DOJO_ID),
      );
    }

    const coveredStudents: Array<Record<string, unknown>> = [];
    for (const student of students) {
      const duplicate = await db
        .prepare(
          "SELECT id, status FROM monthly_contributions WHERE student_id = ? AND month_key = ? LIMIT 1",
        )
        .bind(student.id, month)
        .first<{ id: string; status: string }>();
      if (duplicate && duplicate.status !== "no_submission") {
        return jsonResponse(
          {
            error: `${student.public_student_id} already has a contribution request for ${month}. Remove that student before continuing.`,
          },
          409,
          headers,
        );
      }
      const lastPayment = await db
        .prepare(
          `SELECT month_key, paid_at FROM monthly_contributions
        WHERE student_id = ? AND status = 'paid' AND month_key < ? ORDER BY month_key DESC LIMIT 1`,
        )
        .bind(student.id, month)
        .first<{ month_key: string; paid_at: string | null }>();
      const reminder: MonthlyReminder = {
        kind: "monthly",
        state: !lastPayment
          ? "not_recorded"
          : lastPayment.month_key === previousMonthKey(month)
            ? "current"
            : "check_in",
        lastPaidMonth: lastPayment?.month_key || null,
        lastPaidDate: lastPayment?.paid_at?.slice(0, 10) || null,
      };
      const contributionId = duplicate?.id || crypto.randomUUID();
      coveredStudents.push({
        contributionId,
        studentId: student.public_student_id,
        studentName: student.display_name,
        dojoId: student.dojo_id,
        dojoName: student.dojo_name,
        amount: unitAmount,
        reminder,
        status: "awaiting_payment",
      });
      statements.push(
        db
          .prepare(
            `INSERT OR IGNORE INTO contribution_period_students (
          id, month_key, student_id, student_name_snapshot, student_public_id_snapshot,
          current_rank_snapshot, active_at_period_start, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            month,
            student.id,
            student.display_name,
            student.public_student_id,
            student.current_belt,
            now,
          ),
        db
          .prepare(
            `INSERT INTO monthly_contributions (
          id, student_id, month_key, student_name_snapshot, student_public_id_snapshot, status,
          submitted_at, status_updated_at, status_updated_by, created_at, updated_at,
          payment_group_id, expected_amount
        ) VALUES (?, ?, ?, ?, ?, 'awaiting_payment', ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(student_id, month_key) DO UPDATE SET
          student_name_snapshot = excluded.student_name_snapshot,
          student_public_id_snapshot = excluded.student_public_id_snapshot,
          status = 'awaiting_payment', submitted_at = excluded.submitted_at,
          paid_at = NULL, paid_by = NULL, status_updated_at = excluded.status_updated_at,
          status_updated_by = excluded.status_updated_by, payment_group_id = excluded.payment_group_id,
          expected_amount = excluded.expected_amount, updated_at = excluded.updated_at`,
          )
          .bind(
            contributionId,
            student.id,
            month,
            student.display_name,
            student.public_student_id,
            now,
            now,
            student.id,
            now,
            now,
            paymentRequestId,
            unitAmount,
          ),
        db
          .prepare(
            `INSERT INTO payment_request_items (
          id, payment_request_id, student_id, dojo_id, payment_reference_id, period_key,
          amount_thb, status, last_verified_date, next_due_date, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'awaiting_payment', ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            paymentRequestId,
            student.id,
            student.dojo_id,
            contributionId,
            month,
            unitAmount,
            reminder.lastPaidDate,
            month,
            now,
            now,
          ),
        db
          .prepare(
            `INSERT INTO contribution_status_history (
          id, contribution_id, previous_status, new_status, actor_identifier, request_id, note, created_at
        ) VALUES (?, ?, ?, 'awaiting_payment', ?, ?, 'Shared payment request submitted; payment not yet confirmed', ?)`,
          )
          .bind(
            crypto.randomUUID(),
            contributionId,
            duplicate?.status || "no_submission",
            student.id,
            requestId,
            now,
          ),
        auditStatement(db, {
          actorType: "student",
          actorIdentifier: students[0].id,
          action: "monthly_contribution_form_submitted",
          entityType: "monthly_contribution",
          entityId: contributionId,
          studentId: student.id,
          studentPublicId: student.public_student_id,
          studentNameSnapshot: student.display_name,
          previousValues: { status: duplicate?.status || "no_submission" },
          newValues: {
            status: "awaiting_payment",
            month,
            paymentRequestId,
            expectedAmount: unitAmount,
            groupSize: students.length,
          },
          source: "monthly_contribution_form",
          requestId,
          contributionMonth: month,
          summary: `Monthly contribution submitted in a ${students.length}-student payment request`,
          createdAt: now,
        }),
      );
    }
    const response = {
      ok: true,
      contributionId: paymentRequestId,
      month,
      status: "awaiting_payment",
      contributionType,
      dojoName: students[0].dojo_name,
      reminder: coveredStudents[0].reminder,
      coveredStudents,
      studentCount: students.length,
      unitAmount,
      totalAmount,
      proofId: proof.proofId,
      uploadToken: proof.uploadToken,
    };
    statements.push(
      db
        .prepare(
          `UPDATE contribution_periods SET active_student_count_snapshot = (
        SELECT COUNT(*) FROM contribution_period_students r JOIN students s ON s.id = r.student_id
        WHERE r.month_key = ? AND r.active_at_period_start = 1 AND s.dojo_id = ?
      ) WHERE month_key = ?`,
        )
        .bind(month, DEFAULT_DOJO_ID, month),
      proof.statement,
      db
        .prepare(
          "INSERT INTO mutation_requests (request_id, actor_type, action, response_json, created_at) VALUES (?, 'student', 'monthly_contribution_form_submitted', ?, ?)",
        )
        .bind(requestId, JSON.stringify(response), now),
    );
    await db.batch(statements);
    return jsonResponse(response, 201, headers);
  } catch (error) {
    const duplicate =
      error instanceof Error && error.message.includes("UNIQUE");
    operationalEvent(
      duplicate ? "warn" : "error",
      "contribution_request_failed",
      duplicate ? "api_failure" : "database_failure",
      {
        request,
        env,
        status: duplicate ? 409 : 400,
      },
    );
    return jsonResponse(
      {
        error: duplicate
          ? "A contribution request already exists for one of those students."
          : "The contribution request could not be recorded. Please try again.",
        code: duplicate
          ? "CONTRIBUTION_DUPLICATE"
          : "CONTRIBUTION_REQUEST_FAILED",
        requestId,
      },
      duplicate ? 409 : 400,
      headers,
    );
  }
};

export const onRequestGet: PagesFunction<StudentEnv> = async ({ env }) => {
  const monthlyAmount = configuredMonthlyContributionAmount(env);
  const aatAnnualAmount = configuredAatAnnualContributionAmount(env);
  return jsonResponse(
    {
      monthlyContribution: {
        dojoId: DEFAULT_DOJO_ID,
        currency: "THB",
        amount: monthlyAmount,
        available: monthlyAmount !== null,
      },
      aatAnnualContribution: {
        currency: "THB",
        amount: aatAnnualAmount,
        available: aatAnnualAmount !== null,
      },
    },
    200,
    { ...headers, Allow: "GET, POST" },
  );
};
