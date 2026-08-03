import { validateEditableContent } from "./content";
import type { OperationalEnv } from "./observability";
import type { StorageEnv } from "./storage";
import type { D1Database, StudentEnv } from "./studentRecords";

export const EXPECTED_LATEST_MIGRATION =
  "0027_remove_review_notes.sql";
const CONTENT_KEY = "site:editable-content";
const CONTENT_POINTER_KEY = "site:editable-content:published-version";
const EXPECTED_LOCALES = ["en", "th", "ja", "zh-CN"] as const;
const MAX_R2_OBJECTS = 10_000;

export type DiagnosticsEnv = StudentEnv &
  StorageEnv &
  OperationalEnv & {
    ADMIN_PASSWORD_HASH?: string;
  };

type Check = { ok: boolean; detail?: string };

function safeBuildId(env: DiagnosticsEnv) {
  const value = env.BUILD_ID?.trim() || "not-configured";
  return /^[A-Za-z0-9._-]{7,64}$/.test(value) ? value : "not-configured";
}

function safeEnvironment(env: DiagnosticsEnv) {
  return /^(local|preview|production|test)$/.test(env.APP_ENV || "")
    ? env.APP_ENV!
    : "unknown";
}

function configurationCheck(env: DiagnosticsEnv): Check {
  const pbkdf2Verifier =
    /^pbkdf2-sha256:\d+:[A-Za-z0-9_-]{20,}:[A-Za-z0-9_-]{40,}$/;
  const hmacVerifier = /^(?:hmac-sha256:)?[a-f0-9]{64}$/i;
  const primaryConfigured =
    pbkdf2Verifier.test(env.ADMIN_PASSWORD_HASH?.trim() || "") ||
    hmacVerifier.test(env.ADMIN_PASSWORD_HASH?.trim() || "");
  const configured =
    primaryConfigured &&
    (env.SESSION_SECRET?.trim().length || 0) >= 32 &&
    (env.STUDENT_LOOKUP_PEPPER?.trim().length || 0) >= 32 &&
    (env.TURNSTILE_SECRET_KEY?.trim().length || 0) >= 20;
  return {
    ok: configured,
    detail: configured ? "configured" : "required_runtime_secret_missing",
  };
}

async function d1Check(db?: D1Database): Promise<Check> {
  if (!db) return { ok: false, detail: "binding_missing" };
  try {
    const row = await db
      .prepare("SELECT 1 AS available")
      .first<{ available: number }>();
    return { ok: row?.available === 1, detail: "reachable" };
  } catch {
    return { ok: false, detail: "query_failed" };
  }
}

async function migrationCheck(
  db?: D1Database,
): Promise<Check & { latestApplied?: string }> {
  if (!db) return { ok: false, detail: "binding_missing" };
  try {
    const row = await db
      .prepare("SELECT name FROM d1_migrations ORDER BY id DESC LIMIT 1")
      .first<{ name: string }>();
    const latestApplied = typeof row?.name === "string" ? row.name : undefined;
    return {
      ok: latestApplied === EXPECTED_LATEST_MIGRATION,
      detail:
        latestApplied === EXPECTED_LATEST_MIGRATION
          ? "current"
          : "migration_pending",
      latestApplied,
    };
  } catch {
    return { ok: false, detail: "migration_table_unavailable" };
  }
}

async function kvCheck(env: DiagnosticsEnv): Promise<Check> {
  if (!env.CONTENT_KV) return { ok: false, detail: "binding_missing" };
  try {
    await env.CONTENT_KV.get(CONTENT_POINTER_KEY);
    return { ok: true, detail: "reachable" };
  } catch {
    return { ok: false, detail: "read_failed" };
  }
}

async function r2Check(env: DiagnosticsEnv): Promise<Check> {
  if (!env.MEDIA_BUCKET?.head) return { ok: false, detail: "binding_missing" };
  try {
    await env.MEDIA_BUCKET.head("__diagnostics__/binding-check");
    return { ok: true, detail: "reachable" };
  } catch {
    return { ok: false, detail: "head_failed" };
  }
}

async function publishingCheck(db?: D1Database): Promise<Check> {
  if (!db) return { ok: false, detail: "binding_missing" };
  try {
    const row = await db
      .prepare(
        `SELECT COUNT(*) AS problems FROM publish_operations
        WHERE status = 'failed'
           OR (status = 'publishing' AND updated_at < datetime('now', '-15 minutes'))`,
      )
      .first<{ problems: number }>();
    return {
      ok: Number(row?.problems || 0) === 0,
      detail:
        Number(row?.problems || 0) === 0 ? "consistent" : "attention_required",
    };
  } catch {
    return { ok: false, detail: "publish_state_unavailable" };
  }
}

