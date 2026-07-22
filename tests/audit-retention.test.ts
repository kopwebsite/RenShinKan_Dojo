import { describe, expect, it } from "vitest";
import { AUDIT_RETENTION_DAYS, cleanExpiredAuditRecords } from "../functions/_lib/auditRetention";
import type { D1Database, D1PreparedStatement, D1Result } from "../functions/_lib/studentRecords";

function retentionDb(createdAt: string[]) {
  const records = createdAt.map((value, index) => ({ id: `audit-${index}`, createdAt: value }));
  let expiredSessions = 2;
  const db: D1Database = {
    prepare(query: string) {
      const statement = {
        bind(...values: unknown[]) {
          return {
            ...statement,
            async run(): Promise<D1Result> {
              if (query.includes("DELETE FROM audit_log")) {
                const cutoff = String(values[0]);
                const limit = Number(values[1]);
                const ids = records.filter((record) => record.createdAt < cutoff).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(0, limit).map((record) => record.id);
                for (const id of ids) records.splice(records.findIndex((record) => record.id === id), 1);
                return { success: true, meta: { changes: ids.length } };
              }
              if (query.includes("DELETE FROM revoked_admin_sessions")) {
                const changes = expiredSessions;
                expiredSessions = 0;
                return { success: true, meta: { changes } };
              }
              return { success: true, meta: { changes: 1 } };
            },
          } as D1PreparedStatement;
        },
        async run(): Promise<D1Result> { return { success: true, meta: { changes: 1 } }; },
        async first<T>(): Promise<T | null> { return null; },
        async all<T>(): Promise<D1Result<T>> { return { success: true, results: [] }; },
      } satisfies D1PreparedStatement;
      return statement;
    },
    async batch(): Promise<D1Result[]> { return []; },
  };
  return { db, records };
}

describe("audit retention cleanup", () => {
  it("keeps the exact 90-day boundary and deletes only older records", async () => {
    const now = new Date("2026-07-22T00:00:00.000Z");
    const cutoff = new Date(now.getTime() - AUDIT_RETENTION_DAYS * 86_400_000);
    const { db, records } = retentionDb([
      new Date(cutoff.getTime() - 1).toISOString(),
      cutoff.toISOString(),
      new Date(cutoff.getTime() + 1).toISOString(),
    ]);
    const result = await cleanExpiredAuditRecords(db, { now, batchSize: 10 });
    expect(result).toMatchObject({ deleted: 1, expiredSessionsDeleted: 2, completed: true });
    expect(records.map((record) => record.createdAt)).toEqual([cutoff.toISOString(), new Date(cutoff.getTime() + 1).toISOString()]);
  });

  it("stops at the configured batch bound and reports incomplete work", async () => {
    const now = new Date("2026-07-22T00:00:00.000Z");
    const { db, records } = retentionDb(Array.from({ length: 12 }, (_, index) => `2020-01-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`));
    const result = await cleanExpiredAuditRecords(db, { now, batchSize: 10, maxBatches: 1 });
    expect(result).toMatchObject({ deleted: 10, batches: 1, completed: false });
    expect(records).toHaveLength(2);
  });
});
