import { describe, expect, it } from "vitest";
import {
  appendConversationTurn,
  clearConversationSession,
  modelConversationContext,
  modelConversationMessages,
  newConversationState,
  readConversationSession,
  writeConversationSession,
  type ConversationOwner,
} from "../functions/_lib/adminAuggieConversation";
import {
  adminAuggieDailyBudget,
  getAdminAuggieUsageSummary,
  recordAdminAuggieUsage,
  tokenUsageFromAiOutput,
} from "../functions/_lib/adminAuggieUsage";

class Statement {
  values: unknown[] = [];

  constructor(
    private db: MemoryDb,
    readonly query: string,
  ) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  first<T>() {
    return Promise.resolve(this.db.first(this) as T | null);
  }

  run() {
    return Promise.resolve(this.db.run(this));
  }
}

class MemoryDb {
  conversations = new Map<string, Record<string, unknown>>();
  usage = new Map<string, Record<string, number>>();

  prepare(query: string) {
    return new Statement(this, query.replace(/\s+/g, " ").trim());
  }

  batch(statements: Statement[]) {
    return Promise.resolve(statements.map((statement) => this.run(statement)));
  }

  ownerKey(values: unknown[]) {
    return values.slice(0, 3).join("|");
  }

  first(statement: Statement) {
    const { query, values } = statement;
    if (query.includes("FROM admin_ai_conversation_sessions"))
      return this.conversations.get(this.ownerKey(values)) || null;
    if (query.includes("FROM admin_ai_daily_usage"))
      return this.usage.get(`${values[0]}|${values[1]}|${values[2]}`) || null;
    return null;
  }

  run(statement: Statement) {
    const { query, values } = statement;
    if (query.startsWith("INSERT INTO admin_ai_conversation_sessions")) {
      this.conversations.set(`${values[1]}|${values[2]}|${values[3]}`, {
        locale: values[5],
        current_path: values[6],
        summary_text: values[7],
        messages_json: values[8],
        context_json: values[9],
        started_at: values[10],
        expires_at: values[11],
        created_at: values[12],
        updated_at: values[13],
      });
    } else if (query.startsWith("DELETE FROM admin_ai_conversation_sessions")) {
      this.conversations.delete(this.ownerKey(values));
    } else if (query.startsWith("INSERT INTO admin_ai_daily_usage")) {
      const key = `${values[0]}|${values[1]}|${values[2]}`;
      const previous = this.usage.get(key) || {
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
        calls: 0,
        unreported_calls: 0,
      };
      this.usage.set(key, {
        input_tokens: previous.input_tokens + Number(values[3]),
        output_tokens: previous.output_tokens + Number(values[4]),
        total_tokens: previous.total_tokens + Number(values[5]),
        calls: previous.calls + 1,
        unreported_calls: previous.unreported_calls + Number(values[6]),
      });
    }
    return { success: true, meta: { changes: 1 } };
  }
}

const owner: ConversationOwner = {
  accountId: "admin-one",
  sessionHash: "session-hash",
  selectedDojoId: "dojo-rsk",
  permission: "renshinkan_super_admin",
};

describe("Admin Auggie bounded conversation memory", () => {
  it("keeps selected entities and tasks while bounding and summarizing messages", () => {
    const state = newConversationState("en", "/admin/students");
    state.context.currentStudent = {
      type: "student",
      id: "RSK-1001",
      label: "Somchai",
      status: "active",
      dojo: "RenShinKan Dojo",
    };
    state.context.currentTask = {
      type: "add_training_hours",
      slots: { studentId: "RSK-1001", hours: 1.5, entryDate: "2026-08-10" },
    };
    state.context.pendingOperationId = "operation-one";

    for (let index = 0; index < 8; index += 1)
      appendConversationTurn(state, `message ${index}`, {
        kind: "conversation",
        heading: "Auggie",
        message: `reply ${index}`,
      });

    expect(state.messages).toHaveLength(12);
    expect(state.summary).toContain("message 0");
    expect(modelConversationMessages(state)).toHaveLength(8);
    const context = modelConversationContext(state);
    expect(context).toContain("RSK-1001");
    expect(context).toContain("operation-one");
    expect(context).toContain("add_training_hours");
  });

  it("persists only inside the account/session/dojo owner and clears on reset", async () => {
    const db = new MemoryDb();
    const state = newConversationState("th", "/admin/students");
    appendConversationTurn(state, "ช่วยหาสมชาย", {
      kind: "students",
      heading: "ค้นหานักเรียน",
      message: "พบสมชาย",
    });
    await writeConversationSession(db as never, owner, state);

    expect(await readConversationSession(db as never, owner)).toMatchObject({
      locale: "th",
      currentPath: "/admin/students",
    });
    expect(
      await readConversationSession(db as never, {
        ...owner,
        sessionHash: "another-session",
      }),
    ).toBeNull();

    await clearConversationSession(db as never, owner);
    expect(await readConversationSession(db as never, owner)).toBeNull();
  });
});

describe("Admin Auggie application daily usage", () => {
  it("uses provider token counts and keeps mathematically correct scoped totals", async () => {
    const db = new MemoryDb();
    const usageOwner = { accountId: "admin-one", selectedDojoId: "dojo-rsk" };
    const now = new Date("2026-08-11T05:00:00.000Z");
    const first = tokenUsageFromAiOutput({
      usage: { prompt_tokens: 80, completion_tokens: 20, total_tokens: 100 },
    });
    const second = tokenUsageFromAiOutput({
      usage: { input_tokens: 30, output_tokens: 10 },
    });
    await recordAdminAuggieUsage(db as never, usageOwner, first, now);
    await recordAdminAuggieUsage(db as never, usageOwner, second, now);

    const summary = await getAdminAuggieUsageSummary(
      db as never,
      usageOwner,
      1_000,
      now,
    );
    expect(summary).toMatchObject({
      date: "2026-08-11",
      label: "Auggie daily budget",
      inputTokens: 110,
      outputTokens: 30,
      totalTokens: 140,
      remainingTokens: 860,
      calls: 2,
      adminTokens: 140,
      dojoTokens: 140,
      providerQuota: false,
    });
    // Resetting chat memory never deletes this separate daily ledger.
    await clearConversationSession(db as never, owner);
    expect(
      (await getAdminAuggieUsageSummary(db as never, usageOwner, 1_000, now))
        .totalTokens,
    ).toBe(140);
  });

  it("marks missing provider usage instead of inventing token counts or quota", () => {
    expect(tokenUsageFromAiOutput({ response: "ok" })).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      reported: false,
    });
    expect(adminAuggieDailyBudget("250000")).toBe(250_000);
    expect(adminAuggieDailyBudget("not-a-budget")).toBe(100_000);
  });
});