export async function runBindingDiagnostics(env: DiagnosticsEnv) {
  const [d1, kv, r2, migrations, publishing] = await Promise.all([
    d1Check(env.STUDENT_DB),
    kvCheck(env),
    r2Check(env),
    migrationCheck(env.STUDENT_DB),
    publishingCheck(env.STUDENT_DB),
  ]);
  const checks = {
    worker: { ok: true, detail: "reachable" },
    configuration: configurationCheck(env),
    d1,
    kv,
    r2,
    migrations,
    publishing,
  };
  return {
    ok: Object.values(checks).every((check) => check.ok),
    checkedAt: new Date().toISOString(),
    environment: safeEnvironment(env),
    buildId: safeBuildId(env),
    checks,
  };
}

type ObjectMetadataRow = {
  object_key: string;
  required: number;
};

async function objectMetadata(db: D1Database) {
  const result = await db
    .prepare(
      `
    SELECT storage_key AS object_key, 1 AS required FROM media_assets
    UNION ALL SELECT object_key, CASE WHEN purged_at IS NULL THEN 1 ELSE 0 END
      FROM payment_proofs WHERE object_key IS NOT NULL
    UNION ALL SELECT object_key, CASE WHEN status = 'removed' THEN 0 ELSE 1 END
      FROM student_profile_media
    UNION ALL SELECT object_key, published FROM download_assets WHERE object_key IS NOT NULL
  `,
    )
    .all<ObjectMetadataRow>();
  return result.results || [];
}

async function r2ObjectKeys(env: DiagnosticsEnv) {
  if (!env.MEDIA_BUCKET?.list)
    return { keys: new Set<string>(), complete: false };
  const keys = new Set<string>();
  let cursor: string | undefined;
  let complete = true;
  do {
    const page = await env.MEDIA_BUCKET.list({ cursor, limit: 1_000 });
    for (const object of page.objects || []) {
      if (typeof object.key === "string") keys.add(object.key);
      if (keys.size >= MAX_R2_OBJECTS) {
        complete = false;
        return { keys, complete };
      }
    }
    cursor = page.truncated ? page.cursor : undefined;
    if (page.truncated && !cursor) {
      complete = false;
      break;
    }
  } while (cursor);
  return { keys, complete };
}

