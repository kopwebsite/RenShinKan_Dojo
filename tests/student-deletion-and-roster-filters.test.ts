import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("../functions/_lib/auth", () => ({
  canAccessDojo: (_session: unknown, dojoId: string | null) => dojoId === "dojo-rsk",
  canSelectDojo: () => true,
  effectivePermissionLevel: () => "renshinkan_super_admin",
  hasSelectedDojoAccess: () => true,
  isRenShinKanSuperAdmin: () => true,
  isSameOriginRequest: () => true,
  requiresCentralAdmin: () => true,
  getAuthorizedAdminSession: async () => ({
    accountId: "admin-test",
    adminName: "Test Administrator",
    allowedDojoIds: ["dojo-rsk"],
    role: "central",
    selectedDojoId: "dojo-rsk",
  }),
  jsonResponse: (body: unknown, status = 200, headers?: HeadersInit) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...headers },
    }),
}));

import { onRequestGet as contributionsGet } from "../functions/api/admin/contributions";
import { onRequestDelete as studentDelete } from "../functions/api/admin/students/[id]";
import { onRequestGet as dashboardGet } from "../functions/api/admin/dashboard";
import { onRequestGet as deletionPreviewGet } from "../functions/api/admin/students/[id]/deletion-preview";
import { contributionPeriodCountStatement } from "../functions/_lib/studentRecords";

