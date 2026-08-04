import type { AdminSession } from "./auth";
import type { EditableContent } from "./content";
import {
  activateEditableContentVersion,
  writeEditableContentVersion,
  type StorageEnv,
} from "./storage";
import {
  adminAuditMetadata,
  auditStatement,
  requestIdentifier,
  sha256Hex,
  type D1Database,
} from "./studentRecords";
import { consumeRateLimit } from "./rateLimit";
import { operationalEvent, type OperationalEnv } from "./observability";

type PublishRow = {
  id: string;
  revision_number: number;
  status: "draft" | "publishing" | "published" | "failed" | "superseded";
  stage: string;
  payload_key: string;
  payload_sha256: string;
};

export class RecoverablePublishError extends Error {
  constructor(
    public operationId: string,
    public stage: string,
  ) {
    super(
      `Publishing was interrupted at ${stage}. The reserved operation can be reconciled safely without duplicating the revision.`,
    );
  }
}

async function reserveOperation(
  db: D1Database,
  input: {
    idempotencyKey: string;
    payloadSha256: string;
    session: AdminSession;
    sourceRevisionId: string | null;
    now: string;
  },
) {
  const existing = await db
    .prepare(
      `SELECT id, revision_number, status, stage, payload_key, payload_sha256
    FROM publish_operations WHERE idempotency_key = ? LIMIT 1`,
    )
    .bind(input.idempotencyKey)
    .first<PublishRow>();
  if (existing) {
    if (existing.payload_sha256 !== input.payloadSha256)
      throw new Error(
        "The idempotency key was already used for different content.",
      );
    return existing;
  }
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const next = await db
      .prepare(
        `SELECT MAX(value) + 1 AS next_number FROM (
      SELECT COALESCE(MAX(revision_number), 0) AS value FROM site_revisions
      UNION ALL SELECT COALESCE(MAX(revision_number), 0) FROM publish_operations
    )`,
      )
      .first<{ next_number: number }>();
    const revisionNumber = Number(next?.next_number || 1);
    const id = crypto.randomUUID();
    const payloadKey = `site:editable-content:version:${revisionNumber}:${input.payloadSha256.slice(0, 16)}`;
    try {
      await db
        .prepare(
          `INSERT INTO publish_operations
        (id, idempotency_key, revision_number, status, stage, payload_key, payload_sha256,
         source_revision_id, requested_by_account_id, requested_by_name, created_at, updated_at)
        VALUES (?, ?, ?, 'publishing', 'reserved', ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          input.idempotencyKey,
          revisionNumber,
          payloadKey,
          input.payloadSha256,
          input.sourceRevisionId,
          input.session.accountId,
          input.session.adminName,
          input.now,
          input.now,
        )
        .run();
      return {
        id,
        revision_number: revisionNumber,
        status: "publishing" as const,
        stage: "reserved",
        payload_key: payloadKey,
        payload_sha256: input.payloadSha256,
      };
    } catch (error) {
      if (
        attempt === 3 ||
        !String(error).toLocaleLowerCase("en-US").includes("unique")
      )
        throw error;
    }
  }
  throw new Error("A unique publish revision could not be reserved.");
}

async function markFailed(db: D1Database, operationId: string, stage: string) {
  await db
    .prepare(
      `UPDATE publish_operations SET status = 'failed', stage = ?, error_code = ?,
    attempt_count = attempt_count + 1, updated_at = ? WHERE id = ?`,
    )
    .bind(stage, stage, new Date().toISOString(), operationId)
    .run();
}

export async function publishEditableContent(input: {
  env: StorageEnv &
    OperationalEnv & {
      SESSION_SECRET?: string;
      STUDENT_LOOKUP_PEPPER?: string;
    };
  db: D1Database;
  request: Request;
  session: AdminSession;
  content: EditableContent;
  action: string;
  source: string;
  note?: string;
  sourceRevisionId?: string | null;
}) {
  const allowed = await consumeRateLimit(
    input.request,
    { ...input.env, STUDENT_DB: input.db },
    {
      endpoint: "content-publishing",
      subject: input.session.accountId,
      limit: 30,
      windowSeconds: 5 * 60,
      lockSeconds: 5 * 60,
    },
  );
  if (!allowed)
    throw new Error(
      "Publishing is temporarily rate limited. Wait and retry with the same saved draft.",
    );
  const serialized = JSON.stringify(input.content);
  if (serialized.length > 900_000)
    throw new Error("Published content exceeds the 900 KB safety limit.");
  const payloadSha256 = await sha256Hex(serialized);
  const requestId = requestIdentifier(input.request);
  const idempotencyKey = `${input.action}:${requestId}`;
  const now = new Date().toISOString();
  const operation = await reserveOperation(input.db, {
    idempotencyKey,
    payloadSha256,
    session: input.session,
    sourceRevisionId: input.sourceRevisionId || null,
    now,
  });
  try {
    await writeEditableContentVersion(
      input.env,
      operation.payload_key,
      serialized,
      input.content,
    );
    await input.db
      .prepare(
        "UPDATE publish_operations SET status = 'publishing', stage = 'kv_version_written', error_code = NULL, updated_at = ? WHERE id = ?",
      )
      .bind(new Date().toISOString(), operation.id)
      .run();
  } catch {
    operationalEvent("error", "publish_version_write_failed", "kv_failure", {
      request: input.request,
      env: input.env,
      status: 503,
      adminAccountId: input.session.accountId,
      dojoScope: input.session.selectedDojoId,
    });
    await markFailed(input.db, operation.id, "kv_version_write");
    throw new RecoverablePublishError(operation.id, "versioned storage write");
  }

  try {
    const revision = await input.db
      .prepare(
        "SELECT id FROM site_revisions WHERE revision_number = ? LIMIT 1",
      )
      .bind(operation.revision_number)
      .first<{ id: string }>();
    if (!revision) {
      const revisionId = crypto.randomUUID();
      await input.db.batch([
        input.db
          .prepare(
            `INSERT INTO site_revisions
          (id, revision_number, content_json, published_by, published_at, source_revision_id, note)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            revisionId,
            operation.revision_number,
            serialized,
            input.session.adminName,
            now,
            input.sourceRevisionId || null,
            (input.note || "").slice(0, 500),
          ),
        input.db
          .prepare(
            `INSERT INTO site_content_drafts (id, content_json, updated_by, updated_at)
          VALUES ('current', ?, ?, ?) ON CONFLICT(id) DO UPDATE SET content_json = excluded.content_json,
          updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
          )
          .bind(serialized, input.session.adminName, now),
        auditStatement(input.db, {
          actorType: "administrator",
          ...adminAuditMetadata(input.session, input.request),
          action: input.action,
          entityType: "site_revision",
          entityId: revisionId,
          previousValues: input.sourceRevisionId
            ? { sourceRevisionId: input.sourceRevisionId }
            : null,
          newValues: {
            operationId: operation.id,
            revisionNumber: operation.revision_number,
            payloadSha256,
            pageCount: input.content.sitePages.length,
          },
          source: input.source,
          requestId,
          summary:
            input.note || `Published revision ${operation.revision_number}`,
          createdAt: now,
        }),
        input.db
          .prepare(
            `UPDATE publish_operations SET status = 'published', stage = 'd1_confirmed',
          error_code = NULL, published_at = ?, updated_at = ? WHERE id = ? AND payload_sha256 = ?`,
          )
          .bind(now, now, operation.id, payloadSha256),
      ]);
    } else {
      await input.db
        .prepare(
          `UPDATE publish_operations SET status = 'published', stage = 'd1_confirmed',
        error_code = NULL, published_at = COALESCE(published_at, ?), updated_at = ? WHERE id = ?`,
        )
        .bind(now, now, operation.id)
        .run();
    }
  } catch {
    operationalEvent(
      "error",
      "publish_database_confirmation_failed",
      "database_failure",
      {
        request: input.request,
        env: input.env,
        status: 503,
        adminAccountId: input.session.accountId,
        dojoScope: input.session.selectedDojoId,
      },
    );
    await markFailed(input.db, operation.id, "d1_confirmation");
    throw new RecoverablePublishError(operation.id, "database confirmation");
  }

  try {
    await activateEditableContentVersion(
      input.env,
      operation.payload_key,
      operation.id,
    );
    await input.db
      .prepare(
        "UPDATE publish_operations SET status = 'published', stage = 'complete', updated_at = ? WHERE id = ?",
      )
      .bind(new Date().toISOString(), operation.id)
      .run();
  } catch {
    operationalEvent(
      "error",
      "publish_pointer_activation_failed",
      "kv_failure",
      {
        request: input.request,
        env: input.env,
        status: 503,
        adminAccountId: input.session.accountId,
        dojoScope: input.session.selectedDojoId,
      },
    );
    await markFailed(input.db, operation.id, "pointer_activation");
    throw new RecoverablePublishError(
      operation.id,
      "public version activation",
    );
  }
  return {
    operationId: operation.id,
    revisionNumber: operation.revision_number,
    payloadSha256,
  };
}

export async function reconcileEditableContentPublish(input: {
  env: StorageEnv;
  db: D1Database;
  operationId: string;
}) {
  const operation = await input.db
    .prepare(
      `SELECT id, revision_number, status, stage, payload_key, payload_sha256
    FROM publish_operations WHERE id = ? LIMIT 1`,
    )
    .bind(input.operationId)
    .first<PublishRow>();
  if (!operation) throw new Error("Publish operation not found.");
  const revision = await input.db
    .prepare("SELECT id FROM site_revisions WHERE revision_number = ? LIMIT 1")
    .bind(operation.revision_number)
    .first<{ id: string }>();
  if (!revision)
    throw new Error(
      "The operation has no confirmed database revision and must be retried from its original request.",
    );
  await input.db
    .prepare(
      "UPDATE publish_operations SET status = 'published', stage = 'd1_confirmed', error_code = NULL, updated_at = ? WHERE id = ?",
    )
    .bind(new Date().toISOString(), operation.id)
    .run();
  await activateEditableContentVersion(
    input.env,
    operation.payload_key,
    operation.id,
  );
  await input.db
    .prepare(
      "UPDATE publish_operations SET status = 'published', stage = 'complete', updated_at = ? WHERE id = ?",
    )
    .bind(new Date().toISOString(), operation.id)
    .run();
  return operation;
}
