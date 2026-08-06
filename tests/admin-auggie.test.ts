import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  session: {
    sub: "admin" as const,
    iat: 1,
    exp: 9_999_999_999,
    sessionId: "auggie-session",
    accountId: "auggie-account",
    adminName: "Auggie Test Admin",
    role: "central" as "central" | "dojo",
    allowedDojoIds: [] as string[],
    selectedDojoId: "dojo-rsk" as string | null,
  },
}));

vi.mock("../functions/_lib/auth", () => ({
  canAccessDojo: (_session: unknown, dojoId: string) =>
    authState.session.role === "central" &&
    authState.session.selectedDojoId === "dojo-rsk"
      ? true
      : dojoId === authState.session.selectedDojoId,
  effectivePermissionLevel: () =>
    authState.session.role === "central" &&
    authState.session.selectedDojoId === "dojo-rsk"
      ? "renshinkan_super_admin"
      : "dojo_admin",
  getAuthorizedAdminSession: async () => authState.session,
  isRenShinKanSuperAdmin: () =>
    authState.session.role === "central" &&
    authState.session.selectedDojoId === "dojo-rsk",
  isSameOriginRequest: () => true,
  jsonResponse: (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
}));

vi.mock("../functions/_lib/rateLimit", () => ({
  consumeRateLimit: async () => true,
}));

// The reviewed administration endpoints are mocked so the tests can assert what
// Admin Auggie delegates to them, and how often, without re-running their own
// domain transactions.
type DelegatedCall = {
  route: string;
  url: string;
  params: Record<string, string>;
  body: Record<string, unknown>;
  headers: Record<string, string>;
};

const delegated = vi.hoisted(() => {
  const state = {
    calls: [] as Array<{
      route: string;
      url: string;
      params: Record<string, string>;
      body: Record<string, unknown>;
      headers: Record<string, string>;
    }>,
    status: 200,
    body: { ok: true } as Record<string, unknown>,
    // Lets a test stand in for the reviewed endpoint's own write, so an undo
    // can be prepared against a database that really moved.
    apply: undefined as
      | ((call: {
          route: string;
          params: Record<string, string>;
          body: Record<string, unknown>;
        }) => void)
      | undefined,
  };
  return {
    state,
    handler: (route: string) =>
      async function onRequestPost(context: {
        request: Request;
        params?: Record<string, string>;
      }) {
        const call = {
          route,
          url: context.request.url,
          params: (context.params || {}) as Record<string, string>,
          body: (await context.request.json()) as Record<string, unknown>,
          headers: Object.fromEntries(context.request.headers as never),
        };
        state.calls.push(call);
        if (state.status < 400) state.apply?.(call);
        return new Response(JSON.stringify(state.body), {
          status: state.status,
          headers: { "Content-Type": "application/json" },
        });
      },
  };
});

vi.mock("../functions/api/admin/examinations", () => ({
  onRequestPost: delegated.handler("admin/examinations"),
}));
vi.mock("../functions/api/admin/examinations/[applicationId]", () => ({
  onRequestPost: delegated.handler("admin/examination-application"),
}));
vi.mock("../functions/api/admin/contributions", () => ({
  onRequestPost: delegated.handler("admin/contributions"),
}));
vi.mock("../functions/api/admin/payment-proofs", () => ({
  onRequestPost: delegated.handler("admin/payment-proofs"),
}));
vi.mock("../functions/api/admin/students/[id]", () => ({
  onRequestPut: delegated.handler("admin/student-record"),
  onRequestDelete: delegated.handler("admin/student-delete"),
}));

// The permanent-deletion preview and plan are shared helpers the reviewed
// delete endpoint also uses. They are stubbed here so the tests can assert what
// Admin Auggie prepares and delegates without standing up every related table.
const deletion = vi.hoisted(() => ({
  target: null as Record<string, unknown> | null,
  plan: {
    groups: [
      { key: "trainingHours", label: "Training hour entries", count: 3 },
      { key: "examinations", label: "Examination results", count: 1 },
    ],
    relatedRecords: 4,
    totalRecords: 5,
    auditEntriesRedacted: 2,
    objectKeys: ["student-profiles/2026/08/one.webp"],
    contributionMonths: [],
    paymentRequestIds: [],
  },
}));

vi.mock("../functions/_lib/studentDeletion", () => ({
  loadDeletionTarget: async (_db: unknown, _id: string) => deletion.target,
  // Scope is already enforced by resolveStudentTargets before this is reached;
  // the stub only stands in for the shared permission helper.
  canPermanentlyDeleteStudent: (_session: unknown, dojoId: string) =>
    Boolean(dojoId),
  buildStudentDeletionPlan: async () => deletion.plan,
}));
vi.mock("../functions/api/admin/students/[id]/hours", () => ({
  onRequestPost: delegated.handler("admin/student-hours"),
}));
vi.mock("../functions/api/admin/students/[id]/exam", () => ({
  onRequestPost: delegated.handler("admin/student-exam"),
}));
vi.mock("../functions/api/admin/students/[id]/profile-status", () => ({
  onRequestPost: delegated.handler("admin/student-profile-status"),
}));
vi.mock("../functions/api/admin/students/bulk", () => ({
  onRequestPost: delegated.handler("admin/students-bulk"),
}));
vi.mock("../functions/api/admin/memberships", () => ({
  onRequestPost: delegated.handler("admin/memberships"),
}));

import {
  AdminAuggieError,
  confirmAdminAuggieOperation,
  detectOutOfChatScope,
  detectSensitiveAdminAuggieInput,
  handleAdminAuggieChat,
  parseBoundedJson,
  prepareAdminAuggieUndo,
  scrubExpiredAdminAuggiePayloads,
} from "../functions/_lib/adminAuggie";

type FakeStudent = {
  id: string;
  public_student_id: string;
  display_name: string;
  dojo_id: string;
  dojo_name: string;
  current_belt: string;
  active: number;
  profile_status: string;
  public_visible: number;
  public_visible_before_archive: number | null;
  archived_at: string | null;
  deleted_at: string | null;
  updated_at: string;
  total_hours: number;
  dojo_joined_date: string;
  aat_last_paid_date?: string | null;
};

const STUDENT_GUARD_PREFIXES = [
  "__student_record__",
  "__student_delete__",
  "__student_hours__",
  "__student_exam__",
  "__student_profile__",
  "__bulk_student__",
  "__membership__",
  "__rank__",
];

class FakeStatement {
  values: unknown[] = [];

  constructor(
    readonly db: FakeDb,
    readonly query: string,
  ) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  first<T>() {
    return Promise.resolve(this.db.first(this) as T | null);
  }

  all<T>() {
    return Promise.resolve({
      success: true as const,
      results: this.db.all(this) as T[],
    });
  }

  async run() {
    return this.db.execute(this);
  }
}

class FakeDb {
  students = new Map<string, FakeStudent>();
  // The active dojos permittedDojos reads; canAccessDojo then narrows them to
  // the ones the signed-in administrator may actually work in.
  dojoRows: Array<{ id: string; official_name: string }> = [
    { id: "dojo-rsk", official_name: "RenShinKan Dojo" },
    { id: "dojo-cmu", official_name: "CMU Aikido Club" },
  ];
  operations = new Map<string, Record<string, unknown>>();
  claims = new Set<string>();
  guards = new Set<string>();
  stateGuards = new Set<string>();
  audits: unknown[][] = [];
  archiveWrites = 0;
  restoreWrites = 0;
  batches: string[][] = [];
  batchBindingCounts: number[][] = [];
  resolveHook?: () => void;
  beforeBatch?: () => void;
  contributionPeriodExists = false;
  contributionSnapshots = new Set<string>();
  currentBangkokMonthOverride?: string;
  examCycle: { id: string; name: string } | null = null;
  examStatuses = new Map<
    string,
    { status: string; payment_status: string; application_status: string }
  >();
  applications = new Map<
    string,
    {
      id: string;
      student_id: string;
      status: string;
      payment_status: string;
      attempted_rank: string;
    }
  >();
  contributionRoster = new Map<string, string>();
  proofs = new Map<
    string,
    {
      id: string;
      student_id: string;
      status: string;
      payment_type: string;
      covered: number;
    }
  >();

  pendingHourRequests = new Map<string, { count: number; hours: number }>();
  studentHistory = new Map<string, Array<Record<string, unknown>>>();
  // The current paid AAT membership payment the server resolves when reversing.
  aatPaidPayments = new Map<string, { id: string; payment_date: string | null }>();
  rankWrites = 0;

  // Mirrors the exact strings the server's own guard SQL builds, so a test
  // fails whenever the two drift apart.
  studentStateFor(query: string, studentId: string) {
    const row = this.students.get(studentId);
    if (!row) return "missing";
    // The AAT membership guard: the student's last-paid date and active flag.
    if (query.includes("aat_last_paid_date"))
      return `${row.aat_last_paid_date || ""}|${row.active}`;
    const total = Number(row.total_hours || 0).toFixed(2);
    // The permanent-deletion guard: still inactive, still archived, same dojo.
    if (query.includes("s.dojo_id"))
      return [row.active, row.archived_at || "", row.dojo_id].join("|");
    if (query.includes("s.public_visible") && query.includes("dojo_joined_date"))
      return [
        row.current_belt,
        row.public_visible,
        row.dojo_joined_date || "",
        row.active,
        row.archived_at || "",
        row.profile_status,
      ].join("|");
    if (query.includes("s.profile_status AS state")) return row.profile_status;
    if (query.includes("training_hour_requests")) {
      const pending = this.pendingHourRequests.get(studentId) || {
        count: 0,
        hours: 0,
      };
      return `${row.active}|${total}|${pending.count}|${pending.hours.toFixed(2)}`;
    }
    if (query.includes("printf('%.2f'")) return `${row.active}|${total}`;
    return `${row.current_belt}|${row.active}`;
  }

  examState(studentId: string) {
    const row = this.examStatuses.get(studentId);
    if (!this.students.has(studentId)) return "missing";
    return `${row?.status || "not_signed_up"}|${row?.payment_status || ""}|${
      row?.application_status || ""
    }|${this.students.get(studentId)!.active}`;
  }

  delegatedGuardState(targetId: string) {
    const [prefix, id] = [
      targetId.slice(0, targetId.indexOf(":")),
      targetId.slice(targetId.indexOf(":") + 1),
    ];
    if (prefix === "__exam__") return this.examState(id);
    if (prefix === "__exam_application__") {
      const application = this.applications.get(id);
      return application
        ? `${application.status}|${application.payment_status}`
        : "missing";
    }
    if (prefix === "__contribution__")
      return this.contributionRoster.get(id) || "missing";
    if (prefix === "__payslip__")
      return this.proofs.get(id)?.status || "missing";
    return null;
  }

  prepare(query: string) {
    return new FakeStatement(this, query.replace(/\s+/g, " ").trim());
  }

  first(statement: FakeStatement) {
    const { query, values } = statement;
    if (
      query.includes("FROM payments") &&
      query.includes("payment_type = 'aat_annual'") &&
      query.includes("status = 'paid'")
    )
      return this.aatPaidPayments.get(String(values[0])) || null;
    if (query.includes("WHERE idempotency_key = ?")) {
      return (
        [...this.operations.values()].find(
          (row) => row.idempotency_key === values[0],
        ) || null
      );
    }
    if (query.includes("WHERE undo_of_operation_id = ?")) {
      return (
        [...this.operations.values()].find(
          (row) =>
            row.undo_of_operation_id === values[0] &&
            (row.status === "prepared" || row.status === "succeeded"),
        ) || null
      );
    }
    if (query.includes("SELECT * FROM admin_ai_operations WHERE id = ?"))
      return this.operations.get(String(values[0])) || null;
    if (query.includes("FROM contribution_periods"))
      return this.contributionPeriodExists
        ? { month_key: String(values[0]) }
        : null;
    if (query.includes("FROM examination_cycles WHERE status = 'active'"))
      return this.examCycle;
    if (query.includes("AS dojo_joined_date")) {
      const row = this.students.get(String(values[0]));
      return row
        ? {
            current_belt: row.current_belt,
            public_visible: row.public_visible,
            dojo_joined_date: row.dojo_joined_date || "",
            active: row.active,
            archived_at: row.archived_at || "",
            profile_status: row.profile_status,
          }
        : null;
    }
    if (query.includes("AS state")) {
      if (query.includes("FROM examination_applications WHERE id = ?"))
        return { state: this.delegatedGuardState(`__exam_application__:${values[0]}`) };
      if (query.includes("FROM contribution_period_students r"))
        return { state: this.contributionRoster.get(String(values[1])) || null };
      if (query.includes("FROM payment_proofs WHERE id = ?"))
        return { state: this.proofs.get(String(values[0]))?.status || null };
      if (query.includes("FROM students s WHERE s.id = ?"))
        return { state: this.studentStateFor(query, String(values[0])) };
      return { state: this.examState(String(values[3])) };
    }
    if (query.includes("SUM(CASE WHEN COALESCE(ecs.status")) {
      const rows = [...this.examStatuses.values()];
      return {
        total: this.students.size,
        not_signed_up: this.students.size - rows.length,
        unpaid: rows.filter((row) => row.status === "unpaid").length,
        paid: rows.filter((row) => row.status === "paid").length,
      };
    }
    if (query.includes("SUM(CASE WHEN COALESCE(c.status")) {
      const rows = [...this.contributionRoster.values()];
      return {
        total: rows.length,
        no_submission: rows.filter((row) => row === "no_submission").length,
        awaiting: rows.filter((row) => row === "awaiting_payment").length,
        paid: rows.filter((row) => row === "paid").length,
      };
    }
    return null;
  }

  all(statement: FakeStatement) {
    const { query, values } = statement;
    if (query.includes("FROM dojos WHERE active = 1"))
      return this.dojoRows;
    if (query.includes("FROM audit_log WHERE student_id = ?")) {
      return (this.studentHistory.get(String(values[0])) || []).slice(
        0,
        Number(values[1]),
      );
    }
    if (query.includes("SELECT id FROM admin_ai_operations")) {
      const now = String(values[0]);
      return [...this.operations.values()]
        .filter(
          (row) =>
            !row.payload_scrubbed_at &&
            String(row.payload_expires_at) <= now &&
            (row.status !== "prepared" || String(row.expires_at) <= now),
        )
        .slice(0, Number(values[2]))
        .map((row) => ({ id: row.id }));
    }
    if (
      query.includes("FROM students s JOIN dojos d") &&
      query.includes("public_student_id IN")
    ) {
      this.resolveHook?.();
      this.resolveHook = undefined;
      const scoped = query.includes("AND s.dojo_id = ?");
      const dojoId = scoped ? String(values[values.length - 1]) : null;
      const ids = (scoped ? values.slice(0, -1) : values).map(String);
      return [...this.students.values()]
        .filter((student) => ids.includes(student.public_student_id))
        .filter((student) => !dojoId || student.dojo_id === dojoId)
        .map((student) => ({ ...student }));
    }
    if (
      query.includes("FROM contribution_period_students r JOIN students s") &&
      query.includes("r.student_id IN (")
    ) {
      const scoped = query.includes("AND s.dojo_id = 'dojo-rsk'");
      return values
        .slice(1)
        .map(String)
        .filter(
          (studentId) =>
            this.contributionRoster.has(studentId) &&
            (!scoped ||
              this.students.get(studentId)?.dojo_id === "dojo-rsk"),
        )
        .map((studentId) => ({
          student_id: studentId,
          status: this.contributionRoster.get(studentId),
        }));
    }
    if (query.includes("FROM contribution_period_students"))
      return values
        .slice(1)
        .map(String)
        .filter((studentId) => this.contributionSnapshots.has(studentId))
        .map((studentId) => ({ student_id: studentId }));
    if (
      query.includes("LEFT JOIN examination_applications ea") &&
      query.includes("WHERE s.id IN (")
    ) {
      return values
        .slice(2)
        .map(String)
        .filter((studentId) => this.students.has(studentId))
        .map((studentId) => {
          const exam = this.examStatuses.get(studentId);
          return {
            id: studentId,
            status: exam?.status || "not_signed_up",
            payment_status: exam?.payment_status || "",
            application_status: exam?.application_status || "",
            active: this.students.get(studentId)!.active,
          };
        });
    }
    if (query.includes("FROM training_hour_requests WHERE status = 'pending'"))
      return values
        .map(String)
        .filter((studentId) => this.pendingHourRequests.has(studentId))
        .map((studentId) => ({
          student_id: studentId,
          request_count: this.pendingHourRequests.get(studentId)!.count,
          pending_hours: this.pendingHourRequests.get(studentId)!.hours,
        }));
    if (
      query.includes(
        "FROM examination_applications WHERE student_id = ? AND cycle_id = ?",
      )
    )
      return [...this.applications.values()]
        .filter(
          (application) =>
            application.student_id === String(values[0]) &&
            application.status === "application_submitted",
        )
        .map((application) => ({ ...application }));
    if (
      query.includes("FROM payment_proofs p JOIN students s") &&
      query.includes("WHERE p.student_id = ?")
    ) {
      const dojoId = query.includes("AND s.dojo_id = ?")
        ? String(values[1])
        : null;
      const examScope = query.includes("p.payment_type = 'exam'");
      return [...this.proofs.values()]
        .filter(
          (proof) =>
            proof.student_id === String(values[0]) &&
            proof.status === "pending_review" &&
            (examScope
              ? proof.payment_type === "exam"
              : proof.payment_type !== "exam") &&
            (!dojoId ||
              (this.students.get(proof.student_id)?.dojo_id === dojoId &&
                proof.payment_type !== "renshinkan_monthly")),
        )
        .map((proof) => ({
          id: proof.id,
          status: proof.status,
          payment_type: proof.payment_type,
          covered_student_count: proof.covered,
        }));
    }
    if (
      query.includes("FROM students s JOIN dojos d") &&
      query.includes("LEFT JOIN exam_cycle_student_status ecs")
    ) {
      const dojoId = query.includes("AND s.dojo_id = ?")
        ? String(values[1])
        : null;
      return [...this.students.values()]
        .filter((student) => !dojoId || student.dojo_id === dojoId)
        .map((student) => ({
          public_student_id: student.public_student_id,
          display_name: student.display_name,
          dojo_name: student.dojo_name,
          current_rank: student.current_belt,
          requested_rank: null,
          status: this.examStatuses.get(student.id)?.status || "not_signed_up",
        }));
    }
    if (query.includes("ORDER BY p.submitted_at DESC, p.id DESC LIMIT ?"))
      return [...this.proofs.values()].map((proof) => ({
        payment_type: proof.payment_type,
        status: proof.status,
        submitted_at: "2026-08-01T00:00:00.000Z",
        public_student_id: this.students.get(proof.student_id)
          ?.public_student_id,
        display_name: this.students.get(proof.student_id)?.display_name,
        dojo_name: this.students.get(proof.student_id)?.dojo_name,
        covered_student_count: proof.covered,
      }));
    return [];
  }

  fingerprint(student: FakeStudent) {
    return [
      student.active,
      student.archived_at || "",
      student.deleted_at || "",
      student.updated_at,
      student.public_visible,
      student.public_visible_before_archive == null
        ? ""
        : student.public_visible_before_archive,
      student.profile_status,
    ].join("|");
  }

  execute(statement: FakeStatement) {
    const { query, values } = statement;
    if (query.startsWith("INSERT INTO audit_log")) {
      this.audits.push([...values]);
      return { success: true, meta: { changes: 1 } };
    }
    if (query.startsWith("INSERT INTO admin_ai_operations")) {
      if (
        [...this.operations.values()].some(
          (row) => row.idempotency_key === values[1],
        )
      )
        throw new Error(
          "UNIQUE constraint failed: admin_ai_operations.idempotency_key",
        );
      const row: Record<string, unknown> = {
        id: values[0],
        idempotency_key: values[1],
        account_id: values[2],
        session_hash: values[3],
        selected_dojo_id: values[4],
        permission_level: values[5],
        tool_name: values[6],
        tool_version: 1,
        execution_mode: values[7],
        status: values[8],
        normalized_args_json: values[9],
        args_sha256: values[10],
        preview_json: values[11],
        fingerprints_json: values[12],
        result_fingerprints_json: null,
        confirmation_sha256: values[13],
        request_id: values[14],
        undo_of_operation_id: values[15],
        undone_by_operation_id: null,
        expires_at: values[16],
        undo_expires_at: null,
        confirmed_at: null,
        completed_at: null,
        result_json: null,
        error_code: null,
        payload_expires_at: values[17],
        payload_scrubbed_at: null,
        created_at: values[18],
        updated_at: values[19],
      };
      if (
        row.undo_of_operation_id &&
        [...this.operations.values()].some(
          (existing) =>
            existing.undo_of_operation_id === row.undo_of_operation_id &&
            (existing.status === "prepared" || existing.status === "succeeded"),
        )
      )
        throw new Error("UNIQUE constraint failed: active undo");
      this.operations.set(String(row.id), row);
      return { success: true, meta: { changes: 1 } };
    }
    if (query.startsWith("INSERT INTO admin_ai_execution_claims")) {
      const id = String(values[0]);
      if (this.claims.has(id))
        throw new Error("UNIQUE constraint failed: execution claim");
      this.claims.add(id);
      return { success: true, meta: { changes: 1 } };
    }
    if (query.startsWith("INSERT INTO admin_ai_operation_state_guards")) {
      const operationId = String(values[0]);
      const guardName = query.includes("'undo_parent'")
        ? "undo_parent"
        : query.includes("'contribution_month'")
          ? "contribution_month"
          : "confirmability";
      const key = `${operationId}:${guardName}`;
      if (this.stateGuards.has(key))
        throw new Error("UNIQUE constraint failed: operation state guard");
      const child = this.operations.get(operationId);
      const observed =
        guardName === "confirmability"
          ? child
            ? `${child.status}|${String(child.expires_at) > new Date().toISOString() ? 1 : 0}|${child.payload_scrubbed_at ? 0 : 1}`
            : "missing"
          : guardName === "undo_parent"
            ? (() => {
                const parent = this.operations.get(String(values[1]));
                return parent
                  ? `${parent.status}|${String(parent.undone_by_operation_id || "")}|${String(parent.undo_expires_at) > new Date().toISOString() ? 1 : 0}|${parent.payload_scrubbed_at ? 0 : 1}`
                  : "missing";
              })()
            : this.currentBangkokMonthOverride || String(values[1]);
      const expected =
        guardName === "confirmability"
          ? "prepared|1|1"
          : guardName === "undo_parent"
            ? "succeeded||1|1"
            : String(values[1]);
      if (observed !== expected)
        throw new Error(
          "CHECK constraint failed: admin_ai_operation_state_matches",
        );
      this.stateGuards.add(key);
      return { success: true, meta: { changes: 1 } };
    }
    if (query.startsWith("INSERT INTO admin_ai_execution_guards")) {
      const operationId = String(values[0]);
      let targetId: string;
      let expected: string;
      let observed: string;
      if (query.includes("'__operation__'")) {
        targetId = "__operation__";
        expected = "prepared|1";
        const row = this.operations.get(operationId);
        observed = row
          ? `${row.status}|${String(row.expires_at) > String(values[1]) ? 1 : 0}`
          : "missing";
      } else if (query.includes("'__failure__'")) {
        targetId = "__failure__";
        expected = "prepared";
        observed = String(
          this.operations.get(operationId)?.status || "missing",
        );
      } else if (query.includes("'__expiry__'")) {
        targetId = "__expiry__";
        expected = "prepared|0";
        const row = this.operations.get(operationId);
        observed = row
          ? `${row.status}|${String(row.expires_at) > String(values[1]) ? 1 : 0}`
          : "missing";
      } else if (query.includes("'__contribution_period__'")) {
        targetId = "__contribution_period__";
        expected = "absent";
        observed = "absent";
      } else if (
        STUDENT_GUARD_PREFIXES.some((prefix) =>
          String(values[1]).startsWith(`${prefix}:`),
        )
      ) {
        targetId = String(values[1]);
        expected = String(values[2]);
        observed = this.studentStateFor(query, String(values[3]));
      } else if (
        this.delegatedGuardState(String(values[1])) !== null &&
        String(values[1]).startsWith("__")
      ) {
        targetId = String(values[1]);
        expected = String(values[2]);
        observed = this.delegatedGuardState(targetId)!;
      } else {
        targetId = String(values[1]);
        expected = String(values[2]);
        observed = this.students.has(targetId)
          ? this.fingerprint(this.students.get(targetId)!)
          : "missing";
      }
      const key = `${operationId}:${targetId}`;
      if (this.guards.has(key))
        throw new Error("UNIQUE constraint failed: execution guard");
      if (expected !== observed)
        throw new Error("CHECK constraint failed: execution guard");
      this.guards.add(key);
      return { success: true, meta: { changes: 1 } };
    }
    if (query.startsWith("UPDATE students SET current_belt = ?")) {
      const row = this.students.get(String(values[3]));
      if (row && row.current_belt === String(values[4])) {
        row.current_belt = String(values[0]);
        row.updated_at = String(values[2]);
        this.rankWrites += 1;
      }
      return { success: true, meta: { changes: 1 } };
    }
    if (query.startsWith("UPDATE students SET active = 0")) {
      const student = this.students.get(String(values[3]))!;
      student.public_visible_before_archive = student.public_visible;
      student.public_visible = 0;
      student.active = 0;
      student.archived_at = String(values[0]);
      student.updated_at = String(values[2]);
      this.archiveWrites += 1;
      return { success: true, meta: { changes: 1 } };
    }
    if (query.startsWith("UPDATE students SET active = 1")) {
      const student = this.students.get(String(values[2]))!;
      student.active = 1;
      student.public_visible = Number(values[0]);
      student.archived_at = null;
      student.updated_at = String(values[1]);
      this.restoreWrites += 1;
      return { success: true, meta: { changes: 1 } };
    }
    if (
      query.startsWith("UPDATE admin_ai_operations SET status = 'succeeded'")
    ) {
      const row = this.operations.get(String(values[7]))!;
      if (row.status !== "prepared")
        return { success: true, meta: { changes: 0 } };
      Object.assign(row, {
        status: "succeeded",
        confirmed_at: values[0],
        completed_at: values[1],
        result_json: values[2],
        result_fingerprints_json: values[3],
        undo_expires_at: values[4],
        payload_expires_at: values[5],
        error_code: null,
        updated_at: values[6],
      });
      return { success: true, meta: { changes: 1 } };
    }
    if (query.startsWith("UPDATE admin_ai_operations SET status = 'failed'")) {
      const row = this.operations.get(String(values[3]))!;
      if (row.status === "prepared")
        Object.assign(row, {
          status: "failed",
          error_code: values[0],
          payload_expires_at: values[1],
        });
      return { success: true, meta: { changes: 1 } };
    }
    if (query.startsWith("UPDATE admin_ai_operations SET status = 'expired'")) {
      const row = this.operations.get(String(values[2]))!;
      if (row.status === "prepared")
        Object.assign(row, {
          status: "expired",
          payload_expires_at: values[0],
        });
      return { success: true, meta: { changes: 1 } };
    }
    if (query.startsWith("UPDATE admin_ai_operations SET status = 'undone'")) {
      const row = this.operations.get(String(values[3]))!;
      if (row.status === "succeeded")
        Object.assign(row, {
          status: "undone",
          undone_by_operation_id: values[0],
          payload_expires_at: values[1],
        });
      return { success: true, meta: { changes: 1 } };
    }
    if (
      query.startsWith("UPDATE admin_ai_operations SET normalized_args_json")
    ) {
      const now = String(values[0]);
      let changes = 0;
      for (const id of values.slice(2, -2).map(String)) {
        const row = this.operations.get(id);
        if (
          !row ||
          row.payload_scrubbed_at ||
          String(row.payload_expires_at) > String(values.at(-2)) ||
          (row.status === "prepared" &&
            String(row.expires_at) > String(values.at(-1)))
        )
          continue;
        Object.assign(row, {
          normalized_args_json: '{"scrubbed":true}',
          args_sha256: "scrubbed",
          preview_json: "{}",
          fingerprints_json: "{}",
          result_fingerprints_json: null,
          confirmation_sha256: null,
          result_json: null,
          payload_scrubbed_at: now,
          updated_at: now,
        });
        changes += 1;
      }
      return { success: true, meta: { changes } };
    }
    if (query.startsWith("DELETE FROM admin_ai_execution_guards")) {
      const scrubbedAt = String(values.at(-1));
      const ids = new Set(
        values
          .slice(0, -1)
          .map(String)
          .filter(
            (id) => this.operations.get(id)?.payload_scrubbed_at === scrubbedAt,
          ),
      );
      this.guards = new Set(
        [...this.guards].filter((key) => !ids.has(key.split(":")[0])),
      );
      return { success: true, meta: { changes: 1 } };
    }
    if (query.startsWith("DELETE FROM admin_ai_operation_state_guards")) {
      const scrubbedAt = String(values.at(-1));
      const ids = new Set(
        values
          .slice(0, -1)
          .map(String)
          .filter(
            (id) => this.operations.get(id)?.payload_scrubbed_at === scrubbedAt,
          ),
      );
      this.stateGuards = new Set(
        [...this.stateGuards].filter((key) => !ids.has(key.split(":")[0])),
      );
      return { success: true, meta: { changes: 1 } };
    }
    if (query.startsWith("DELETE FROM admin_ai_execution_claims")) {
      const scrubbedAt = String(values.at(-1));
      for (const id of values.slice(0, -1).map(String))
        if (this.operations.get(id)?.payload_scrubbed_at === scrubbedAt)
          this.claims.delete(id);
      return { success: true, meta: { changes: 1 } };
    }
    return { success: true, meta: { changes: 1 } };
  }

  async batch(statements: FakeStatement[]) {
    this.beforeBatch?.();
    this.beforeBatch = undefined;
    this.batches.push(statements.map((statement) => statement.query));
    this.batchBindingCounts.push(
      statements.map((statement) => statement.values.length),
    );
    const students = new Map(
      [...this.students].map(([id, row]) => [id, structuredClone(row)]),
    );
    const operations = new Map(
      [...this.operations].map(([id, row]) => [id, structuredClone(row)]),
    );
    const claims = new Set(this.claims);
    const guards = new Set(this.guards);
    const stateGuards = new Set(this.stateGuards);
    const auditLength = this.audits.length;
    const archiveWrites = this.archiveWrites;
    const restoreWrites = this.restoreWrites;
    const rankWrites = this.rankWrites;
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      return results;
    } catch (error) {
      this.students = students;
      this.operations = operations;
      this.claims = claims;
      this.guards = guards;
      this.stateGuards = stateGuards;
      this.audits.length = auditLength;
      this.archiveWrites = archiveWrites;
      this.restoreWrites = restoreWrites;
      this.rankWrites = rankWrites;
      throw error;
    }
  }
}