function uploadKeysFromContent(value: unknown) {
  const keys = new Set<string>();
  const visit = (entry: unknown) => {
    if (typeof entry === "string") {
      const match = entry.match(
        /^\/uploads\/(admin\/[^?#]+|student-profiles\/[^?#]+)$/,
      );
      if (match) keys.add(match[1]);
      return;
    }
    if (Array.isArray(entry)) {
      entry.forEach(visit);
      return;
    }
    if (entry && typeof entry === "object")
      Object.values(entry as Record<string, unknown>).forEach(visit);
  };
  visit(value);
  return keys;
}

async function contentConsistency(env: DiagnosticsEnv, db: D1Database) {
  if (!env.CONTENT_KV)
    return {
      malformed: true,
      kvWithoutD1Revision: false,
      missingTranslations: EXPECTED_LOCALES.length,
      uploadKeys: new Set<string>(),
    };
  let pointer: string | null = null;
  let rawContent: string | null = null;
  let payloadKey = "";
  let operationId = "";
  try {
    pointer = await env.CONTENT_KV.get(CONTENT_POINTER_KEY);
    if (pointer) {
      const parsed = JSON.parse(pointer) as Record<string, unknown>;
      payloadKey =
        typeof parsed.payloadKey === "string" ? parsed.payloadKey : "";
      operationId =
        typeof parsed.operationId === "string" ? parsed.operationId : "";
      if (!/^site:editable-content:version:\d+:[a-f0-9]{16}$/.test(payloadKey))
        throw new Error("invalid_pointer");
      rawContent = await env.CONTENT_KV.get(payloadKey);
    } else {
      rawContent = await env.CONTENT_KV.get(CONTENT_KEY);
    }
    const content = rawContent
      ? validateEditableContent(JSON.parse(rawContent))
      : null;
    const translations = content?.siteSettings?.translations || {};
    const missingTranslations = EXPECTED_LOCALES.filter(
      (locale) => !translations[locale],
    ).length;
    let kvWithoutD1Revision = false;
    if (pointer) {
      const row = await db
        .prepare(
          `SELECT id FROM publish_operations
        WHERE id = ? AND payload_key = ? AND status = 'published' AND stage = 'complete' LIMIT 1`,
        )
        .bind(operationId, payloadKey)
        .first<{ id: string }>();
      kvWithoutD1Revision = !row;
    }
    return {
      malformed: Boolean(rawContent && !content),
      kvWithoutD1Revision,
      missingTranslations,
      uploadKeys: uploadKeysFromContent(content),
    };
  } catch {
    return {
      malformed: true,
      kvWithoutD1Revision: Boolean(pointer),
      missingTranslations: EXPECTED_LOCALES.length,
      uploadKeys: new Set<string>(),
    };
  }
}

async function relationalCounts(db: D1Database) {
  const row = await db
    .prepare(
      `SELECT
    (SELECT COUNT(*) FROM pragma_foreign_key_check) AS foreign_key_violations,
    (SELECT COUNT(*) FROM (
      SELECT public_student_id FROM students GROUP BY UPPER(public_student_id) HAVING COUNT(*) > 1
    ))
      + (SELECT COUNT(*) FROM student_id_aliases a JOIN students s ON UPPER(s.public_student_id) = UPPER(a.alias_public_student_id))
      AS duplicate_identifiers,
    (SELECT COUNT(*) FROM training_hour_requests r LEFT JOIN students s ON s.id = r.student_id WHERE s.id IS NULL)
      + (SELECT COUNT(*) FROM examination_applications a LEFT JOIN students s ON s.id = a.student_id WHERE s.id IS NULL)
      + (SELECT COUNT(*) FROM payment_request_items i LEFT JOIN payment_requests r ON r.id = i.payment_request_id WHERE r.id IS NULL)
      AS orphan_requests,
    (SELECT COUNT(*) FROM students s LEFT JOIN dojos d ON d.id = s.dojo_id WHERE s.dojo_id IS NULL OR d.id IS NULL)
      + (SELECT COUNT(*) FROM admin_account_dojos m LEFT JOIN admin_accounts a ON a.id = m.account_id LEFT JOIN dojos d ON d.id = m.dojo_id WHERE a.id IS NULL OR d.id IS NULL)
      AS invalid_memberships,
    (SELECT COUNT(*) FROM payment_proofs
      WHERE (status <> 'awaiting_upload' AND object_key IS NULL)
         OR (object_key IS NOT NULL AND (content_type IS NULL OR file_size IS NULL OR submitted_at IS NULL)))
      AS payment_proof_metadata_gaps,
    (SELECT COUNT(*) FROM publish_operations WHERE status = 'failed') AS failed_publishes,
    (SELECT COUNT(*) FROM publish_operations WHERE status = 'publishing' AND updated_at < datetime('now', '-15 minutes')) AS stuck_publishes
  `,
    )
    .first<Record<string, number>>();
  return row || {};
}

export async function runReadOnlyConsistencyAudit(env: DiagnosticsEnv) {
  if (!env.STUDENT_DB)
    return {
      ok: false,
      mode: "read-only" as const,
      error: "database_binding_unavailable",
    };

  try {
    const [metadata, inventory, content, counts] = await Promise.all([
      objectMetadata(env.STUDENT_DB),
      r2ObjectKeys(env),
      contentConsistency(env, env.STUDENT_DB),
      relationalCounts(env.STUDENT_DB),
    ]);
    const authoritative = new Set(metadata.map((row) => row.object_key));
    const required = new Set(
      metadata
        .filter((row) => Number(row.required) === 1)
        .map((row) => row.object_key),
    );
    const referenced = new Set([...authoritative, ...content.uploadKeys]);
    const missingR2Objects = [...required].filter(
      (key) => !inventory.keys.has(key),
    ).length;
    const contentObjectsWithoutMetadata = [...content.uploadKeys].filter(
      (key) => !authoritative.has(key),
    ).length;
    const orphanR2Objects = inventory.complete
      ? [...inventory.keys].filter((key) => !referenced.has(key)).length
      : null;
    const metrics = {
      missingR2Objects,
      orphanR2Objects,
      contentObjectsWithoutMetadata,
      kvWithoutD1Revision: content.kvWithoutD1Revision ? 1 : 0,
      malformedKvContent: content.malformed ? 1 : 0,
      missingTranslations: content.missingTranslations,
      foreignKeyViolations: Number(counts.foreign_key_violations || 0),
      duplicateIdentifiers: Number(counts.duplicate_identifiers || 0),
      orphanRequests: Number(counts.orphan_requests || 0),
      invalidMemberships: Number(counts.invalid_memberships || 0),
      paymentProofMetadataGaps: Number(counts.payment_proof_metadata_gaps || 0),
      failedPublishes: Number(counts.failed_publishes || 0),
      stuckPublishes: Number(counts.stuck_publishes || 0),
    };
    const numericProblems = Object.values(metrics).filter(
      (value): value is number => typeof value === "number",
    );
    return {
      ok: inventory.complete && numericProblems.every((value) => value === 0),
      mode: "read-only" as const,
      checkedAt: new Date().toISOString(),
      r2ScanComplete: inventory.complete,
      metrics,
      repairAvailable: false,
    };
  } catch {
    return {
      ok: false,
      mode: "read-only" as const,
      error: "audit_unavailable",
    };
  }
}
