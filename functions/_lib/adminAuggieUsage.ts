import { bangkokCanonicalDate } from "../../shared/date";
import type { D1Database } from "./studentRecords";

const DEFAULT_DAILY_BUDGET = 100_000;

export type AdminAuggieUsageOwner = {
  accountId: string;
  selectedDojoId: string;
};

export type AdminAuggieTokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reported: boolean;
};

export type AdminAuggieUsageSummary = {
  date: string;
  timeZone: "Asia/Bangkok";
  label: "Auggie daily budget";
  budgetTokens: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  remainingTokens: number;
  calls: number;
  unreportedCalls: number;
  providerQuota: false;
  adminTokens: number;
  dojoTokens: number;
};

type UsageRow = {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  calls: number;
  unreported_calls: number;
};

function safeCount(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.trunc(number) : 0;
}

export function adminAuggieDailyBudget(configured: unknown) {
  const value = Number(configured);
  return Number.isInteger(value) && value >= 1_000 && value <= 100_000_000
    ? value
    : DEFAULT_DAILY_BUDGET;
}

export function tokenUsageFromAiOutput(output: unknown): AdminAuggieTokenUsage {
  const root =
    output && typeof output === "object" && !Array.isArray(output)
      ? (output as Record<string, unknown>)
      : null;
  const usage =
    root?.usage && typeof root.usage === "object" && !Array.isArray(root.usage)
      ? (root.usage as Record<string, unknown>)
      : null;
  const inputTokens = safeCount(usage?.prompt_tokens ?? usage?.input_tokens);
  const outputTokens = safeCount(
    usage?.completion_tokens ?? usage?.output_tokens,
  );
  const reportedTotal = safeCount(usage?.total_tokens);
  const totalTokens = reportedTotal || inputTokens + outputTokens;
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    reported: Boolean(
      usage &&
        ("prompt_tokens" in usage ||
          "input_tokens" in usage ||
          "total_tokens" in usage),
    ),
  };
}

export async function recordAdminAuggieUsage(
  db: D1Database,
  owner: AdminAuggieUsageOwner,
  usage: AdminAuggieTokenUsage,
  now = new Date(),
) {
  const day = bangkokCanonicalDate(now);
  const updatedAt = now.toISOString();
  const scopes: Array<["application" | "admin" | "dojo", string]> = [
    ["application", "application"],
    ["admin", owner.accountId],
    ["dojo", owner.selectedDojoId],
  ];
  await db.batch(
    scopes.map(([scopeType, scopeId]) =>
      db
        .prepare(
          `INSERT INTO admin_ai_daily_usage (
            usage_date, scope_type, scope_id, input_tokens, output_tokens,
            total_tokens, calls, unreported_calls, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
          ON CONFLICT(usage_date, scope_type, scope_id) DO UPDATE SET
            input_tokens = input_tokens + excluded.input_tokens,
            output_tokens = output_tokens + excluded.output_tokens,
            total_tokens = total_tokens + excluded.total_tokens,
            calls = calls + 1,
            unreported_calls = unreported_calls + excluded.unreported_calls,
            updated_at = excluded.updated_at`,
        )
        .bind(
          day,
          scopeType,
          scopeId,
          usage.inputTokens,
          usage.outputTokens,
          usage.totalTokens,
          usage.reported ? 0 : 1,
          updatedAt,
        ),
    ),
  );
}

async function readScope(
  db: D1Database,
  day: string,
  scopeType: "application" | "admin" | "dojo",
  scopeId: string,
) {
  return db
    .prepare(
      `SELECT input_tokens, output_tokens, total_tokens, calls, unreported_calls
      FROM admin_ai_daily_usage
      WHERE usage_date = ? AND scope_type = ? AND scope_id = ? LIMIT 1`,
    )
    .bind(day, scopeType, scopeId)
    .first<UsageRow>();
}

export async function getAdminAuggieUsageSummary(
  db: D1Database,
  owner: AdminAuggieUsageOwner,
  budgetTokens: number,
  now = new Date(),
): Promise<AdminAuggieUsageSummary> {
  const date = bangkokCanonicalDate(now);
  const [application, admin, dojo] = await Promise.all([
    readScope(db, date, "application", "application"),
    readScope(db, date, "admin", owner.accountId),
    readScope(db, date, "dojo", owner.selectedDojoId),
  ]);
  const inputTokens = safeCount(application?.input_tokens);
  const outputTokens = safeCount(application?.output_tokens);
  const totalTokens = safeCount(application?.total_tokens);
  return {
    date,
    timeZone: "Asia/Bangkok",
    label: "Auggie daily budget",
    budgetTokens,
    inputTokens,
    outputTokens,
    totalTokens,
    remainingTokens: Math.max(0, budgetTokens - totalTokens),
    calls: safeCount(application?.calls),
    unreportedCalls: safeCount(application?.unreported_calls),
    providerQuota: false,
    adminTokens: safeCount(admin?.total_tokens),
    dojoTokens: safeCount(dojo?.total_tokens),
  };
}
