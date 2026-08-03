import {
  clearRateLimit,
  consumeRateLimit,
  isRateLimitAllowed,
} from "./rateLimit";

const COOKIE_NAME = "rsk_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
export const RENSHINKAN_DOJO_ID = "dojo-rsk";

type AuthEnv = {
  ADMIN_PASSWORD_HASH?: string;
  DOJO_ADMIN_PASSWORD_HASHES?: string;
  SESSION_SECRET?: string;
  STUDENT_LOOKUP_PEPPER?: string;
  STUDENT_DB?: {
    prepare(query: string): {
      bind(...values: unknown[]): {
        first<T>(): Promise<T | null>;
        run(): Promise<unknown>;
      };
    };
  };
};

export type AdminRole = "central" | "dojo";
export type AdminPermissionLevel = "renshinkan_super_admin" | "dojo_admin";

export type AdminSession = {
  sub: "admin";
  iat: number;
  exp: number;
  sessionId: string;
  accountId: string;
  adminName: string;
  role: AdminRole;
  allowedDojoIds: string[];
  selectedDojoId: string | null;
};

export function jsonResponse(
  data: unknown,
  status = 200,
  headers: HeadersInit = {},
) {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Content-Type", "application/json; charset=utf-8");
  if (!responseHeaders.has("Cache-Control"))
    responseHeaders.set("Cache-Control", "private, no-store");
  return new Response(JSON.stringify(data), {
    status,
    headers: responseHeaders,
  });
}

export function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("Origin");
  const referer = request.headers.get("Referer");
  const fetchSite = request.headers.get("Sec-Fetch-Site");

  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return false;
  }

  try {
    const expectedOrigin = new URL(request.url).origin;
    if (origin) return new URL(origin).origin === expectedOrigin;
    if (referer) return new URL(referer).origin === expectedOrigin;
    // Non-browser clients may omit Fetch Metadata and origin headers. Admin
    // mutations still require a signed SameSite cookie, while browsers are
    // rejected above whenever they identify a cross-site request.
    return true;
  } catch {
    return false;
  }
}

function isConfigured(value: string | undefined) {
  return Boolean(value && !value.startsWith("PLACEHOLDER"));
}

function textToBytes(value: string) {
  return new TextEncoder().encode(value);
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array) {
  if (a.byteLength !== b.byteLength) return false;
  const subtle = crypto.subtle as SubtleCrypto & {
    timingSafeEqual?: (
      left: ArrayBufferView,
      right: ArrayBufferView,
    ) => boolean;
  };
  if (typeof subtle.timingSafeEqual === "function") {
    try {
      return subtle.timingSafeEqual(a, b);
    } catch {
      // Some Workers compatibility dates expose the extension but reject a
      // typed-array view. The fixed-size digest fallback below is also
      // constant-time and is shared with the Node-based test runtime.
    }
  }

  // Node's Web Crypto used by the unit tests does not yet expose the Workers
  // timingSafeEqual extension. Both inputs are fixed-size digests here.
  let result = 0;
  for (let index = 0; index < a.byteLength; index += 1)
    result |= a[index] ^ b[index];
  return result === 0;
}

async function timingSafeEqual(a: string, b: string) {
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", textToBytes(a)),
    crypto.subtle.digest("SHA-256", textToBytes(b)),
  ]);
  return timingSafeEqualBytes(new Uint8Array(left), new Uint8Array(right));
}

async function hmacSha256(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    textToBytes(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, textToBytes(value));

  return new Uint8Array(signature);
}

