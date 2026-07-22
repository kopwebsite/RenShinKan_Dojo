import { auditStatement, type D1Database } from "./studentRecords";

export const AUDIT_RETENTION_DAYS = 90;
const DEFAULT_BATCH_SIZE = 500;
const DEFAULT_MAX_BATCHES = 50;

export type AuditCleanupResult = {
  cutoff: string;
  deleted: number;
  batches: number;
  expiredSessionsDeleted: number;
  completed: boolean;
};

export async function cleanExpiredAuditRecords(
  db: D1Database,
  options: { now?: Date; batchSize?: number; maxBatches?: number; source?: string; actorIdentifier?: string; requestId?: string } = {},
): Promise<AuditCleanupResult> {
  const now = options.now || new Date();
  const cutoff = new Date(now.getTime() - AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const batchSize = Math.min(1_000, Math.max(10, Math.trunc(options.batchSize || DEFAULT_BATCH_SIZE)));
  const maxBatches = Math.min(100, Math.max(1, Math.trunc(options.maxBatches || DEFAULT_MAX_BATCHES)));
  let deleted = 0;
  let batches = 0;
  let lastChanges = 0;

  do {
    const result = await db.prepare(`DELETE FROM audit_log WHERE id IN (
      SELECT id FROM audit_log WHERE created_at < ? ORDER BY created_at ASC, id ASC LIMIT ?
    )`).bind(cutoff, batchSize).run();
    lastChanges = Number(result.meta?.changes || 0);
    deleted += lastChanges;
    batches += 1;
  } while (lastChanges === batchSize && batches < maxBatches);

  const expiredSessions = await db.prepare("DELETE FROM revoked_admin_sessions WHERE expires_at <= ?")
    .bind(now.toISOString()).run();
  const expiredSessionsDeleted = Number(expiredSessions.meta?.changes || 0);
  const completed = lastChanges < batchSize;
  const requestId = options.requestId || crypto.randomUUID();
  await auditStatement(db, {
    actorType: "system",
    actorIdentifier: options.actorIdentifier || "audit_retention_worker",
    action: "audit_retention_cleanup",
    entityType: "audit_log",
    entityId: requestId,
    source: options.source || "scheduled_audit_cleanup",
    requestId,
    newValues: { cutoff, deleted, batches, batchSize, expiredSessionsDeleted, completed },
    summary: `Audit retention cleanup removed ${deleted} record${deleted === 1 ? "" : "s"} older than ${AUDIT_RETENTION_DAYS} days`,
    createdAt: now.toISOString(),
  }).run();

  return { cutoff, deleted, batches, expiredSessionsDeleted, completed };
}
