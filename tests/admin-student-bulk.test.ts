import { describe, expect, it, vi } from "vitest";

vi.mock("../functions/_lib/auth", () => ({
  canAccessDojo: () => true,
  effectivePermissionLevel: () => "full_admin",
  getAuthorizedAdminSession: async () => ({
    accountId: "admin-test",
    adminName: "Test Administrator",
    allowedDojoIds: ["dojo-rsk"],
    permissionLevel: "full_admin",
    role: "renshinkan",
    selectedDojoId: "dojo-rsk",
  }),
  isSameOriginRequest: () => true,
  jsonResponse: (body: unknown, status = 200, headers?: HeadersInit) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...headers },
    }),
}));

import { onRequestPost } from "../functions/api/admin/students/bulk";

type Row = Record<string, unknown>;
type PreparedStatement = {
  query: string;
  values: unknown[];
  bind: (...values: unknown[]) => PreparedStatement;
  first: <T>() => Promise<T | null>;
  all: <T>() => Promise<{ success: true; results: T[] }>;
  run: () => Promise<{ success: true }>;
};

const student = {
  id: "student-0001",
  display_name: "Example Student",
  current_belt: "6th Kyu",
  total_hours: 12,
  dojo_id: "dojo-rsk",
  active: 1,
  profile_status: "approved",
  archived_at: null,
};

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function createDb(pendingRequests: Row[] = []) {
  let batchStatements: PreparedStatement[] = [];
  const db = {
    prepare(query: string): PreparedStatement {
      const statement: PreparedStatement = {
        query: compact(query),
        values: [],
        bind(...values) {
          statement.values = values;
          return statement;
        },
        async first<T>() {
          if (
            statement.query.includes(
              "SELECT response_json FROM mutation_requests",
            )
          )
            return null;
          throw new Error(`Unexpected first() query: ${statement.query}`);
        },
        async all<T>() {
          if (statement.query.includes("FROM students s WHERE")) {
            return { success: true as const, results: [student as T] };
          }
          if (statement.query.includes("FROM training_hour_requests")) {
            return { success: true as const, results: pendingRequests as T[] };
          }
          throw new Error(`Unexpected all() query: ${statement.query}`);
        },
        async run() {
          return { success: true as const };
        },
      };
      return statement;
    },
    async batch(statements: PreparedStatement[]) {
      batchStatements = statements;
      return statements.map(() => ({ success: true as const }));
    },
  };

  return { db, batch: () => batchStatements };
}

async function postBulk(body: Row, db: ReturnType<typeof createDb>["db"]) {
  const request = new Request(
    "https://renshinkandojo.org/api/admin/students/bulk",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-ID": "request-test-0001",
      },
      body: JSON.stringify(body),
    },
  );
  return onRequestPost({
    request,
    env: {
      STUDENT_DB: db,
      SESSION_SECRET: "test-only-bulk-session-secret-000000000000",
    },
  } as never);
}

describe("administrator student bulk training-hour mutations", () => {
  it("adds administrator-entered hours without inventing a student request decision", async () => {
    const harness = createDb();
    const response = await postBulk(
      {
        action: "add_hours",
        studentIds: [student.id],
        hours: 2.5,
        location: "Main dojo",
      },
      harness.db,
    );

    expect(response.status).toBe(201);
    const statements = harness.batch();
    expect(
      statements.some((statement) =>
        statement.query.includes("INSERT INTO training_hours"),
      ),
    ).toBe(true);
    expect(
      statements.some((statement) =>
        statement.query.includes("INSERT INTO request_decisions"),
      ),
    ).toBe(false);
  });

  it("claims each pending request before applying its approved hours", async () => {
    const pending = {
      id: "hours-request-0001",
      student_id: student.id,
      submitted_hours: 3.5,
      previous_total: 12,
      requested_total: 15.5,
    };
    const harness = createDb([pending]);
    const response = await postBulk(
      { action: "approve_pending_hours", studentIds: [student.id] },
      harness.db,
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      requestCount: 1,
      hoursApproved: 3.5,
    });
    const statements = harness.batch();
    const decisionIndex = statements.findIndex((statement) =>
      statement.query.includes("INSERT INTO request_decisions"),
    );
    const hoursIndex = statements.findIndex((statement) =>
      statement.query.includes("INSERT INTO training_hours"),
    );
    expect(decisionIndex).toBeGreaterThanOrEqual(0);
    expect(decisionIndex).toBeLessThan(hoursIndex);
    expect(statements[decisionIndex].values.slice(1, 3)).toEqual([
      pending.id,
      "Test Administrator",
    ]);
  });
});