function student(overrides: Partial<FakeStudent> = {}): FakeStudent {
  return {
    id: "student-rsk-1001",
    public_student_id: "RSK-1001",
    display_name: "Test Student",
    dojo_id: "dojo-rsk",
    dojo_name: "RenShinKan",
    current_belt: "6th Kyu",
    active: 1,
    profile_status: "approved",
    public_visible: 1,
    public_visible_before_archive: null,
    archived_at: null,
    deleted_at: null,
    updated_at: "2026-08-04T00:00:00.000Z",
    total_hours: 20,
    dojo_joined_date: "2024-01-15",
    aat_last_paid_date: null,
    ...overrides,
  };
}

function tool(name: string, args: Record<string, unknown>) {
  return {
    tool_calls: [
      {
        type: "function",
        function: { name, arguments: JSON.stringify(args) },
      },
    ],
  };
}

function request(message: string, requestId = crypto.randomUUID()) {
  return new Request("https://example.test/api/admin/auggie/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Request-ID": requestId,
    },
    body: JSON.stringify({
      message,
      locale: "en",
      currentPath: "/admin/students",
    }),
  });
}

function operationRequest(path: string) {
  return new Request(`https://example.test${path}`, {
    method: "POST",
    headers: { "X-Request-ID": crypto.randomUUID() },
  });
}

