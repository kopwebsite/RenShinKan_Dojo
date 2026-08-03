import { trustedClientIp } from "./requestIdentity";

type Statement = {
  bind(...values: unknown[]): Statement;
  first<T>(): Promise<T | null>;
  run(): Promise<unknown>;
};
type RateLimitEnv = {
  STUDENT_DB?: { prepare(query: string): Statement };
  SESSION_SECRET?: string;
  STUDENT_LOOKUP_PEPPER?: string;
};

export type RateLimitRule = {
  endpoint: string;
  subject?: string | null;
  limit: number;
  windowSeconds: number;
  lockSeconds: number;
};

type RateLimitRow = {
  window_started_at: string;
  attempts: number;
  locked_until: string | null;
};

const encoder = new TextEncoder();

async function actorHash(
  request: Request,
  env: RateLimitEnv,
  rule: RateLimitRule,
) {
  const secret = env.SESSION_SECRET || env.STUDENT_LOOKUP_PEPPER;
  if (!secret) throw new Error("Rate-limit hashing is not configured");
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const identity = `${rule.endpoint}\n${trustedClientIp(request) || "untrusted"}\n${(rule.subject || "anonymous").normalize("NFKC").trim().toLocaleLowerCase("und")}`;
  const bytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(identity)),
  );
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function rateLimitRow(
  request: Request,
  env: RateLimitEnv,
  rule: RateLimitRule,
) {
  if (!env.STUDENT_DB) throw new Error("Rate-limit storage is not configured");
  const keyHash = await actorHash(request, env, rule);
  const row = await env.STUDENT_DB.prepare(
    `SELECT window_started_at, attempts, locked_until
    FROM security_rate_limits WHERE endpoint = ? AND key_hash = ? LIMIT 1`,
  )
    .bind(rule.endpoint, keyHash)
    .first<RateLimitRow>();
  return { keyHash, row };
}

export async function isRateLimitAllowed(
  request: Request,
  env: RateLimitEnv,
  rule: RateLimitRule,
) {
  const { row } = await rateLimitRow(request, env, rule);
  if (!row) return true;
  const now = Date.now();
  if (row.locked_until && Date.parse(row.locked_until) > now) return false;
  if (now - Date.parse(row.window_started_at) >= rule.windowSeconds * 1000)
    return true;
  return Number(row.attempts || 0) < rule.limit;
}

export async function consumeRateLimit(
  request: Request,
  env: RateLimitEnv,
  rule: RateLimitRule,
) {
  if (
    !Number.isSafeInteger(rule.limit) ||
    !Number.isSafeInteger(rule.windowSeconds) ||
    !Number.isSafeInteger(rule.lockSeconds) ||
    rule.limit < 1 ||
    rule.windowSeconds < 1 ||
    rule.lockSeconds < 1
  ) {
    throw new Error("Rate-limit rule is invalid");
  }
  if (!env.STUDENT_DB) throw new Error("Rate-limit storage is not configured");
  const keyHash = await actorHash(request, env, rule);
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const windowCutoff = new Date(now - rule.windowSeconds * 1000).toISOString();
  const lockDeadlines = [1, 2, 4, 8, 16].map((factor) =>
    new Date(
      now + Math.min(rule.lockSeconds * 1000 * factor, 60 * 60 * 1000),
    ).toISOString(),
  );
  const expiresAt = new Date(
    now +
      Math.max(
        rule.windowSeconds * 2,
        Math.min(rule.lockSeconds * 16, 60 * 60) * 2,
      ) *
        1000,
  ).toISOString();
  const row = await env.STUDENT_DB.prepare(
    `INSERT INTO security_rate_limits
      (endpoint, key_hash, window_started_at, attempts, locked_until, expires_at, updated_at)
    VALUES (?, ?, ?, 1, NULL, ?, ?)
    ON CONFLICT(endpoint, key_hash) DO UPDATE SET
      window_started_at = CASE
        WHEN security_rate_limits.locked_until > ? THEN security_rate_limits.window_started_at
        WHEN security_rate_limits.window_started_at <= ? THEN excluded.window_started_at
        ELSE security_rate_limits.window_started_at
      END,
      attempts = CASE
        WHEN security_rate_limits.locked_until > ? THEN security_rate_limits.attempts
        WHEN security_rate_limits.window_started_at <= ? THEN 1
        ELSE security_rate_limits.attempts + 1
      END,
      locked_until = CASE
        WHEN security_rate_limits.locked_until > ? THEN security_rate_limits.locked_until
        WHEN security_rate_limits.window_started_at <= ? THEN NULL
        WHEN security_rate_limits.attempts + 1 <= ? THEN NULL
        WHEN security_rate_limits.attempts + 1 - ? >= 5 THEN ?
        WHEN security_rate_limits.attempts + 1 - ? = 4 THEN ?
        WHEN security_rate_limits.attempts + 1 - ? = 3 THEN ?
        WHEN security_rate_limits.attempts + 1 - ? = 2 THEN ?
        ELSE ?
      END,
      expires_at = excluded.expires_at,
      updated_at = excluded.updated_at
    RETURNING window_started_at, attempts, locked_until`,
  )
    .bind(
      rule.endpoint,
      keyHash,
      nowIso,
      expiresAt,
      nowIso,
      nowIso,
      windowCutoff,
      nowIso,
      windowCutoff,
      nowIso,
      windowCutoff,
      rule.limit,
      rule.limit,
      lockDeadlines[4],
      rule.limit,
      lockDeadlines[3],
      rule.limit,
      lockDeadlines[2],
      rule.limit,
      lockDeadlines[1],
      lockDeadlines[0],
    )
    .first<RateLimitRow>();
  if (!row) throw new Error("Rate-limit update failed");
  if (crypto.getRandomValues(new Uint8Array(1))[0] < 8) {
    await env.STUDENT_DB.prepare(
      "DELETE FROM security_rate_limits WHERE expires_at < ?",
    )
      .bind(nowIso)
      .run();
  }
  return !(row.locked_until && Date.parse(row.locked_until) > now);
}

export async function clearRateLimit(
  request: Request,
  env: RateLimitEnv,
  endpoint: string,
  subject?: string | null,
) {
  if (!env.STUDENT_DB || !(env.SESSION_SECRET || env.STUDENT_LOOKUP_PEPPER))
    return;
  const keyHash = await actorHash(request, env, {
    endpoint,
    subject,
    limit: 1,
    windowSeconds: 1,
    lockSeconds: 1,
  });
  await env.STUDENT_DB.prepare(
    "DELETE FROM security_rate_limits WHERE endpoint = ? AND key_hash = ?",
  )
    .bind(endpoint, keyHash)
    .run();
}