async function hmacSha256Hex(secret: string, value: string) {
  const bytes = await hmacSha256(secret, value);

  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function allowAdminLoginAttempt(request: Request, env: AuthEnv) {
  return isRateLimitAllowed(request, env, {
    endpoint: "admin-login",
    limit: 8,
    windowSeconds: 15 * 60,
    lockSeconds: 15 * 60,
  });
}

export async function recordFailedAdminLoginAttempt(
  request: Request,
  env: AuthEnv,
) {
  const rule = {
    endpoint: "admin-login",
    limit: 8,
    windowSeconds: 15 * 60,
    lockSeconds: 15 * 60,
  };
  const accepted = await consumeRateLimit(request, env, rule);
  if (!accepted) return false;
  return isRateLimitAllowed(request, env, rule);
}

export async function clearAdminLoginAttempts(request: Request, env: AuthEnv) {
  await clearRateLimit(request, env, "admin-login");
}

const MIN_PBKDF2_ITERATIONS = 210_000;

async function verifyStoredPassword(
  password: string,
  stored: string,
  env: AuthEnv,
  allowLegacyHmac: boolean,
) {
  const value = stored.trim();
  const match = value.match(
    /^pbkdf2-sha256:(\d+):([A-Za-z0-9_-]{20,}):([A-Za-z0-9_-]{40,})$/i,
  );
  if (match) {
    const iterations = Number(match[1]);
    if (
      !Number.isSafeInteger(iterations) ||
      iterations < MIN_PBKDF2_ITERATIONS ||
      iterations > 2_000_000
    )
      return false;
    let salt: Uint8Array;
    let expected: Uint8Array;
    try {
      salt = base64UrlToBytes(match[2]);
      expected = base64UrlToBytes(match[3]);
    } catch {
      return false;
    }
    if (salt.byteLength < 16 || expected.byteLength !== 32) return false;
    try {
      const key = await crypto.subtle.importKey(
        "raw",
        textToBytes(password),
        { name: "PBKDF2" },
        false,
        ["deriveBits"],
      );
      const derived = await crypto.subtle.deriveBits(
        { name: "PBKDF2", hash: { name: "SHA-256" }, salt, iterations },
        key,
        256,
      );
      return timingSafeEqualBytes(new Uint8Array(derived), expected);
    } catch (error) {
      const errorName =
        typeof error === "object" && error !== null && "name" in error
          ? String(error.name)
          : "";
      if (errorName !== "NotSupportedError") throw error;
      try {
        const key = await crypto.subtle.importKey(
          "raw",
          textToBytes(password),
          { name: "PBKDF2" },
          false,
          ["deriveKey"],
        );
        const derivedKey = await crypto.subtle.deriveKey(
          { name: "PBKDF2", hash: { name: "SHA-256" }, salt, iterations },
          key,
          { name: "HMAC", hash: { name: "SHA-256" }, length: 256 },
          true,
          ["sign"],
        );
        const derived = await crypto.subtle.exportKey("raw", derivedKey);
        return timingSafeEqualBytes(new Uint8Array(derived), expected);
      } catch (deriveKeyError) {
        const deriveKeyErrorName =
          typeof deriveKeyError === "object" &&
          deriveKeyError !== null &&
          "name" in deriveKeyError
            ? String(deriveKeyError.name)
            : "";
        if (deriveKeyErrorName !== "NotSupportedError") throw deriveKeyError;
      }
      throw error;
    }
  }

  // Temporary compatibility for existing primary/dojo HMAC hashes. New and
  // rotated credentials must use PBKDF2.
  if (!allowLegacyHmac || !isConfigured(env.SESSION_SECRET)) return false;
  const expected = value.replace(/^hmac-sha256:/i, "");
  if (!/^[a-f0-9]{64}$/i.test(expected)) return false;
  return timingSafeEqual(
    await hmacSha256Hex(env.SESSION_SECRET!, password),
    expected,
  );
}

export async function verifyAdminPassword(password: string, env: AuthEnv) {
  if (!isConfigured(env.ADMIN_PASSWORD_HASH)) return false;
  return verifyStoredPassword(password, env.ADMIN_PASSWORD_HASH!, env, true);
}

function configuredDojoPasswordHashes(env: AuthEnv) {
  if (!isConfigured(env.DOJO_ADMIN_PASSWORD_HASHES))
    return new Map<string, string>();
  try {
    const parsed = JSON.parse(env.DOJO_ADMIN_PASSWORD_HASHES!) as Record<
      string,
      unknown
    >;
    return new Map(
      Object.entries(parsed)
        .filter(
          (entry): entry is [string, string] =>
            /^dojo-[a-z0-9-]+$/.test(entry[0]) && typeof entry[1] === "string",
        )
        .map(([dojoId, hash]) => [dojoId, hash.trim()]),
    );
  } catch {
    return new Map<string, string>();
  }
}

export async function authenticateAdminPassword(
  password: string,
  env: AuthEnv,
) {
  if (await verifyAdminPassword(password, env)) {
    return {
      role: "central" as const,
      allowedDojoIds: [],
      accountId: "legacy-central",
      credentialId: "env:central",
      displayName: "Central administrator",
    };
  }
  for (const [dojoId, expectedHash] of configuredDojoPasswordHashes(env)) {
    if (await verifyStoredPassword(password, expectedHash, env, true)) {
      return {
        role: "dojo" as const,
        allowedDojoIds: [dojoId],
        accountId: `legacy-${dojoId}`,
        credentialId: `env:${dojoId}`,
        displayName: "Dojo administrator",
      };
    }
  }
  return null;
}

type NewSession = Partial<
  Pick<
    AdminSession,
    | "sessionId"
    | "accountId"
    | "adminName"
    | "role"
    | "allowedDojoIds"
    | "selectedDojoId"
  >
>;

export async function createSessionCookie(
  env: AuthEnv,
  session: NewSession = {},
) {
  if (!isConfigured(env.SESSION_SECRET)) {
    throw new Error("SESSION_SECRET is not configured");
  }

  const now = Math.floor(Date.now() / 1000);
  const payload: AdminSession = {
    sub: "admin",
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
    sessionId: session.sessionId || crypto.randomUUID(),
    accountId: (session.accountId || "legacy-central").slice(0, 120),
    adminName: (session.adminName || "Administrator")
      .normalize("NFKC")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 120),
    role: session.role === "dojo" ? "dojo" : "central",
    allowedDojoIds:
      session.role === "dojo"
        ? Array.from(new Set(session.allowedDojoIds || [])).slice(0, 3)
        : [],
    selectedDojoId: session.selectedDojoId || null,
  };
  const encodedPayload = bytesToBase64Url(textToBytes(JSON.stringify(payload)));
  const encodedSignature = bytesToBase64Url(
    await hmacSha256(env.SESSION_SECRET!, encodedPayload),
  );
  const token = `${encodedPayload}.${encodedSignature}`;

  return `${COOKIE_NAME}=${token}; Max-Age=${SESSION_TTL_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

function getCookie(request: Request, name: string) {
  const cookieHeader = request.headers.get("Cookie") ?? "";
  const cookies = cookieHeader.split(";").map((cookie) => cookie.trim());
  const prefix = `${name}=`;
  const match = cookies.find((cookie) => cookie.startsWith(prefix));

  return match ? decodeURIComponent(match.slice(prefix.length)) : "";
}

export async function getAdminSession(
  request: Request,
  env: AuthEnv,
): Promise<AdminSession | null> {
  if (!isConfigured(env.SESSION_SECRET)) {
    return null;
  }

  const token = getCookie(request, COOKIE_NAME);
  const [encodedPayload, encodedSignature] = token.split(".");

  if (!encodedPayload || !encodedSignature) {
    return null;
  }

  const expectedSignature = bytesToBase64Url(
    await hmacSha256(env.SESSION_SECRET!, encodedPayload),
  );

  if (!(await timingSafeEqual(encodedSignature, expectedSignature))) {
    return null;
  }

  try {
    const payloadJson = new TextDecoder().decode(
      base64UrlToBytes(encodedPayload),
    );
    const payload = JSON.parse(payloadJson) as Partial<AdminSession>;
    if (
      payload.sub !== "admin" ||
      typeof payload.exp !== "number" ||
      payload.exp <= Math.floor(Date.now() / 1000) ||
      (payload.role !== "central" && payload.role !== "dojo") ||
      typeof payload.sessionId !== "string" ||
      typeof payload.adminName !== "string" ||
      !payload.adminName.trim()
    )
      return null;
    const role = payload.role;
    const allowedDojoIds =
      role === "dojo" && Array.isArray(payload.allowedDojoIds)
        ? payload.allowedDojoIds
            .filter(
              (value): value is string =>
                typeof value === "string" && /^dojo-[a-z0-9-]+$/.test(value),
            )
            .slice(0, 3)
        : [];
    if (role === "dojo" && allowedDojoIds.length === 0) return null;
    const result: AdminSession = {
      sub: "admin",
      iat: typeof payload.iat === "number" ? payload.iat : 0,
      exp: payload.exp,
      sessionId: payload.sessionId.slice(0, 120),
      accountId:
        typeof payload.accountId === "string" && payload.accountId.trim()
          ? payload.accountId.trim().slice(0, 120)
          : `legacy-${role}`,
      adminName: payload.adminName.trim().slice(0, 120),
      role,
      allowedDojoIds,
      selectedDojoId:
        typeof payload.selectedDojoId === "string"
          ? payload.selectedDojoId
          : null,
    };
    if (
      !/^[A-Za-z0-9-]{8,120}$/.test(result.sessionId) ||
      !/^[A-Za-z0-9:_-]{3,120}$/.test(result.accountId)
    )
      return null;
    if (env.STUDENT_DB) {
      const [revoked, account] = await Promise.all([
        env.STUDENT_DB.prepare(
          `SELECT session_id FROM revoked_admin_sessions
          WHERE session_id = ? AND expires_at > ? LIMIT 1`,
        )
          .bind(result.sessionId, new Date().toISOString())
          .first<{ session_id: string }>(),
        env.STUDENT_DB.prepare(
          "SELECT disabled FROM admin_accounts WHERE id = ? LIMIT 1",
        )
          .bind(result.accountId)
          .first<{ disabled: number }>(),
      ]);
      if (revoked) return null;
      if (account?.disabled === 1) return null;
    }
    return result;
  } catch {
    return null;
  }
}

export async function hasValidAdminSession(request: Request, env: AuthEnv) {
  return Boolean(await getAdminSession(request, env));
}

export function canSelectDojo(
  session: AdminSession,
  dojoId: string | null | undefined,
) {
  if (!dojoId) return false;
  if (session.role === "central") return true;
  return (
    dojoId !== RENSHINKAN_DOJO_ID && session.allowedDojoIds.includes(dojoId)
  );
}

export function isRenShinKanSuperAdmin(
  session: AdminSession | null | undefined,
) {
  return Boolean(
    session &&
    session.role === "central" &&
    session.selectedDojoId === RENSHINKAN_DOJO_ID,
  );
}

export function effectivePermissionLevel(
  session: AdminSession,
): AdminPermissionLevel {
  return isRenShinKanSuperAdmin(session)
    ? "renshinkan_super_admin"
    : "dojo_admin";
}

export function hasSelectedDojoAccess(
  session: AdminSession | null | undefined,
): session is AdminSession {
  if (
    !session?.selectedDojoId ||
    !canSelectDojo(session, session.selectedDojoId)
  )
    return false;
  return true;
}

export async function getAuthorizedAdminSession(
  request: Request,
  env: AuthEnv,
) {
  const session = await getAdminSession(request, env);
  return hasSelectedDojoAccess(session) ? session : null;
}

export function canAccessDojo(
  session: AdminSession,
  dojoId: string | null | undefined,
) {
  if (!dojoId || !hasSelectedDojoAccess(session)) return false;
  return isRenShinKanSuperAdmin(session) || dojoId === session.selectedDojoId;
}

export function requiresCentralAdmin(session: AdminSession | null) {
  return isRenShinKanSuperAdmin(session);
}

export async function revokeAdminSession(
  env: AuthEnv,
  session: AdminSession,
  revokedBy: string,
  reason: string,
) {
  if (!env.STUDENT_DB) return;
  await env.STUDENT_DB.prepare(
    `INSERT INTO revoked_admin_sessions
    (session_id, expires_at, revoked_at, revoked_by, reason) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET revoked_at = excluded.revoked_at, revoked_by = excluded.revoked_by, reason = excluded.reason`,
  )
    .bind(
      session.sessionId,
      new Date(session.exp * 1000).toISOString(),
      new Date().toISOString(),
      revokedBy.slice(0, 120),
      reason.slice(0, 200),
    )
    .run();
}

export async function updateSelectedDojoCookie(
  env: AuthEnv,
  session: AdminSession,
  selectedDojoId: string | null,
) {
  await revokeAdminSession(
    env,
    session,
    session.adminName,
    "dojo_context_changed",
  );
  return createSessionCookie(env, {
    accountId: session.accountId,
    adminName: session.adminName,
    role: session.role,
    allowedDojoIds: session.allowedDojoIds,
    selectedDojoId,
  });
}