function env(
  db: FakeDb,
  run: ReturnType<typeof vi.fn>,
  extra: Record<string, unknown> = {},
) {
  return {
    STUDENT_DB: db,
    SESSION_SECRET: "a".repeat(48),
    AI: { run },
    ...extra,
  } as never;
}

beforeEach(() => {
  authState.session = {
    sub: "admin",
    iat: 1,
    exp: 9_999_999_999,
    sessionId: "auggie-session",
    accountId: "auggie-account",
    adminName: "Auggie Test Admin",
    role: "central",
    allowedDojoIds: [],
    selectedDojoId: "dojo-rsk",
  };
  delegated.state.calls.length = 0;
  delegated.state.status = 200;
  delegated.state.body = { ok: true };
  delegated.state.apply = undefined;
});

describe("Admin Auggie inference boundary", () => {
  it("rejects sensitive EN/TH values and recognizable credentials without inference", async () => {
    for (const value of [
      "email: person@example.com",
      "phone +66 81 234 5678",
      "passport number: AB1234567",
      "รหัสผ่าน: ลับมาก123",
      "เลขบัตรประชาชน 1-2345-67890-12-3",
      "admin note: private medical detail",
      "questionnaire answer: private answer",
      "AKIAIOSFODNN7EXAMPLE",
      "sk-abcdefghijklmnopqrstuvwxyz123456",
      "-----BEGIN PRIVATE KEY-----",
    ])
      expect(detectSensitiveAdminAuggieInput(value), value).not.toBeNull();
    expect(
      detectSensitiveAdminAuggieInput("Open the payslip review page"),
    ).toBeNull();
    expect(
      detectSensitiveAdminAuggieInput("Search Student ID RSK-1001"),
    ).toBeNull();

    const db = new FakeDb();
    const run = vi.fn();
    const secret = "person@example.com";
    await expect(
      handleAdminAuggieChat(request(`find ${secret}`), env(db, run)),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_SENSITIVE_INPUT" });
    expect(run).not.toHaveBeenCalled();
    expect(JSON.stringify(db.audits)).not.toContain(secret);
    expect(
      db.audits.some(
        (values) => values[1] === "admin_ai_sensitive_input_rejected",
      ),
    ).toBe(true);
  });

  it("uses current function-tool payloads, latest text only, and an abort signal", async () => {
    const db = new FakeDb();
    const run = vi.fn(async () =>
      tool("navigate_admin", { destination: "dashboard" }),
    );
    await handleAdminAuggieChat(request("Open the dashboard"), env(db, run));
    const [, input, options] = run.mock.calls[0];
    expect(
      input.tools.every((entry: unknown) =>
        Boolean(
          (entry as { type?: string; function?: unknown }).type ===
            "function" && (entry as { function?: unknown }).function,
        ),
      ),
    ).toBe(true);
    expect(input.messages).toHaveLength(2);
    expect(input.messages[1]).toEqual({
      role: "user",
      content: "Open the dashboard",
    });
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    ["no tool at all", { tool_calls: [] as unknown[] }],
    [
      "unreadable arguments",
      {
        tool_calls: [{ function: { name: "navigate_admin", arguments: "{" } }],
      },
    ],
    [
      "more than one tool",
      {
        tool_calls: [
          { function: { name: "navigate_admin", arguments: "{}" } },
          { function: { name: "get_dashboard_summary", arguments: "{}" } },
        ],
      },
    ],
  ])(
    "answers %s with a plain conversation reply instead of a raw failure",
    async (_label, output) => {
      const db = new FakeDb();
      const response = (await handleAdminAuggieChat(
        request("hello there"),
        env(
          db,
          vi.fn(async () => output),
        ),
      )) as { kind: string; message: string };
      expect(response.kind).toBe("conversation");
      expect(response.message.length).toBeGreaterThan(0);
      // Recorded as an ordinary conversation, never as a failure.
      expect(
        db.audits.some((values) => values[1] === "admin_ai_conversation"),
      ).toBe(true);
      expect(
        db.audits.some((values) => String(values[1] ?? "").includes("failed")),
      ).toBe(false);
    },
  );

  it("still refuses an unknown tool name the model invented", async () => {
    const db = new FakeDb();
    await expect(
      handleAdminAuggieChat(
        request("Do the task"),
        env(
          db,
          vi.fn(async () => tool("delete_everything", {})),
        ),
      ),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_UNKNOWN_TOOL" });
  });

  it("answers a greeting when the model chooses the converse tool", async () => {
    const db = new FakeDb();
    const run = vi.fn(async () => tool("converse", {}));
    const response = (await handleAdminAuggieChat(
      request("hi"),
      env(db, run),
    )) as { kind: string; heading: string; message: string };
    expect(response.kind).toBe("conversation");
    // A few plain examples of what it can do, and no database write at all.
    expect(response.message).toMatch(/student|dojo|นักเรียน|โดโจ/);
    expect(delegated.state.calls).toHaveLength(0);
    expect(
      db.audits.some((values) => values[1] === "admin_ai_conversation"),
    ).toBe(true);
  });

  it("always offers the converse tool so a greeting has somewhere to go", async () => {
    const db = new FakeDb();
    const run = vi.fn(async () => tool("converse", {}));
    await handleAdminAuggieChat(request("hi"), env(db, run));
    const offered = (
      run.mock.calls[0][1] as { tools: Array<{ function: { name: string } }> }
    ).tools.map((entry) => entry.function.name);
    expect(offered).toContain("converse");
  });

  it("cancels a chunked body once the byte limit is crossed", async () => {
    const oversized = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("{"));
        controller.enqueue(new Uint8Array(9_000));
        controller.close();
      },
    });
    const oversizedRequest = new Request(
      "https://example.test/api/admin/auggie/chat",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: oversized,
        duplex: "half",
      } as RequestInit & { duplex: "half" },
    );
    await expect(
      parseBoundedJson(oversizedRequest, ["message"]),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_BODY_LIMIT", status: 413 });
  });
});