type Row = Record<string, unknown>;
type Statement = {
  query: string;
  values: unknown[];
  bind: (...values: unknown[]) => Statement;
  first: <T>() => Promise<T | null>;
  all: <T>() => Promise<{ success: true; results: T[] }>;
  run: () => Promise<{ success: true }>;
};

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function file(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

/**
 * Records every statement the handler prepares, and answers reads from a table
 * of matchers so each test only describes the rows it cares about.
 */
function createDb(responses: Array<{ match: string; first?: Row | null; all?: Row[] }> = []) {
  const prepared: Statement[] = [];
  let batched: Statement[] = [];
  const db = {
    prepare(query: string): Statement {
      const statement: Statement = {
        query: compact(query),
        values: [],
        bind(...values) {
          statement.values = values;
          return statement;
        },
        async first<T>() {
          const hit = responses.find((entry) => statement.query.includes(entry.match));
          return (hit && "first" in hit ? hit.first : null) as T | null;
        },
        async all<T>() {
          const hit = responses.find((entry) => statement.query.includes(entry.match));
          return { success: true as const, results: ((hit?.all as T[]) || []) };
        },
        async run() {
          return { success: true as const };
        },
      };
      prepared.push(statement);
      return statement;
    },
    async batch(statements: Statement[]) {
      batched = statements;
      return statements.map(() => ({ success: true as const }));
    },
  };
  return { db, prepared, batch: () => batched };
}

const LIVE_ROSTER =
  "s.active = 1 AND s.archived_at IS NULL AND s.deleted_at IS NULL AND s.profile_status IN ('pending_admin_approval', 'approved')";

const env = {
  STUDENT_DB: undefined as unknown,
  SESSION_SECRET: "test-only-session-secret-0000000000000000",
};

function request(url: string, init: RequestInit = {}) {
  return new Request(url, {
    headers: { "Content-Type": "application/json", "X-Request-ID": "request-test-0001" },
    ...init,
  });
}

describe("monthly contributions roster agrees with the students screen", () => {
  it("leaves archived students off the month roster", async () => {
    const harness = createDb([
      { match: "SELECT month_key FROM contribution_periods WHERE month_key = ?", first: { month_key: "2026-08" } },
      { match: "SELECT month_key FROM contribution_periods ORDER BY", all: [{ month_key: "2026-08" }] },
    ]);
    const response = await contributionsGet({
      request: request("https://renshinkandojo.org/api/admin/contributions?month=2026-08"),
      env: { ...env, STUDENT_DB: harness.db },
    } as never);

    expect(response.status).toBe(200);
    const roster = harness.prepared.find((statement) =>
      statement.query.includes("FROM contribution_period_students r JOIN students s"),
    );
    expect(roster).toBeDefined();
    expect(roster!.query).toContain(LIVE_ROSTER);
  });

  it("shows the student's rank as it is now, not as it was on the first of the month", async () => {
    const harness = createDb([
      { match: "SELECT month_key FROM contribution_periods WHERE month_key = ?", first: { month_key: "2026-08" } },
      { match: "SELECT month_key FROM contribution_periods ORDER BY", all: [{ month_key: "2026-08" }] },
    ]);
    await contributionsGet({
      request: request("https://renshinkandojo.org/api/admin/contributions?month=2026-08"),
      env: { ...env, STUDENT_DB: harness.db },
    } as never);

    const roster = harness.prepared.find((statement) =>
      statement.query.includes("FROM contribution_period_students r JOIN students s"),
    );
    expect(roster!.query).toContain("s.current_belt AS current_rank");
    expect(roster!.query).not.toContain("r.current_rank_snapshot AS current_rank");
    // Name and Student ID come from the live record for the same reason.
    expect(roster!.query).toContain("s.display_name AS student_name");
    expect(roster!.query).not.toContain("r.student_name_snapshot AS student_name");
  });

  it("counts the same students in the paid-progress chart as in the table", async () => {
    const harness = createDb([
      { match: "SELECT month_key FROM contribution_periods WHERE month_key = ?", first: { month_key: "2026-08" } },
      { match: "SELECT month_key FROM contribution_periods ORDER BY", all: [{ month_key: "2026-08" }] },
    ]);
    await contributionsGet({
      request: request("https://renshinkandojo.org/api/admin/contributions?month=2026-08"),
      env: { ...env, STUDENT_DB: harness.db },
    } as never);

    const graph = harness.prepared.find((statement) =>
      statement.query.includes("AS total_active"),
    );
    expect(graph!.query).toContain(LIVE_ROSTER);
  });

  it("recalculates the saved month total using the same roster rule", () => {
    const harness = createDb();
    const statement = contributionPeriodCountStatement(harness.db as never, "2026-08");
    expect(statement.query).toContain("UPDATE contribution_periods SET active_student_count_snapshot");
    expect(statement.query).toContain(LIVE_ROSTER);
    expect(statement.values).toEqual(["2026-08", "dojo-rsk", "2026-08"]);
  });

  it("keeps every saved-total recalculation on the one shared rule", () => {
    for (const path of [
      "functions/api/admin/contributions.ts",
      "functions/api/admin/students/index.ts",
      "functions/api/admin/students/[id].ts",
      "functions/api/admin/students/[id]/profile-status.ts",
      "functions/api/contributions.ts",
    ]) {
      const source = file(path);
      expect(source).toContain("contributionPeriodCountStatement");
      expect(source).not.toContain("SET active_student_count_snapshot = (");
    }
  });
});

describe("dashboard badges agree with the screens they open", () => {
  it("does not count archived students as waiting work", async () => {
    const harness = createDb([{ match: "SELECT (SELECT COUNT(*) FROM students s", first: {} }]);
    await dashboardGet({
      request: request("https://renshinkandojo.org/api/admin/dashboard"),
      env: { ...env, STUDENT_DB: harness.db },
    } as never);

    const counts = harness.prepared[0].query;
    for (const badge of ["AS pending_profiles", "AS pending_exams", "AS pending_hours", "AS pending_monthly_contributions"]) {
      const clause = counts.slice(0, counts.indexOf(badge));
      expect(clause.lastIndexOf("s.archived_at IS NULL")).toBeGreaterThan(
        clause.lastIndexOf("AS pending_") === -1 ? -1 : clause.lastIndexOf("AS pending_"),
      );
    }
    expect(counts).toContain("s.deleted_at IS NULL AND s.archived_at IS NULL");
  });
});

const archivedStudent = {
  id: "student-0001",
  public_student_id: "RSK-6901",
  display_name: "Mistaken Record",
  english_name: "Mistaken Record",
  thai_name: null,
  current_belt: "10th Kyu",
  dojo_id: "dojo-rsk",
  dojo_name: "RenShinKan Dojo",
  active: 0,
  archived_at: "2026-08-01T00:00:00.000Z",
  profile_image_url: "/uploads/student-profiles/2026/08/11111111-1111-4111-8111-111111111111.webp",
  pending_profile_image_key: null,
};

function deletionDb(overrides: Array<{ match: string; first?: Row | null; all?: Row[] }> = []) {
  return createDb([
    ...overrides,
    { match: "SELECT id, dojo_id FROM students WHERE id = ?", first: { id: archivedStudent.id, dojo_id: "dojo-rsk" } },
    { match: "SELECT public_student_id, display_name, active", first: archivedStudent },
    { match: "FROM students s LEFT JOIN dojos d ON d.id = s.dojo_id WHERE s.id = ?", first: archivedStudent },
    { match: "AS audit_entries", first: { monthlyContributions: 2, monthRoster: 3, payments: 1, audit_entries: 7 } },
    { match: "SELECT object_key FROM payment_proofs pp", all: [{ object_key: "payment-proofs/2026/08/proof.webp" }] },
    { match: "SELECT object_key FROM student_profile_media", all: [] },
    { match: "SELECT DISTINCT payment_request_id AS id", all: [] },
    { match: "SELECT DISTINCT month_key FROM contribution_period_students", all: [{ month_key: "2026-08" }] },
  ]);
}

function deleteRequest(body: Row) {
  return request("https://renshinkandojo.org/api/admin/students/student-0001", {
    method: "DELETE",
    body: JSON.stringify(body),
  });
}

const validDelete = {
  action: "delete_permanently",
  confirmed: true,
  secondConfirmation: true,
  studentId: "RSK-6901",
  confirmationText: "DELETE RSK-6901",
};

describe("delete forever erases the student everywhere", () => {
  it("removes every related record before the student, inside one transaction", async () => {
    const harness = deletionDb();
    const response = await studentDelete({
      request: deleteRequest(validDelete),
      env: { ...env, STUDENT_DB: harness.db },
      params: { id: "student-0001" },
    } as never);

    expect(response.status).toBe(200);
    const queries = harness.batch().map((statement) => statement.query);
    for (const table of [
      "DELETE FROM monthly_contributions",
      "DELETE FROM contribution_status_history",
      "DELETE FROM contribution_period_students",
      "DELETE FROM payment_proofs",
      "DELETE FROM payment_request_items",
      "DELETE FROM payment_history",
      "DELETE FROM examination_applications",
      "DELETE FROM application_status_history",
      "DELETE FROM belt_examinations",
      "DELETE FROM training_hours",
      "DELETE FROM training_hour_requests",
      "DELETE FROM share_tokens",
      "DELETE FROM student_id_aliases",
      "DELETE FROM aat_membership_payments",
      "DELETE FROM payments",
      "DELETE FROM students",
    ])
      expect(queries.some((query) => query.startsWith(table))).toBe(true);

    const studentRow = queries.findIndex((query) => query.startsWith("DELETE FROM students WHERE id"));
    for (const child of ["DELETE FROM monthly_contributions", "DELETE FROM payments WHERE", "DELETE FROM training_hours"]) {
      expect(queries.findIndex((query) => query.startsWith(child))).toBeLessThan(studentRow);
    }
  });

  it("clears the immutability lock only for the length of the transaction", async () => {
    const harness = deletionDb();
    await studentDelete({
      request: deleteRequest(validDelete),
      env: { ...env, STUDENT_DB: harness.db },
      params: { id: "student-0001" },
    } as never);

    const queries = harness.batch().map((statement) => statement.query);
    expect(queries[0]).toContain("INSERT INTO permanent_deletion_unlock");
    expect(queries.some((query) => query.startsWith("DELETE FROM permanent_deletion_unlock"))).toBe(true);
    expect(queries.indexOf(queries.find((query) => query.startsWith("DELETE FROM permanent_deletion_unlock"))!)).toBeGreaterThan(
      queries.findIndex((query) => query.startsWith("DELETE FROM aat_membership_payments")),
    );
  });

  it("strips the name and Student ID out of history entries", async () => {
    const harness = deletionDb();
    await studentDelete({
      request: deleteRequest(validDelete),
      env: { ...env, STUDENT_DB: harness.db },
      params: { id: "student-0001" },
    } as never);

    const scrub = harness.batch().find((statement) => statement.query.startsWith("UPDATE audit_log SET"));
    expect(scrub).toBeDefined();
    for (const column of [
      "student_id = NULL",
      "student_public_id_snapshot = NULL",
      "student_name_snapshot = NULL",
      "previous_values = NULL",
      "new_values = NULL",
    ])
      expect(scrub!.query).toContain(column);
  });

  it("keeps a deletion record that holds no name and no Student ID", async () => {
    const harness = deletionDb();
    await studentDelete({
      request: deleteRequest(validDelete),
      env: { ...env, STUDENT_DB: harness.db },
      params: { id: "student-0001" },
    } as never);

    const record = harness.batch().find((statement) =>
      statement.query.startsWith("INSERT INTO student_deletion_records"),
    );
    expect(record).toBeDefined();
    expect(record!.query).not.toContain("student_name");
    expect(record!.query).not.toContain("public_student_id");
    const bound = record!.values.map((value) => String(value));
    expect(bound).toContain("Test Administrator");
    expect(bound).not.toContain(archivedStudent.display_name);
    expect(bound).not.toContain(archivedStudent.public_student_id);
    expect(bound).not.toContain(archivedStudent.id);

    const audit = harness.batch().find((statement) => statement.query.startsWith("INSERT INTO audit_log"));
    const auditValues = audit!.values.map((value) => String(value));
    expect(auditValues.some((value) => value.includes(archivedStudent.display_name))).toBe(false);
    expect(auditValues.some((value) => value.includes(archivedStudent.public_student_id))).toBe(false);
  });

  it("recalculates every saved month total the student was counted in", async () => {
    const harness = deletionDb();
    await studentDelete({
      request: deleteRequest(validDelete),
      env: { ...env, STUDENT_DB: harness.db },
      params: { id: "student-0001" },
    } as never);

    const recount = harness.batch().find((statement) =>
      statement.query.includes("UPDATE contribution_periods SET active_student_count_snapshot"),
    );
    expect(recount).toBeDefined();
    expect(recount!.values).toEqual(["2026-08", "dojo-rsk", "2026-08"]);
  });
});

describe("delete forever refuses anything less than a full, single, in-dojo confirmation", () => {
  it("refuses a single confirmation", async () => {
    const harness = deletionDb();
    const response = await studentDelete({
      request: deleteRequest({ ...validDelete, secondConfirmation: false }),
      env: { ...env, STUDENT_DB: harness.db },
      params: { id: "student-0001" },
    } as never);

    expect(response.status).toBe(400);
    expect(harness.batch()).toHaveLength(0);
  });

  it("refuses a mistyped confirmation phrase", async () => {
    const harness = deletionDb();
    const response = await studentDelete({
      request: deleteRequest({ ...validDelete, confirmationText: "DELETE" }),
      env: { ...env, STUDENT_DB: harness.db },
      params: { id: "student-0001" },
    } as never);

    expect(response.status).toBe(400);
    expect(harness.batch()).toHaveLength(0);
  });

  it("refuses a student in another dojo", async () => {
    const harness = deletionDb([
      { match: "SELECT id, dojo_id FROM students WHERE id = ?", first: { id: archivedStudent.id, dojo_id: "dojo-cmu" } },
      { match: "FROM students s LEFT JOIN dojos d ON d.id = s.dojo_id WHERE s.id = ?", first: { ...archivedStudent, dojo_id: "dojo-cmu" } },
    ]);
    const response = await studentDelete({
      request: deleteRequest(validDelete),
      env: { ...env, STUDENT_DB: harness.db },
      params: { id: "student-0001" },
    } as never);

    expect(response.status).toBe(403);
    expect(harness.batch()).toHaveLength(0);
  });

  it("refuses a student who has not been archived first", async () => {
    const harness = deletionDb([
      { match: "SELECT public_student_id, display_name, active", first: { ...archivedStudent, active: 1, archived_at: null } },
      { match: "FROM students s LEFT JOIN dojos d ON d.id = s.dojo_id WHERE s.id = ?", first: { ...archivedStudent, active: 1, archived_at: null } },
    ]);
    const response = await studentDelete({
      request: deleteRequest(validDelete),
      env: { ...env, STUDENT_DB: harness.db },
      params: { id: "student-0001" },
    } as never);

    expect(response.status).toBe(409);
    expect(harness.batch()).toHaveLength(0);
  });

  it("is never offered for a group of students", () => {
    const page = file("src/pages/AdminStudentsPage.tsx");
    const bulk = file("functions/api/admin/students/bulk.ts");
    expect(page).not.toContain('type: "delete"');
    expect(page).not.toContain("ARCHIVED STUDENT");
    expect(bulk).not.toContain("delete_permanently");
    // The only caller sends one student id, taken from a single row action.
    expect(compact(page)).toContain('action: "delete_permanently"');
    expect(page).toContain("setDeleteTarget(student)");
  });
});

describe("delete forever is previewed before anything is removed", () => {
  it("shows the name, the Student ID and every record that would go", async () => {
    const harness = deletionDb();
    const response = await deletionPreviewGet({
      request: request("https://renshinkandojo.org/api/admin/students/student-0001/deletion-preview"),
      env: { ...env, STUDENT_DB: harness.db },
      params: { id: "student-0001" },
    } as never);

    expect(response.status).toBe(200);
    const body = await response.json<{
      student: { name: string; publicStudentId: string };
      confirmationPhrase: string;
      canDelete: boolean;
      records: Array<{ label: string; count: number }>;
      totals: { totalRecords: number; storedFiles: number; auditEntriesRedacted: number };
    }>();
    expect(body.student.name).toBe("Mistaken Record");
    expect(body.student.publicStudentId).toBe("RSK-6901");
    expect(body.confirmationPhrase).toBe("DELETE RSK-6901");
    expect(body.canDelete).toBe(true);
    expect(body.records.map((row) => row.label)).toContain("Monthly contribution records");
    expect(body.totals.totalRecords).toBe(7);
    expect(body.totals.storedFiles).toBe(2);
    expect(body.totals.auditEntriesRedacted).toBe(7);
    expect(harness.batch()).toHaveLength(0);
  });

  it("says plainly when the student must be archived first", async () => {
    const harness = deletionDb([
      { match: "FROM students s LEFT JOIN dojos d ON d.id = s.dojo_id WHERE s.id = ?", first: { ...archivedStudent, active: 1, archived_at: null } },
    ]);
    const response = await deletionPreviewGet({
      request: request("https://renshinkandojo.org/api/admin/students/student-0001/deletion-preview"),
      env: { ...env, STUDENT_DB: harness.db },
      params: { id: "student-0001" },
    } as never);

    const body = await response.json<{ canDelete: boolean; blockedReason: string }>();
    expect(body.canDelete).toBe(false);
    expect(body.blockedReason).toContain("Archive this student first");
  });
});

describe("archiving is untouched", () => {
  it("still only hides the student and keeps every record", async () => {
    const harness = createDb([
      { match: "SELECT id, dojo_id FROM students WHERE id = ?", first: { id: archivedStudent.id, dojo_id: "dojo-rsk" } },
      { match: "SELECT public_student_id, display_name, active", first: { ...archivedStudent, active: 1, archived_at: null } },
    ]);
    const response = await studentDelete({
      request: deleteRequest({ action: "archive", confirmed: true, studentId: "RSK-6901" }),
      env: { ...env, STUDENT_DB: harness.db },
      params: { id: "student-0001" },
    } as never);

    expect(response.status).toBe(200);
    const queries = harness.batch().map((statement) => statement.query);
    expect(queries.some((query) => query.includes("UPDATE students SET active = 0"))).toBe(true);
    expect(queries.some((query) => query.startsWith("DELETE FROM"))).toBe(false);
  });
});