describe("Admin Auggie prepared operations", () => {
  it("requires the exact phrase, replays once, and prepares a reversible undo", async () => {
    const db = new FakeDb();
    db.students.set("student-rsk-1001", student());
    const response = (await handleAdminAuggieChat(
      request("Archive RSK-1001", "archive-request-1001"),
      env(
        db,
        vi.fn(async () =>
          tool("propose_student_status", {
            action: "archive",
            studentIds: ["RSK-1001"],
          }),
        ),
      ),
    )) as { operation: { id: string; confirmationPhrase: string } };

    await expect(
      confirmAdminAuggieOperation(
        operationRequest("/api/admin/auggie/confirm"),
        env(db, vi.fn()),
        response.operation.id,
        "wrong phrase",
        "en",
      ),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_CONFIRMATION_MISMATCH" });
    expect(db.operations.get(response.operation.id)?.status).toBe("prepared");
    expect(
      db.audits.filter(
        (values) => values[1] === "admin_ai_confirmation_rejected",
      ),
    ).toHaveLength(1);

    const result = (await confirmAdminAuggieOperation(
      operationRequest("/api/admin/auggie/confirm"),
      env(db, vi.fn()),
      response.operation.id,
      response.operation.confirmationPhrase,
      "en",
    )) as { count: number };
    expect(result.count).toBe(1);
    expect(db.archiveWrites).toBe(1);
    expect(
      db.batches.some(
        (batch) =>
          batch.some((query) =>
            query.startsWith("INSERT INTO admin_ai_operation_state_guards"),
          ) &&
          batch.some((query) =>
            query.startsWith("UPDATE students SET active = 0"),
          ),
      ),
    ).toBe(true);

    await confirmAdminAuggieOperation(
      operationRequest("/api/admin/auggie/confirm"),
      env(db, vi.fn()),
      response.operation.id,
      response.operation.confirmationPhrase,
      "en",
    );
    expect(db.archiveWrites).toBe(1);

    const parentRow = db.operations.get(response.operation.id)!;
    parentRow.undo_expires_at = new Date(Date.now() + 60_000).toISOString();
    const undo = (await prepareAdminAuggieUndo(
      operationRequest("/api/admin/auggie/undo"),
      env(db, vi.fn()),
      response.operation.id,
      "en",
    )) as { operation: { id: string; confirmationPhrase: string } };
    expect(undo.operation.confirmationPhrase).toBe("RESTORE 1 STUDENT");
    expect(
      Date.parse(String(db.operations.get(undo.operation.id)?.expires_at)),
    ).toBeLessThanOrEqual(Date.parse(String(parentRow.undo_expires_at)));
    await confirmAdminAuggieOperation(
      operationRequest("/api/admin/auggie/confirm"),
      env(db, vi.fn()),
      undo.operation.id,
      undo.operation.confirmationPhrase,
      "en",
    );
    expect(db.restoreWrites).toBe(1);
    expect(db.operations.get(response.operation.id)?.status).toBe("undone");
    await expect(
      confirmAdminAuggieOperation(
        operationRequest("/api/admin/auggie/confirm"),
        env(db, vi.fn()),
        response.operation.id,
        response.operation.confirmationPhrase,
        "en",
      ),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_ALREADY_UNDONE" });
  });

  it("returns a concurrent winner instead of recording a false stale failure", async () => {
    const db = new FakeDb();
    db.students.set("student-rsk-1001", student());
    const proposal = (await handleAdminAuggieChat(
      request("Archive RSK-1001", "race-request-1001"),
      env(
        db,
        vi.fn(async () =>
          tool("propose_student_status", {
            action: "archive",
            studentIds: ["RSK-1001"],
          }),
        ),
      ),
    )) as { operation: { id: string; confirmationPhrase: string } };
    const winner = {
      ok: true,
      operationId: proposal.operation.id,
      action: "archive",
      count: 1,
    };
    db.resolveHook = () => {
      const row = db.operations.get(proposal.operation.id)!;
      Object.assign(row, {
        status: "succeeded",
        result_json: JSON.stringify(winner),
      });
      db.students.get("student-rsk-1001")!.updated_at =
        "2026-08-04T01:00:00.000Z";
    };
    await expect(
      confirmAdminAuggieOperation(
        operationRequest("/api/admin/auggie/confirm"),
        env(db, vi.fn()),
        proposal.operation.id,
        proposal.operation.confirmationPhrase,
        "en",
      ),
    ).resolves.toMatchObject(winner);
    expect(
      db.audits.filter((values) => values[1] === "admin_ai_write_failed"),
    ).toHaveLength(0);
  });

  it("denies cross-dojo targets in SQL and blocks stale atomic execution", async () => {
    authState.session.role = "dojo";
    authState.session.selectedDojoId = "dojo-cmu";
    authState.session.allowedDojoIds = ["dojo-cmu"];
    const db = new FakeDb();
    db.students.set("student-rsk-1001", student());
    await expect(
      handleAdminAuggieChat(
        request("Archive RSK-1001"),
        env(
          db,
          vi.fn(async () =>
            tool("propose_student_status", {
              action: "archive",
              studentIds: ["RSK-1001"],
            }),
          ),
        ),
      ),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_TARGET_MISSING" });

    authState.session.role = "central";
    authState.session.selectedDojoId = "dojo-rsk";
    const proposal = (await handleAdminAuggieChat(
      request("Archive RSK-1001", "stale-request-1001"),
      env(
        db,
        vi.fn(async () =>
          tool("propose_student_status", {
            action: "archive",
            studentIds: ["RSK-1001"],
          }),
        ),
      ),
    )) as { operation: { id: string; confirmationPhrase: string } };
    db.students.get("student-rsk-1001")!.updated_at =
      "2026-08-04T02:00:00.000Z";
    await expect(
      confirmAdminAuggieOperation(
        operationRequest("/api/admin/auggie/confirm"),
        env(db, vi.fn()),
        proposal.operation.id,
        proposal.operation.confirmationPhrase,
        "en",
      ),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_STALE" });
    expect(db.archiveWrites).toBe(0);
    expect(
      db.audits.filter((values) => values[1] === "admin_ai_write_failed"),
    ).toHaveLength(1);
  });

  it("classifies a confirmability guard deadline race as expired", async () => {
    const db = new FakeDb();
    db.students.set("student-rsk-1001", student());
    const proposal = (await handleAdminAuggieChat(
      request("Archive RSK-1001", "expiry-race-1001"),
      env(
        db,
        vi.fn(async () =>
          tool("propose_student_status", {
            action: "archive",
            studentIds: ["RSK-1001"],
          }),
        ),
      ),
    )) as { operation: { id: string; confirmationPhrase: string } };
    db.beforeBatch = () => {
      db.operations.get(proposal.operation.id)!.expires_at = new Date(
        Date.now() - 1_000,
      ).toISOString();
    };
    await expect(
      confirmAdminAuggieOperation(
        operationRequest("/api/admin/auggie/confirm"),
        env(db, vi.fn()),
        proposal.operation.id,
        proposal.operation.confirmationPhrase,
        "en",
      ),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_EXPIRED" });
    expect(db.archiveWrites).toBe(0);
    expect(db.operations.get(proposal.operation.id)?.status).toBe("expired");
    expect(
      db.audits.filter((values) => values[1] === "admin_ai_write_expired"),
    ).toHaveLength(1);
    expect(
      db.audits.filter((values) => values[1] === "admin_ai_write_failed"),
    ).toHaveLength(0);
  });

  it("caps undo expiry and blocks inverse writes when the parent changes", async () => {
    const db = new FakeDb();
    db.students.set("student-rsk-1001", student());
    const proposal = (await handleAdminAuggieChat(
      request("Archive RSK-1001", "undo-parent-1001"),
      env(
        db,
        vi.fn(async () =>
          tool("propose_student_status", {
            action: "archive",
            studentIds: ["RSK-1001"],
          }),
        ),
      ),
    )) as { operation: { id: string; confirmationPhrase: string } };
    await confirmAdminAuggieOperation(
      operationRequest("/api/admin/auggie/confirm"),
      env(db, vi.fn()),
      proposal.operation.id,
      proposal.operation.confirmationPhrase,
      "en",
    );
    const parent = db.operations.get(proposal.operation.id)!;
    parent.undo_expires_at = new Date(Date.now() + 45_000).toISOString();
    const undo = (await prepareAdminAuggieUndo(
      operationRequest("/api/admin/auggie/undo"),
      env(db, vi.fn()),
      proposal.operation.id,
      "en",
    )) as { operation: { id: string; confirmationPhrase: string } };
    expect(
      Date.parse(String(db.operations.get(undo.operation.id)?.expires_at)),
    ).toBeLessThanOrEqual(Date.parse(String(parent.undo_expires_at)));
    db.beforeBatch = () => {
      parent.undone_by_operation_id = "concurrent-undo";
    };
    await expect(
      confirmAdminAuggieOperation(
        operationRequest("/api/admin/auggie/confirm"),
        env(db, vi.fn()),
        undo.operation.id,
        undo.operation.confirmationPhrase,
        "en",
      ),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_STALE" });
    expect(db.restoreWrites).toBe(0);
  });

  it("scrubs bounded ledger payloads while retaining lifecycle and audit data", async () => {
    const db = new FakeDb();
    db.students.set("student-rsk-1001", student());
    const proposal = (await handleAdminAuggieChat(
      request("Archive RSK-1001", "retention-1001"),
      env(
        db,
        vi.fn(async () =>
          tool("propose_student_status", {
            action: "archive",
            studentIds: ["RSK-1001"],
          }),
        ),
      ),
    )) as { operation: { id: string; confirmationPhrase: string } };
    await confirmAdminAuggieOperation(
      operationRequest("/api/admin/auggie/confirm"),
      env(db, vi.fn()),
      proposal.operation.id,
      proposal.operation.confirmationPhrase,
      "en",
    );
    const row = db.operations.get(proposal.operation.id)!;
    row.payload_expires_at = "2026-01-01T00:00:00.000Z";
    const auditCount = db.audits.length;
    await expect(
      scrubExpiredAdminAuggiePayloads(db as never, "2026-08-04T12:00:00.000Z"),
    ).resolves.toBe(1);
    expect(row).toMatchObject({
      status: "succeeded",
      normalized_args_json: '{"scrubbed":true}',
      preview_json: "{}",
      result_json: null,
    });
    expect(row.tool_name).toBe("student_archive");
    expect(db.audits).toHaveLength(auditCount);
    expect(db.claims.has(proposal.operation.id)).toBe(false);
  });

  it("chunks retention writes below D1's 100-bind ceiling", async () => {
    const db = new FakeDb();
    for (let index = 0; index < 99; index += 1) {
      db.operations.set(`expired-${index}`, {
        id: `expired-${index}`,
        status: "succeeded",
        expires_at: "2026-01-01T00:00:00.000Z",
        payload_expires_at: "2026-01-01T00:00:00.000Z",
        payload_scrubbed_at: null,
      });
    }

    await expect(
      scrubExpiredAdminAuggiePayloads(
        db as never,
        "2026-08-04T12:00:00.000Z",
        1_000,
      ),
    ).resolves.toBe(99);
    expect(db.batches).toHaveLength(2);
    expect(Math.max(...db.batchBindingCounts.flat())).toBeLessThanOrEqual(100);
    expect(
      [...db.operations.values()].every((row) => row.payload_scrubbed_at),
    ).toBe(true);
  });

  it("keeps execution state when a selected payload becomes ineligible", async () => {
    const db = new FakeDb();
    db.operations.set("retention-race", {
      id: "retention-race",
      status: "prepared",
      expires_at: "2026-01-01T00:00:00.000Z",
      payload_expires_at: "2026-01-01T00:00:00.000Z",
      payload_scrubbed_at: null,
    });
    db.claims.add("retention-race");
    db.guards.add("retention-race:student-rsk-1001");
    db.stateGuards.add("retention-race:confirmability");
    db.beforeBatch = () => {
      const row = db.operations.get("retention-race")!;
      row.expires_at = "2099-01-01T00:00:00.000Z";
      row.payload_expires_at = "2099-01-01T00:00:00.000Z";
    };

    await expect(
      scrubExpiredAdminAuggiePayloads(db as never, "2026-08-04T12:00:00.000Z"),
    ).resolves.toBe(0);
    expect(db.operations.get("retention-race")?.payload_scrubbed_at).toBeNull();
    expect(db.claims.has("retention-race")).toBe(true);
    expect(db.guards.has("retention-race:student-rsk-1001")).toBe(true);
    expect(db.stateGuards.has("retention-race:confirmability")).toBe(true);
  });

  it("routes restores with a missing current contribution snapshot to manual review", async () => {
    const db = new FakeDb();
    db.contributionPeriodExists = true;
    db.students.set(
      "student-rsk-1001",
      student({
        active: 0,
        archived_at: "2026-08-03T00:00:00.000Z",
        public_visible: 0,
        public_visible_before_archive: 1,
      }),
    );
    const response = (await handleAdminAuggieChat(
      request("Restore RSK-1001", "contribution-restore-1001"),
      env(
        db,
        vi.fn(async () =>
          tool("propose_student_status", {
            action: "restore",
            studentIds: ["RSK-1001"],
          }),
        ),
      ),
    )) as { kind: string; path: string; manualOnly: boolean };
    expect(response).toMatchObject({
      kind: "navigate",
      path: "/admin/students",
      manualOnly: true,
    });
    expect(db.operations.size).toBe(0);
  });

  it("blocks a restore atomically when the Bangkok contribution month changes", async () => {
    const db = new FakeDb();
    db.students.set(
      "student-rsk-1001",
      student({
        active: 0,
        archived_at: "2026-08-03T00:00:00.000Z",
        public_visible: 0,
        public_visible_before_archive: 1,
      }),
    );
    const proposal = (await handleAdminAuggieChat(
      request("Restore RSK-1001", "month-boundary-restore-1001"),
      env(
        db,
        vi.fn(async () =>
          tool("propose_student_status", {
            action: "restore",
            studentIds: ["RSK-1001"],
          }),
        ),
      ),
    )) as { operation: { id: string; confirmationPhrase: string } };
    db.currentBangkokMonthOverride = "2099-12";

    await expect(
      confirmAdminAuggieOperation(
        operationRequest("/api/admin/auggie/confirm"),
        env(db, vi.fn()),
        proposal.operation.id,
        proposal.operation.confirmationPhrase,
        "en",
      ),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_STALE" });
    expect(db.restoreWrites).toBe(0);
  });

  it("marks large direct proposals as high impact", async () => {
    const db = new FakeDb();
    const ids = Array.from(
      { length: 10 },
      (_, index) => `RSK-${String(1001 + index)}`,
    );
    ids.forEach((publicId, index) =>
      db.students.set(
        `student-${index}`,
        student({
          id: `student-${index}`,
          public_student_id: publicId,
          display_name: `Student ${index + 1}`,
          ...(index === 0
            ? { dojo_id: "dojo-cmu", dojo_name: "CMU Aikido" }
            : {}),
        }),
      ),
    );
    const response = (await handleAdminAuggieChat(
      request("Archive these exact records", "large-archive-1001"),
      env(
        db,
        vi.fn(async () =>
          tool("propose_student_status", {
            action: "archive",
            studentIds: ids,
          }),
        ),
      ),
    )) as { operation: { highImpact: boolean; warning: string } };
    expect(response.operation.highImpact).toBe(true);
    expect(response.operation.warning).toContain("High-impact change: 10");
    expect(response.operation.warning).toContain("across 2 dojo");
  });

  it("routes soft-deleted restores to the reviewed interface", async () => {
    const db = new FakeDb();
    db.students.set(
      "student-rsk-1001",
      student({
        active: 0,
        archived_at: "2026-08-03T00:00:00.000Z",
        deleted_at: "2026-08-03T01:00:00.000Z",
        public_visible: 0,
        public_visible_before_archive: 1,
      }),
    );
    const response = (await handleAdminAuggieChat(
      request("Restore RSK-1001"),
      env(
        db,
        vi.fn(async () =>
          tool("propose_student_status", {
            action: "restore",
            studentIds: ["RSK-1001"],
          }),
        ),
      ),
    )) as { kind: string; path: string; manualOnly: boolean };
    expect(response).toMatchObject({
      kind: "navigate",
      path: "/admin/students",
      manualOnly: true,
    });
    expect(db.operations.size).toBe(0);
  });
});

function examDb() {
  const db = new FakeDb();
  db.examCycle = { id: "cycle-2026", name: "August 2026" };
  db.students.set("student-rsk-1001", student());
  db.examStatuses.set("student-rsk-1001", {
    status: "unpaid",
    payment_status: "payment_pending",
    application_status: "application_submitted",
  });
  return db;
}

async function prepare(
  db: FakeDb,
  toolName: string,
  args: Record<string, unknown>,
  requestId: string,
  environment: Record<string, unknown> = {},
) {
  return (await handleAdminAuggieChat(
    request("Prepare this change", requestId),
    env(
      db,
      vi.fn(async () => tool(toolName, args)),
      environment,
    ),
  )) as {
    operation: {
      id: string;
      confirmationPhrase: string;
      secondaryConfirmationPhrase?: string;
      requiresSecondaryConfirmation?: boolean;
      undoable?: boolean;
      path: string;
      preview: Record<string, unknown>;
    };
  };
}

describe("Admin Auggie examination and payment tools", () => {
  it("keeps examination reads inside the administrator's own dojo", async () => {
    authState.session.role = "dojo";
    authState.session.selectedDojoId = "dojo-cmu";
    authState.session.allowedDojoIds = ["dojo-cmu"];
    const db = examDb();
    db.students.set(
      "student-cmu-2001",
      student({
        id: "student-cmu-2001",
        public_student_id: "CMU-2001",
        display_name: "Chiang Mai Student",
        dojo_id: "dojo-cmu",
        dojo_name: "CMU Aikido",
      }),
    );
    const response = (await handleAdminAuggieChat(
      request("Show the exam roster"),
      env(
        db,
        vi.fn(async () => tool("list_examination_applications", {})),
      ),
    )) as { students: Array<{ studentId: string }> };
    expect(response.students.map((entry) => entry.studentId)).toEqual([
      "CMU-2001",
    ]);
  });

  it("requires both exact phrases, delegates once, and marks the audit AI-made", async () => {
    const db = examDb();
    const proposal = await prepare(
      db,
      "propose_examination_status",
      { status: "paid", studentIds: ["RSK-1001"] },
      "exam-paid-1001",
    );
    expect(proposal.operation.requiresSecondaryConfirmation).toBe(true);
    expect(proposal.operation.confirmationPhrase).toBe("EXAM PAID 1 STUDENT");
    expect(proposal.operation.secondaryConfirmationPhrase).toBe(
      "CONFIRM PAYMENT CHANGE 1 STUDENT",
    );
    expect(proposal.operation.path).toBe("/admin/exam-applications");
    expect(proposal.operation.undoable).toBe(false);

    await expect(
      confirmAdminAuggieOperation(
        operationRequest("/api/admin/auggie/confirm"),
        env(db, vi.fn()),
        proposal.operation.id,
        proposal.operation.confirmationPhrase,
        "en",
      ),
    ).rejects.toMatchObject({
      code: "ADMIN_AUGGIE_SECOND_CONFIRMATION_REQUIRED",
    });
    await expect(
      confirmAdminAuggieOperation(
        operationRequest("/api/admin/auggie/confirm"),
        env(db, vi.fn()),
        proposal.operation.id,
        proposal.operation.confirmationPhrase,
        "en",
        "CONFIRM PAYMENT CHANGE 2 STUDENTS",
      ),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_CONFIRMATION_MISMATCH" });
    expect(delegated.state.calls).toHaveLength(0);
    expect(db.operations.get(proposal.operation.id)?.status).toBe("prepared");

    const result = (await confirmAdminAuggieOperation(
      operationRequest("/api/admin/auggie/confirm"),
      env(db, vi.fn()),
      proposal.operation.id,
      proposal.operation.confirmationPhrase,
      "en",
      proposal.operation.secondaryConfirmationPhrase!,
    )) as { count: number; delegatedRequestId: string; undoable: boolean };
    expect(result.count).toBe(1);
    expect(result.undoable).toBe(false);
    expect(delegated.state.calls).toHaveLength(1);

    const call = delegated.state.calls[0];
    expect(call.route).toBe("admin/examinations");
    expect(call.body).toEqual({
      action: "update_status",
      confirmed: true,
      cycleId: "cycle-2026",
      status: "paid",
      studentIds: ["student-rsk-1001"],
    });
    expect(call.headers["x-request-id"]).toBe(
      `admin-auggie:${proposal.operation.id}`,
    );
    expect(result.delegatedRequestId).toBe(
      `admin-auggie:${proposal.operation.id}`,
    );
    expect(db.archiveWrites + db.restoreWrites).toBe(0);

    const success = db.audits.find(
      (values) => values[1] === "admin_ai_write_succeeded",
    );
    expect(JSON.parse(String(success?.[13]))).toMatchObject({
      aiGenerated: true,
      aiAssistant: "admin_auggie",
      delegatedRoute: "admin/examinations",
      secondConfirmationRequired: true,
    });

    await confirmAdminAuggieOperation(
      operationRequest("/api/admin/auggie/confirm"),
      env(db, vi.fn()),
      proposal.operation.id,
      proposal.operation.confirmationPhrase,
      "en",
      proposal.operation.secondaryConfirmationPhrase!,
    );
    expect(delegated.state.calls).toHaveLength(1);

    await expect(
      prepareAdminAuggieUndo(
        operationRequest("/api/admin/auggie/undo"),
        env(db, vi.fn()),
        proposal.operation.id,
        "en",
      ),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_UNDO_UNAVAILABLE" });
  });

  it("never offers or runs a money tool outside the administrator's permission", async () => {
    authState.session.role = "dojo";
    authState.session.selectedDojoId = "dojo-cmu";
    authState.session.allowedDojoIds = ["dojo-cmu"];
    const db = examDb();
    const run = vi.fn(async () =>
      tool("propose_contribution_status", {
        status: "paid",
        studentIds: ["RSK-1001"],
      }),
    );
    await expect(
      handleAdminAuggieChat(request("Mark them paid"), env(db, run)),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_ROUTE_FORBIDDEN" });
    const offered = (
      run.mock.calls[0][1] as {
        tools: Array<{ function: { name: string } }>;
      }
    ).tools.map((entry) => entry.function.name);
    expect(offered).not.toContain("propose_contribution_status");
    expect(offered).not.toContain("get_contribution_summary");
    expect(offered).toContain("propose_examination_status");
    expect(delegated.state.calls).toHaveLength(0);
  });

  it("takes the contribution amount from server configuration, never from the model", async () => {
    const db = examDb();
    db.contributionRoster.set("student-rsk-1001", "awaiting_payment");
    await expect(
      prepare(
        db,
        "propose_contribution_status",
        { status: "paid", studentIds: ["RSK-1001"], amount: 99 },
        "contribution-amount-1001",
        { RENSHINKAN_MONTHLY_CONTRIBUTION_AMOUNT: "500" },
      ),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_REQUEST_INVALID" });

    await expect(
      prepare(
        db,
        "propose_contribution_status",
        { status: "paid", studentIds: ["RSK-1001"] },
        "contribution-unset-1001",
      ),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_CONFIGURATION" });

    const proposal = await prepare(
      db,
      "propose_contribution_status",
      { status: "paid", studentIds: ["RSK-1001"] },
      "contribution-paid-1001",
      { RENSHINKAN_MONTHLY_CONTRIBUTION_AMOUNT: "500" },
    );
    expect(proposal.operation.requiresSecondaryConfirmation).toBe(true);
    await confirmAdminAuggieOperation(
      operationRequest("/api/admin/auggie/confirm"),
      env(db, vi.fn(), { RENSHINKAN_MONTHLY_CONTRIBUTION_AMOUNT: "500" }),
      proposal.operation.id,
      proposal.operation.confirmationPhrase,
      "en",
      proposal.operation.secondaryConfirmationPhrase!,
    );
    expect(delegated.state.calls[0].body).toMatchObject({
      contributionType: "renshinkan_monthly",
      action: "update_status",
      confirmed: true,
      status: "paid",
      amount: 500,
      studentIds: ["student-rsk-1001"],
    });
  });

  it("blocks a payslip decision when another administrator reviewed it first", async () => {
    const db = examDb();
    db.proofs.set("proof-1", {
      id: "proof-1",
      student_id: "student-rsk-1001",
      status: "pending_review",
      payment_type: "exam",
      covered: 1,
    });
    const proposal = await prepare(
      db,
      "propose_payment_proof_decision",
      { decision: "approve", scope: "exam", studentIds: ["RSK-1001"] },
      "payslip-approve-1001",
    );
    expect(proposal.operation.secondaryConfirmationPhrase).toBe(
      "CONFIRM REVIEWED EVIDENCE 1 PAYSLIP",
    );
    db.proofs.get("proof-1")!.status = "approved";

    await expect(
      confirmAdminAuggieOperation(
        operationRequest("/api/admin/auggie/confirm"),
        env(db, vi.fn()),
        proposal.operation.id,
        proposal.operation.confirmationPhrase,
        "en",
        proposal.operation.secondaryConfirmationPhrase!,
      ),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_STALE" });
    expect(delegated.state.calls).toHaveLength(0);
    expect(
      db.audits.filter((values) => values[1] === "admin_ai_write_failed"),
    ).toHaveLength(1);
    expect(db.operations.get(proposal.operation.id)?.status).toBe("failed");
  });

  it("fails safely when the reviewed endpoint refuses the delegated write", async () => {
    const db = examDb();
    db.applications.set("application-1", {
      id: "application-1",
      student_id: "student-rsk-1001",
      status: "application_submitted",
      payment_status: "payment_pending",
      attempted_rank: "5th Kyu",
    });
    const proposal = await prepare(
      db,
      "propose_examination_rejection",
      { studentId: "RSK-1001" },
      "exam-reject-1001",
    );
    expect(proposal.operation.confirmationPhrase).toBe(
      "REJECT 1 EXAM APPLICATION",
    );
    expect(proposal.operation.requiresSecondaryConfirmation).toBe(false);
    delegated.state.status = 409;
    delegated.state.body = {
      error: "Another administrator has already processed this application.",
    };
    await expect(
      confirmAdminAuggieOperation(
        operationRequest("/api/admin/auggie/confirm"),
        env(db, vi.fn()),
        proposal.operation.id,
        proposal.operation.confirmationPhrase,
        "en",
      ),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_DELEGATED_REJECTED" });
    expect(delegated.state.calls[0].params).toEqual({
      applicationId: "application-1",
    });
    expect(db.operations.get(proposal.operation.id)?.status).toBe("failed");
    expect(
      db.audits.some((values) => values[1] === "admin_ai_write_succeeded"),
    ).toBe(false);
  });

  it("edits one student record through the reviewed endpoint and undoes it", async () => {
    const db = new FakeDb();
    db.students.set("student-rsk-1001", student({ current_belt: "6 Kyu" }));
    delegated.state.apply = (call: DelegatedCall) => {
      const row = db.students.get("student-rsk-1001")!;
      if (call.body.currentBelt) row.current_belt = String(call.body.currentBelt);
    };
    const proposal = await prepare(
      db,
      "propose_student_record_update",
      { studentId: "RSK-1001", currentRank: "5 Kyu" },
      "student-edit-1001",
    );
    expect(proposal.operation.confirmationPhrase).toBe("EDIT RSK-1001");
    expect(proposal.operation.requiresSecondaryConfirmation).toBe(false);
    expect(proposal.operation.path).toBe("/admin/students");
    expect(proposal.operation.preview.records).toEqual([
      expect.objectContaining({
        studentId: "RSK-1001",
        before: "6 Kyu",
        after: "5 Kyu",
      }),
    ]);

    const result = (await confirmAdminAuggieOperation(
      operationRequest("/api/admin/auggie/confirm"),
      env(db, vi.fn()),
      proposal.operation.id,
      proposal.operation.confirmationPhrase,
      "en",
    )) as { count: number; undoable: boolean; undoUntil?: string };
    expect(result.undoable).toBe(true);
    expect(delegated.state.calls).toHaveLength(1);
    expect(delegated.state.calls[0].route).toBe("admin/student-record");
    expect(delegated.state.calls[0].params).toEqual({ id: "student-rsk-1001" });
    expect(delegated.state.calls[0].url).toContain(
      "/api/admin/students/student-rsk-1001",
    );
    // Only the one instruction is sent; every other field stays with the row
    // the reviewed endpoint re-reads for itself.
    expect(delegated.state.calls[0].body).toEqual({ currentBelt: "5 Kyu" });
    expect(db.students.get("student-rsk-1001")!.current_belt).toBe("5 Kyu");
    expect(
      JSON.parse(
        String(
          db.audits.find((values) => values[1] === "admin_ai_write_succeeded")
            ?.[13],
        ),
      ),
    ).toMatchObject({ aiGenerated: true, aiAssistant: "admin_auggie" });

    const undo = (await prepareAdminAuggieUndo(
      operationRequest("/api/admin/auggie/undo"),
      env(db, vi.fn()),
      proposal.operation.id,
      "en",
    )) as { operation: { id: string; confirmationPhrase: string } };
    expect(undo.operation.confirmationPhrase).toBe("UNDO EDIT RSK-1001");
    await confirmAdminAuggieOperation(
      operationRequest("/api/admin/auggie/confirm"),
      env(db, vi.fn()),
      undo.operation.id,
      undo.operation.confirmationPhrase,
      "en",
    );
    expect(delegated.state.calls[1].body).toEqual({ currentBelt: "6 Kyu" });
    expect(db.students.get("student-rsk-1001")!.current_belt).toBe("6 Kyu");
    expect(db.operations.get(proposal.operation.id)?.status).toBe("undone");
  });

  it("blocks a student edit that changes nothing, an unknown rank, and a later edit", async () => {
    const db = new FakeDb();
    db.students.set("student-rsk-1001", student({ current_belt: "6 Kyu" }));
    await expect(
      prepare(
        db,
        "propose_student_record_update",
        { studentId: "RSK-1001", currentRank: "6 Kyu" },
        "student-edit-noop",
      ),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_TARGET_STATE" });
    await expect(
      prepare(
        db,
        "propose_student_record_update",
        { studentId: "RSK-1001", currentRank: "Grand Master" },
        "student-edit-bad-rank",
      ),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_REQUEST_INVALID" });

    const proposal = await prepare(
      db,
      "propose_student_record_update",
      { studentId: "RSK-1001", publicVisible: false },
      "student-edit-visible",
    );
    db.students.get("student-rsk-1001")!.current_belt = "5 Kyu";
    await expect(
      confirmAdminAuggieOperation(
        operationRequest("/api/admin/auggie/confirm"),
        env(db, vi.fn()),
        proposal.operation.id,
        proposal.operation.confirmationPhrase,
        "en",
      ),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_STALE" });
    expect(delegated.state.calls).toHaveLength(0);
  });

  it("adds training hours to one student and never offers to undo them", async () => {
    const db = new FakeDb();
    db.students.set("student-rsk-1001", student());
    const proposal = await prepare(
      db,
      "propose_student_hours",
      { studentId: "RSK-1001", hours: 2.5, location: "Bangkok dojo" },
      "student-hours-1001",
    );
    expect(proposal.operation.confirmationPhrase).toBe(
      "ADD 2.5 HOURS RSK-1001",
    );
    const result = (await confirmAdminAuggieOperation(
      operationRequest("/api/admin/auggie/confirm"),
      env(db, vi.fn()),
      proposal.operation.id,
      proposal.operation.confirmationPhrase,
      "en",
    )) as { undoable: boolean };
    expect(result.undoable).toBe(false);
    expect(delegated.state.calls[0].route).toBe("admin/student-hours");
    expect(delegated.state.calls[0].body).toEqual({
      hours: 2.5,
      location: "Bangkok dojo",
    });
    await expect(
      prepareAdminAuggieUndo(
        operationRequest("/api/admin/auggie/undo"),
        env(db, vi.fn()),
        proposal.operation.id,
        "en",
      ),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_UNDO_UNAVAILABLE" });
  });

  it("records one examination only when the attempted rank is higher", async () => {
    const db = new FakeDb();
    db.students.set("student-rsk-1001", student({ current_belt: "6 Kyu" }));
    await expect(
      prepare(
        db,
        "propose_student_examination",
        {
          studentId: "RSK-1001",
          attemptedRank: "7 Kyu",
          passed: true,
          location: "Bangkok dojo",
          examinationDate: "2026-08-01",
        },
        "student-exam-lower",
      ),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_REQUEST_INVALID" });

    const proposal = await prepare(
      db,
      "propose_student_examination",
      {
        studentId: "RSK-1001",
        attemptedRank: "5 Kyu",
        passed: true,
        location: "Bangkok dojo",
        examinationDate: "2026-08-01",
      },
      "student-exam-1001",
    );
    expect(proposal.operation.confirmationPhrase).toBe(
      "RECORD PASSED EXAM RSK-1001",
    );
    await confirmAdminAuggieOperation(
      operationRequest("/api/admin/auggie/confirm"),
      env(db, vi.fn()),
      proposal.operation.id,
      proposal.operation.confirmationPhrase,
      "en",
    );
    expect(delegated.state.calls[0].route).toBe("admin/student-exam");
    expect(delegated.state.calls[0].body).toEqual({
      currentRank: "6 Kyu",
      attemptedRank: "5 Kyu",
      passed: true,
      location: "Bangkok dojo",
      examinationDate: "2026-08-01",
    });
    await expect(
      prepareAdminAuggieUndo(
        operationRequest("/api/admin/auggie/undo"),
        env(db, vi.fn()),
        proposal.operation.id,
        "en",
      ),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_UNDO_UNAVAILABLE" });
  });

  it("needs two phrases for a profile decision and refuses one that is not waiting", async () => {
    const db = new FakeDb();
    db.students.set("student-rsk-1001", student());
    await expect(
      prepare(
        db,
        "propose_student_profile_decision",
        { studentId: "RSK-1001", decision: "approve" },
        "profile-not-waiting",
      ),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_TARGET_STATE" });

    db.students.get("student-rsk-1001")!.profile_status =
      "pending_admin_approval";
    const proposal = await prepare(
      db,
      "propose_student_profile_decision",
      { studentId: "RSK-1001", decision: "approve" },
      "profile-approve-1001",
    );
    expect(proposal.operation.confirmationPhrase).toBe(
      "APPROVE PROFILE RSK-1001",
    );
    expect(proposal.operation.secondaryConfirmationPhrase).toBe(
      "CONFIRM REVIEWED PROFILE RSK-1001",
    );
    await expect(
      confirmAdminAuggieOperation(
        operationRequest("/api/admin/auggie/confirm"),
        env(db, vi.fn()),
        proposal.operation.id,
        proposal.operation.confirmationPhrase,
        "en",
      ),
    ).rejects.toMatchObject({
      code: "ADMIN_AUGGIE_SECOND_CONFIRMATION_REQUIRED",
    });
    await confirmAdminAuggieOperation(
      operationRequest("/api/admin/auggie/confirm"),
      env(db, vi.fn()),
      proposal.operation.id,
      proposal.operation.confirmationPhrase,
      "en",
      proposal.operation.secondaryConfirmationPhrase!,
    );
    expect(delegated.state.calls[0].route).toBe(
      "admin/student-profile-status",
    );
    expect(delegated.state.calls[0].body).toEqual({ action: "approve" });
  });

  it("refuses student edits, hours and bulk actions from another dojo", async () => {
    authState.session.role = "dojo";
    authState.session.selectedDojoId = "dojo-cmu";
    authState.session.allowedDojoIds = ["dojo-cmu"];
    const db = new FakeDb();
    db.students.set("student-rsk-1001", student());
    for (const [toolName, args] of [
      [
        "propose_student_record_update",
        { studentId: "RSK-1001", currentRank: "5 Kyu" },
      ],
      ["propose_student_hours", { studentId: "RSK-1001", hours: 1 }],
      [
        "propose_bulk_student_action",
        { action: "mass_rank_change", studentIds: ["RSK-1001"], levels: 1 },
      ],
    ] as Array<[string, Record<string, unknown>]>)
      await expect(
        prepare(db, toolName, args, `cross-dojo-${toolName}`),
      ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_TARGET_MISSING" });
    expect(db.operations.size).toBe(0);
    expect(delegated.state.calls).toHaveLength(0);
  });

  it("refuses payslip and examination targets from another dojo", async () => {
    authState.session.role = "dojo";
    authState.session.selectedDojoId = "dojo-cmu";
    authState.session.allowedDojoIds = ["dojo-cmu"];
    const db = examDb();
    db.proofs.set("proof-1", {
      id: "proof-1",
      student_id: "student-rsk-1001",
      status: "pending_review",
      payment_type: "exam",
      covered: 1,
    });
    await expect(
      prepare(
        db,
        "propose_payment_proof_decision",
        {
          decision: "approve",
          scope: "contributions",
          studentIds: ["RSK-1001"],
        },
        "payslip-cross-dojo",
      ),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_TARGET_MISSING" });
    await expect(
      prepare(
        db,
        "propose_examination_status",
        { status: "paid", studentIds: ["RSK-1001"] },
        "exam-cross-dojo",
      ),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_TARGET_MISSING" });
    expect(db.operations.size).toBe(0);
    expect(delegated.state.calls).toHaveLength(0);
  });
});

describe("Admin Auggie membership payments", () => {
  function membershipDb(overrides: Partial<FakeStudent> = {}) {
    const db = new FakeDb();
    db.students.set("student-rsk-1001", student(overrides));
    return db;
  }

  it("records an AAT membership payment through the reviewed endpoint after two exact phrases, never with an amount", async () => {
    const db = membershipDb();
    const proposal = await prepare(
      db,
      "propose_membership_payment",
      { studentId: "RSK-1001", action: "mark_paid", paymentDate: "2026-08-06", aatNumber: "AAT-123" },
      "membership-paid-1001",
    );
    expect(proposal.operation.confirmationPhrase).toBe("RECORD MEMBERSHIP RSK-1001");
    expect(proposal.operation.secondaryConfirmationPhrase).toBe(
      "CONFIRM MEMBERSHIP MONEY",
    );
    expect(proposal.operation.requiresSecondaryConfirmation).toBe(true);
    expect(proposal.operation.path).toBe("/admin/memberships");
    expect(proposal.operation.undoable).toBe(false);
    expect(delegated.state.calls).toHaveLength(0);

    // The money rail: one phrase is never enough.
    await expect(
      confirmAdminAuggieOperation(
        operationRequest("/api/admin/auggie/confirm"),
        env(db, vi.fn()),
        proposal.operation.id,
        proposal.operation.confirmationPhrase,
        "en",
      ),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_SECOND_CONFIRMATION_REQUIRED" });
    expect(delegated.state.calls).toHaveLength(0);

    await confirmAdminAuggieOperation(
      operationRequest("/api/admin/auggie/confirm"),
      env(db, vi.fn()),
      proposal.operation.id,
      proposal.operation.confirmationPhrase,
      "en",
      proposal.operation.secondaryConfirmationPhrase!,
    );
    const call = delegated.state.calls[0];
    expect(call.route).toBe("admin/memberships");
    expect(call.headers["x-request-id"]).toBe(
      `admin-auggie:${proposal.operation.id}`,
    );
    expect(call.body).toEqual({
      action: "mark_paid",
      confirmed: true,
      studentId: "student-rsk-1001",
      paymentDate: "2026-08-06",
      aatNumber: "AAT-123",
      notes: "",
      amount: null,
    });
    const success = db.audits.find(
      (values) => values[1] === "admin_ai_write_succeeded",
    );
    expect(JSON.parse(String(success?.[13]))).toMatchObject({
      aiGenerated: true,
      aiAssistant: "admin_auggie",
      delegatedRoute: "admin/memberships",
      secondConfirmationRequired: true,
    });
  });

  it("reverses the paid status of the most recent membership payment the server resolves", async () => {
    const db = membershipDb({ aat_last_paid_date: "2026-01-01" });
    db.aatPaidPayments.set("student-rsk-1001", {
      id: "aat-pay-1",
      payment_date: "2026-01-01",
    });
    const proposal = await prepare(
      db,
      "propose_membership_payment",
      { studentId: "RSK-1001", action: "mark_unpaid", reason: "recorded by mistake" },
      "membership-unpaid-1001",
    );
    expect(proposal.operation.confirmationPhrase).toBe("REVERSE MEMBERSHIP RSK-1001");
    expect(proposal.operation.secondaryConfirmationPhrase).toBe(
      "CONFIRM MEMBERSHIP REVERSAL",
    );
    await confirmAdminAuggieOperation(
      operationRequest("/api/admin/auggie/confirm"),
      env(db, vi.fn()),
      proposal.operation.id,
      proposal.operation.confirmationPhrase,
      "en",
      proposal.operation.secondaryConfirmationPhrase!,
    );
    expect(delegated.state.calls[0].body).toEqual({
      action: "mark_unpaid",
      confirmed: true,
      studentId: "student-rsk-1001",
      paymentId: "aat-pay-1",
      reason: "recorded by mistake",
    });
  });

  it("refuses to reverse when the student has no recorded paid membership payment", async () => {
    const db = membershipDb();
    await expect(
      prepare(
        db,
        "propose_membership_payment",
        { studentId: "RSK-1001", action: "mark_unpaid" },
        "membership-none-1001",
      ),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_TARGET_STATE" });
    expect(db.operations.size).toBe(0);
    expect(delegated.state.calls).toHaveLength(0);
  });

  it("keeps a dojo administrator inside their own dojo (permission parity)", async () => {
    authState.session.role = "dojo";
    authState.session.selectedDojoId = "dojo-cmu";
    authState.session.allowedDojoIds = ["dojo-cmu"];
    const db = membershipDb(); // the student is in dojo-rsk
    await expect(
      prepare(
        db,
        "propose_membership_payment",
        { studentId: "RSK-1001", action: "mark_paid", paymentDate: "2026-08-06" },
        "membership-scope-1001",
      ),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_TARGET_MISSING" });
    expect(db.operations.size).toBe(0);
    expect(delegated.state.calls).toHaveLength(0);
  });

  it("refuses the recording when a membership payment was recorded after the preview", async () => {
    const db = membershipDb();
    const proposal = await prepare(
      db,
      "propose_membership_payment",
      { studentId: "RSK-1001", action: "mark_paid", paymentDate: "2026-08-06" },
      "membership-stale-1001",
    );
    // Someone else records a payment between the preview and the confirmation.
    db.students.get("student-rsk-1001")!.aat_last_paid_date = "2026-08-06";
    await expect(
      confirmAdminAuggieOperation(
        operationRequest("/api/admin/auggie/confirm"),
        env(db, vi.fn()),
        proposal.operation.id,
        proposal.operation.confirmationPhrase,
        "en",
        proposal.operation.secondaryConfirmationPhrase!,
      ),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_STALE" });
    expect(delegated.state.calls).toHaveLength(0);
    expect(db.operations.get(proposal.operation.id)?.status).toBe("failed");
  });
});

describe("Admin Auggie switch working dojo", () => {
  it("points the RenShinKan administrator to the per-page filter and never switches or writes", async () => {
    const db = new FakeDb();
    const response = (await handleAdminAuggieChat(
      request("Switch which dojo I am working in"),
      env(
        db,
        vi.fn(async () => tool("switch_working_dojo", {})),
      ),
    )) as { kind: string; heading: string; message: string; path?: string };
    expect(response.kind).toBe("navigate");
    expect(response.path).toBe("/admin/students");
    expect(response.message).toContain("dojo filter");
    expect(response.message).toContain("changes nothing in any record");
    // The dojos the administrator may work in are named from their own session,
    // read straight from the database, never sent to the model.
    expect(response.message).toContain("RenShinKan Dojo");
    expect(db.operations.size).toBe(0);
    expect(delegated.state.calls).toHaveLength(0);
  });

  it("tells a dojo administrator their working dojo is fixed at sign-in", async () => {
    authState.session.role = "dojo";
    authState.session.selectedDojoId = "dojo-cmu";
    authState.session.allowedDojoIds = ["dojo-cmu"];
    const db = new FakeDb();
    const response = (await handleAdminAuggieChat(
      request("Change my working dojo"),
      env(
        db,
        vi.fn(async () => tool("switch_working_dojo", {})),
      ),
    )) as { kind: string; message: string; path?: string };
    expect(response.kind).toBe("navigate");
    expect(response.message).toContain("fixed when you sign in");
    expect(response.message).toContain("CMU Aikido Club");
    expect(db.operations.size).toBe(0);
    expect(delegated.state.calls).toHaveLength(0);
  });

  it("offers the switch tool for a change-of-dojo message", async () => {
    const db = new FakeDb();
    const run = vi.fn(async () => tool("switch_working_dojo", {}));
    await handleAdminAuggieChat(
      request("I want to work in a different dojo"),
      env(db, run),
    );
    const offered = (
      run.mock.calls[0][1] as { tools: Array<{ function: { name: string } }> }
    ).tools.map((entry) => entry.function.name);
    expect(offered).toContain("switch_working_dojo");
  });
});

function bulkDb() {
  const db = new FakeDb();
  for (const [id, publicId, name, rank] of [
    ["student-rsk-1001", "RSK-1001", "First Student", "6 Kyu"],
    ["student-rsk-1002", "RSK-1002", "Second Student", "5 Kyu"],
    ["student-rsk-1003", "RSK-1003", "Third Student", "4 Kyu"],
  ])
    db.students.set(
      id,
      student({
        id,
        public_student_id: publicId,
        display_name: name,
        current_belt: rank,
      }),
    );
  return db;
}

const BULK_IDS = ["RSK-1001", "RSK-1002", "RSK-1003"];

describe("Admin Auggie bulk student actions", () => {
  it("shows the dojo, count and list, then needs two exact phrases and runs once", async () => {
    const db = bulkDb();
    const proposal = await prepare(
      db,
      "propose_bulk_student_action",
      {
        action: "add_hours",
        studentIds: BULK_IDS,
        hours: 3,
        location: "Bangkok dojo",
      },
      "bulk-add-hours",
    );
    expect(proposal.operation.preview.count).toBe(3);
    expect(proposal.operation.preview.dojos).toEqual(["RenShinKan"]);
    expect(
      (proposal.operation.preview.records as Array<{ studentId: string }>).map(
        (record) => record.studentId,
      ),
    ).toEqual(BULK_IDS);
    expect(proposal.operation.confirmationPhrase).toBe(
      "BULK ADD HOURS 3 STUDENTS",
    );
    expect(proposal.operation.secondaryConfirmationPhrase).toBe(
      "CONFIRM BULK CHANGE 3 STUDENTS",
    );
    expect(proposal.operation.undoable).toBe(false);

    await expect(
      confirmAdminAuggieOperation(
        operationRequest("/api/admin/auggie/confirm"),
        env(db, vi.fn()),
        proposal.operation.id,
        proposal.operation.confirmationPhrase,
        "en",
      ),
    ).rejects.toMatchObject({
      code: "ADMIN_AUGGIE_SECOND_CONFIRMATION_REQUIRED",
    });
    await expect(
      confirmAdminAuggieOperation(
        operationRequest("/api/admin/auggie/confirm"),
        env(db, vi.fn()),
        proposal.operation.id,
        proposal.operation.confirmationPhrase,
        "en",
        "CONFIRM BULK CHANGE 2 STUDENTS",
      ),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_CONFIRMATION_MISMATCH" });
    expect(delegated.state.calls).toHaveLength(0);

    const result = (await confirmAdminAuggieOperation(
      operationRequest("/api/admin/auggie/confirm"),
      env(db, vi.fn()),
      proposal.operation.id,
      proposal.operation.confirmationPhrase,
      "en",
      proposal.operation.secondaryConfirmationPhrase!,
    )) as { count: number; undoable: boolean };
    expect(result.count).toBe(3);
    expect(result.undoable).toBe(false);
    expect(delegated.state.calls).toHaveLength(1);
    expect(delegated.state.calls[0].route).toBe("admin/students-bulk");
    expect(delegated.state.calls[0].body).toEqual({
      action: "add_hours",
      studentIds: [
        "student-rsk-1001",
        "student-rsk-1002",
        "student-rsk-1003",
      ],
      hours: 3,
      location: "Bangkok dojo",
    });
    expect(delegated.state.calls[0].headers["x-request-id"]).toBe(
      `admin-auggie:${proposal.operation.id}`,
    );
    expect(
      JSON.parse(
        String(
          db.audits.find((values) => values[1] === "admin_ai_write_succeeded")
            ?.[13],
        ),
      ),
    ).toMatchObject({
      aiGenerated: true,
      aiAssistant: "admin_auggie",
      delegatedRoute: "admin/students-bulk",
      affectedCount: 3,
      secondConfirmationRequired: true,
    });

    // A second confirmation replays the stored result instead of running again.
    await confirmAdminAuggieOperation(
      operationRequest("/api/admin/auggie/confirm"),
      env(db, vi.fn()),
      proposal.operation.id,
      proposal.operation.confirmationPhrase,
      "en",
      proposal.operation.secondaryConfirmationPhrase!,
    );
    expect(delegated.state.calls).toHaveLength(1);
  });

  it("rolls the whole batch back when one student changed after the preview", async () => {
    const db = bulkDb();
    const proposal = await prepare(
      db,
      "propose_bulk_student_action",
      { action: "mass_rank_change", studentIds: BULK_IDS, levels: 1 },
      "bulk-stale-rank",
    );
    db.students.get("student-rsk-1002")!.current_belt = "3 Kyu";
    await expect(
      confirmAdminAuggieOperation(
        operationRequest("/api/admin/auggie/confirm"),
        env(db, vi.fn()),
        proposal.operation.id,
        proposal.operation.confirmationPhrase,
        "en",
        proposal.operation.secondaryConfirmationPhrase!,
      ),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_STALE" });
    expect(delegated.state.calls).toHaveLength(0);
    expect(db.students.get("student-rsk-1001")!.current_belt).toBe("6 Kyu");
    expect(db.operations.get(proposal.operation.id)?.status).toBe("failed");
  });

  it("approves pending hours only while every student still has a request", async () => {
    const db = bulkDb();
    db.pendingHourRequests.set("student-rsk-1001", { count: 1, hours: 4 });
    db.pendingHourRequests.set("student-rsk-1002", { count: 2, hours: 6 });
    await expect(
      prepare(
        db,
        "propose_bulk_student_action",
        { action: "approve_pending_hours", studentIds: BULK_IDS },
        "bulk-approve-missing",
      ),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_TARGET_STATE" });

    const proposal = await prepare(
      db,
      "propose_bulk_student_action",
      {
        action: "approve_pending_hours",
        studentIds: ["RSK-1001", "RSK-1002"],
      },
      "bulk-approve-hours",
    );
    expect(proposal.operation.confirmationPhrase).toBe(
      "BULK APPROVE HOURS 2 STUDENTS",
    );
    db.pendingHourRequests.set("student-rsk-1002", { count: 1, hours: 6 });
    await expect(
      confirmAdminAuggieOperation(
        operationRequest("/api/admin/auggie/confirm"),
        env(db, vi.fn()),
        proposal.operation.id,
        proposal.operation.confirmationPhrase,
        "en",
        proposal.operation.secondaryConfirmationPhrase!,
      ),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_STALE" });
    expect(delegated.state.calls).toHaveLength(0);
  });

  it("undoes a bulk rank change for every student in one transaction", async () => {
    const db = bulkDb();
    delegated.state.apply = (call: DelegatedCall) => {
      for (const id of call.body.studentIds as string[]) {
        const row = db.students.get(id)!;
        row.current_belt = { "6 Kyu": "5 Kyu", "5 Kyu": "4 Kyu", "4 Kyu": "3 Kyu" }[
          row.current_belt
        ]!;
      }
    };
    const proposal = await prepare(
      db,
      "propose_bulk_student_action",
      { action: "mass_rank_change", studentIds: BULK_IDS, levels: 1 },
      "bulk-rank-change",
    );
    expect(proposal.operation.confirmationPhrase).toBe(
      "BULK RANK CHANGE 3 STUDENTS",
    );
    const result = (await confirmAdminAuggieOperation(
      operationRequest("/api/admin/auggie/confirm"),
      env(db, vi.fn()),
      proposal.operation.id,
      proposal.operation.confirmationPhrase,
      "en",
      proposal.operation.secondaryConfirmationPhrase!,
    )) as { undoable: boolean; undoUntil?: string };
    expect(result.undoable).toBe(true);
    expect(db.students.get("student-rsk-1003")!.current_belt).toBe("3 Kyu");

    const undo = (await prepareAdminAuggieUndo(
      operationRequest("/api/admin/auggie/undo"),
      env(db, vi.fn()),
      proposal.operation.id,
      "en",
    )) as { operation: { id: string; confirmationPhrase: string } };
    expect(undo.operation.confirmationPhrase).toBe(
      "UNDO RANK CHANGE 3 STUDENTS",
    );
    const batchesBefore = db.batches.length;
    await confirmAdminAuggieOperation(
      operationRequest("/api/admin/auggie/confirm"),
      env(db, vi.fn()),
      undo.operation.id,
      undo.operation.confirmationPhrase,
      "en",
    );
    expect(db.rankWrites).toBe(3);
    expect(db.students.get("student-rsk-1001")!.current_belt).toBe("6 Kyu");
    expect(db.students.get("student-rsk-1002")!.current_belt).toBe("5 Kyu");
    expect(db.students.get("student-rsk-1003")!.current_belt).toBe("4 Kyu");
    expect(db.operations.get(proposal.operation.id)?.status).toBe("undone");
    // Every student goes back inside one batch, next to the claim and guards.
    const revertBatch = db.batches
      .slice(batchesBefore)
      .find((batch) =>
        batch.some((query) =>
          query.startsWith("UPDATE students SET current_belt = ?"),
        ),
      )!;
    expect(
      revertBatch.filter((query) =>
        query.startsWith("UPDATE students SET current_belt = ?"),
      ),
    ).toHaveLength(3);
    expect(
      revertBatch.some((query) =>
        query.startsWith("INSERT INTO admin_ai_execution_claims"),
      ),
    ).toBe(true);
    expect(
      revertBatch.filter((query) =>
        query.startsWith("INSERT INTO admin_ai_execution_guards"),
      ),
    ).toHaveLength(3);
    // An undo is a write of its own and is never itself undoable.
    await expect(
      prepareAdminAuggieUndo(
        operationRequest("/api/admin/auggie/undo"),
        env(db, vi.fn()),
        undo.operation.id,
        "en",
      ),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_UNDO_UNAVAILABLE" });
  });

  it("blocks the bulk undo when a rank moved again after the change", async () => {
    const db = bulkDb();
    delegated.state.apply = (call: DelegatedCall) => {
      for (const id of call.body.studentIds as string[])
        db.students.get(id)!.current_belt = "1 Kyu";
    };
    const proposal = await prepare(
      db,
      "propose_bulk_student_action",
      { action: "mass_rank_change", studentIds: ["RSK-1001"], levels: 1 },
      "bulk-rank-stale-undo",
    );
    await confirmAdminAuggieOperation(
      operationRequest("/api/admin/auggie/confirm"),
      env(db, vi.fn()),
      proposal.operation.id,
      proposal.operation.confirmationPhrase,
      "en",
      proposal.operation.secondaryConfirmationPhrase!,
    );
    db.students.get("student-rsk-1001")!.current_belt = "SHO Dan-Ho";
    await expect(
      prepareAdminAuggieUndo(
        operationRequest("/api/admin/auggie/undo"),
        env(db, vi.fn()),
        proposal.operation.id,
        "en",
      ),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_UNDO_STALE" });
    expect(db.rankWrites).toBe(0);
  });

  it("never offers an undo for a mass promotion or an archived student", async () => {
    const db = bulkDb();
    const proposal = await prepare(
      db,
      "propose_bulk_student_action",
      {
        action: "mass_promotion",
        studentIds: ["RSK-1001"],
        levels: 1,
        location: "Bangkok dojo",
        examinationDate: "2026-08-01",
      },
      "bulk-mass-promotion",
    );
    expect(proposal.operation.confirmationPhrase).toBe(
      "BULK PROMOTION 1 STUDENT",
    );
    await confirmAdminAuggieOperation(
      operationRequest("/api/admin/auggie/confirm"),
      env(db, vi.fn()),
      proposal.operation.id,
      proposal.operation.confirmationPhrase,
      "en",
      proposal.operation.secondaryConfirmationPhrase!,
    );
    expect(delegated.state.calls[0].body).toEqual({
      action: "mass_promotion",
      studentIds: ["student-rsk-1001"],
      levels: 1,
      location: "Bangkok dojo",
      examinationDate: "2026-08-01",
    });
    await expect(
      prepareAdminAuggieUndo(
        operationRequest("/api/admin/auggie/undo"),
        env(db, vi.fn()),
        proposal.operation.id,
        "en",
      ),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_UNDO_UNAVAILABLE" });

    db.students.get("student-rsk-1002")!.archived_at =
      "2026-08-01T00:00:00.000Z";
    db.students.get("student-rsk-1002")!.active = 0;
    await expect(
      prepare(
        db,
        "propose_bulk_student_action",
        { action: "mass_rank_change", studentIds: BULK_IDS, levels: 1 },
        "bulk-archived-target",
      ),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_TARGET_STATE" });
  });
});

describe("Admin Auggie outside lookups", () => {
  function stubFetch(pages: Array<{ ok?: boolean; body: unknown }>) {
    const urls: string[] = [];
    const fn = vi.fn(async (url: unknown) => {
      urls.push(String(url));
      const next = pages.shift() ?? { ok: true, body: {} };
      return { ok: next.ok ?? true, json: async () => next.body };
    });
    vi.stubGlobal("fetch", fn);
    return { fn, urls };
  }

  const CLEAR_38 = {
    body: {
      current: {
        temperature_2m: 38,
        relative_humidity_2m: 12,
        weather_code: 0,
        wind_speed_10m: 15,
      },
    },
  };

  it("looks up the current weather for a place through open-meteo only", async () => {
    const db = new FakeDb();
    const { urls } = stubFetch([
      {
        body: {
          results: [
            {
              name: "Riyadh",
              country: "Saudi Arabia",
              latitude: 24.71,
              longitude: 46.68,
            },
          ],
        },
      },
      CLEAR_38,
    ]);
    try {
      const response = (await handleAdminAuggieChat(
        request("what is the weather in Saudi Arabia right now"),
        env(
          db,
          vi.fn(async () =>
            tool("look_up_information", {
              topic: "weather",
              place: "Saudi Arabia",
            }),
          ),
        ),
      )) as { kind: string; message: string };
      expect(response.kind).toBe("conversation");
      expect(response.message).toContain("38");
      expect(response.message).toMatch(/open-meteo/);
      // Only the place the administrator typed left the site, and only to the
      // approved weather host. No dojo data appeared in any outbound request.
      expect(urls).toHaveLength(2);
      expect(urls[0]).toContain("geocoding-api.open-meteo.com");
      expect(urls[0]).toContain("Saudi%20Arabia");
      expect(urls[1]).toContain("api.open-meteo.com/v1/forecast");
      expect(urls.every((url) => url.includes("open-meteo.com"))).toBe(true);
      expect(urls.join(" ")).not.toMatch(/dojo-rsk|RSK-|student/i);
      // A lookup never delegates a write and never records an operation.
      expect(delegated.state.calls).toHaveLength(0);
      expect(db.audits.some((values) => values[1] === "admin_ai_lookup")).toBe(
        true,
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("caches a repeated weather question so it does not go out twice", async () => {
    const db = new FakeDb();
    const { fn } = stubFetch([
      {
        body: {
          results: [
            {
              name: "Cachetown",
              country: "Testland",
              latitude: 1,
              longitude: 2,
            },
          ],
        },
      },
      CLEAR_38,
      // No further pages: a second, uncached call would fall through to the
      // empty default and the fetch count would exceed two.
    ]);
    try {
      const ask = () =>
        handleAdminAuggieChat(
          request("weather in Cachetown"),
          env(
            db,
            vi.fn(async () =>
              tool("look_up_information", {
                topic: "weather",
                place: "Cachetown",
              }),
            ),
          ),
        );
      await ask();
      await ask();
      // Two outbound requests for the first question (geocode + forecast); the
      // second is served from the brief cache with nothing new sent out.
      expect(fn).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("declines an outside topic with no approved source, without guessing", async () => {
    const db = new FakeDb();
    const { fn } = stubFetch([]);
    try {
      const response = (await handleAdminAuggieChat(
        request("look up the news in Bangkok"),
        env(
          db,
          vi.fn(async () =>
            tool("look_up_information", { topic: "news", place: "Bangkok" }),
          ),
        ),
      )) as { kind: string; message: string };
      expect(response.kind).toBe("conversation");
      expect(response.message).toMatch(/weather/i);
      // Nothing went out at all for an unsupported source.
      expect(fn).not.toHaveBeenCalled();
      expect(delegated.state.calls).toHaveLength(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("offers the lookup tool for a weather question", async () => {
    const db = new FakeDb();
    const run = vi.fn(async () =>
      tool("look_up_information", { topic: "weather", place: "Tokyo" }),
    );
    stubFetch([
      {
        body: {
          results: [
            { name: "Tokyo", country: "Japan", latitude: 35, longitude: 139 },
          ],
        },
      },
      CLEAR_38,
    ]);
    try {
      await handleAdminAuggieChat(request("weather in Tokyo"), env(db, run));
      const offered = (
        run.mock.calls[0][1] as { tools: Array<{ function: { name: string } }> }
      ).tools.map((entry) => entry.function.name);
      expect(offered).toContain("look_up_information");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("Admin Auggie student history", () => {
  it("reads who changed a student and when, within the administrator's scope", async () => {
    const db = new FakeDb();
    db.students.set("student-rsk-1001", student());
    db.studentHistory.set("student-rsk-1001", [
      {
        action: "student_rank_updated",
        action_summary: "RSK-1001: rank changed to Shodan",
        administrator_name: "Auggie Test Admin",
        actor_identifier: "admin",
        created_at: "2026-07-15T09:30:00.000Z",
        outcome: "success",
      },
    ]);
    const run = vi.fn(async () =>
      tool("read_student_history", { studentId: "RSK-1001" }),
    );
    const response = (await handleAdminAuggieChat(
      request("who changed student RSK-1001 and when"),
      env(db, run),
    )) as { kind: string; summary?: Array<{ label: string; value: string }> };
    expect(response.kind).toBe("conversation");
    expect(response.summary?.[0].value).toContain("rank changed to Shodan");
    expect(response.summary?.[0].value).toContain("Auggie Test Admin");
    expect(response.summary?.[0].label).toBe("2026-07-15 09:30");
    expect(delegated.state.calls).toHaveLength(0);
    expect(db.audits.some((values) => values[1] === "admin_ai_audit_read")).toBe(
      true,
    );
  });

  it("refuses history for a student outside the administrator's dojo", async () => {
    authState.session.role = "dojo";
    authState.session.selectedDojoId = "dojo-cmu";
    authState.session.allowedDojoIds = ["dojo-cmu"];
    const db = new FakeDb();
    db.students.set("student-rsk-1001", student()); // belongs to dojo-rsk
    const run = vi.fn(async () =>
      tool("read_student_history", { studentId: "RSK-1001" }),
    );
    await expect(
      handleAdminAuggieChat(request("history for RSK-1001"), env(db, run)),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_TARGET_MISSING" });
  });
});

describe("Admin Auggie site health", () => {
  it("reports a healthy site from the status check, changing nothing", async () => {
    const db = new FakeDb();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        status: "ok",
        checks: { d1: true, kv: true, migrations: true },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const response = (await handleAdminAuggieChat(
        request("is the site healthy"),
        env(
          db,
          vi.fn(async () => tool("get_site_health", {})),
        ),
      )) as { kind: string; heading: string };
      expect(String(fetchMock.mock.calls[0][0])).toContain(
        "/api/diagnostics/health",
      );
      expect(response.heading).toMatch(/healthy/i);
      expect(delegated.state.calls).toHaveLength(0);
      expect(
        db.audits.some((values) => values[1] === "admin_ai_health_read"),
      ).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("reports a degraded site and names the failing checks", async () => {
    const db = new FakeDb();
    const fetchMock = vi.fn(async () => ({
      ok: false,
      json: async () => ({
        status: "degraded",
        checks: { d1: true, migrations: false },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const response = (await handleAdminAuggieChat(
        request("is everything ok with the site"),
        env(
          db,
          vi.fn(async () => tool("get_site_health", {})),
        ),
      )) as { heading: string; message: string };
      expect(response.heading).toMatch(/attention/i);
      expect(response.message).toMatch(/migrations/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("Admin Auggie out-of-chat subjects", () => {
  it("recognises passwords, sign-in and audit removal, and lets ordinary reads pass", () => {
    expect(detectOutOfChatScope("please change my password")).toBe(
      "credentials",
    );
    expect(detectOutOfChatScope("how do I sign in as another admin")).toBe(
      "credentials",
    );
    expect(detectOutOfChatScope("create a new administrator account")).toBe(
      "credentials",
    );
    expect(detectOutOfChatScope("delete the audit log")).toBe("audit_removal");
    expect(detectOutOfChatScope("clear the audit history")).toBe(
      "audit_removal",
    );
    // Reading the audit, or ordinary deletes elsewhere, must not be caught.
    expect(detectOutOfChatScope("who changed this student in the audit")).toBe(
      null,
    );
    expect(detectOutOfChatScope("delete that newsletter in the trash")).toBe(
      null,
    );
    expect(detectOutOfChatScope("how many students are on the roster")).toBe(
      null,
    );
  });

  it("refuses a password request politely before any model call", async () => {
    const db = new FakeDb();
    const run = vi.fn();
    const response = (await handleAdminAuggieChat(
      request("reset my password please"),
      env(db, run),
    )) as { kind: string; message: string };
    expect(run).not.toHaveBeenCalled();
    expect(response.kind).toBe("conversation");
    expect(response.message).toMatch(/sign-in|password/i);
    expect(delegated.state.calls).toHaveLength(0);
    expect(
      db.audits.some((values) => values[1] === "admin_ai_out_of_scope"),
    ).toBe(true);
    expect(
      db.audits.some((values) => String(values[1] ?? "").includes("failed")),
    ).toBe(false);
  });

  it("refuses clearing the audit log and offers the read-only history", async () => {
    const db = new FakeDb();
    const run = vi.fn();
    const response = (await handleAdminAuggieChat(
      request("wipe the audit log"),
      env(db, run),
    )) as { kind: string; message: string; path?: string };
    expect(run).not.toHaveBeenCalled();
    expect(response.kind).toBe("navigate");
    expect(response.message).toMatch(/permanent record|never be cleared/i);
    expect(response.path).toBe("/admin/audit");
    expect(delegated.state.calls).toHaveLength(0);
  });
});
