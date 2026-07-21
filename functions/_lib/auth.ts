const COOKIE_NAME = "rsk_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
export const RENSHINKAN_DOJO_ID = "dojo-rsk";

type AuthEnv = {
  ADMIN_PASSWORD_HASH?: string;
  DOJO_ADMIN_PASSWORD_HASHES?: string;
  RSK_ADMIN_SECONDARY_PASSWORD?: string;
  SESSION_SECRET?: string;
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
  adminName: string;
  role: AdminRole;
  allowedDojoIds: string[];
  selectedDojoId: string | null;
  renshinkanVerified: boolean;
};

export function jsonResponse(data: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headers,
    },
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

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
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
    timingSafeEqual?: (left: ArrayBufferView, right: ArrayBufferView) => boolean;
  };
  if (typeof subtle.timingSafeEqual === "function") return subtle.timingSafeEqual(a, b);

  // Node's Web Crypto used by the unit tests does not yet expose the Workers
  // timingSafeEqual extension. Both inputs are fixed-size digests here.
  let result = 0;
  for (let index = 0; index < a.byteLength; index += 1) result |= a[index] ^ b[index];
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

  return [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function loginActorHash(request: Request, purpose = "login") {
  const value = `${purpose}:${request.headers.get("CF-Connecting-IP") || "unknown"}:${request.headers.get("User-Agent") || ""}`;
  const digest = await crypto.subtle.digest("SHA-256", textToBytes(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function allowAdminLoginAttempt(request: Request, env: AuthEnv) {
  if (!env.STUDENT_DB) return true;
  const actor = await loginActorHash(request);
  const row = await env.STUDENT_DB.prepare("SELECT locked_until FROM admin_login_attempts WHERE actor_hash = ?")
    .bind(actor).first<{ locked_until: string | null }>();
  return !(row?.locked_until && Date.parse(row.locked_until) > Date.now());
}

export async function recordFailedAdminLoginAttempt(request: Request, env: AuthEnv) {
  if (!env.STUDENT_DB) return true;
  const actor = await loginActorHash(request);
  const now = Date.now();
  const row = await env.STUDENT_DB.prepare("SELECT window_started_at, attempts FROM admin_login_attempts WHERE actor_hash = ?")
    .bind(actor).first<{ window_started_at: string; attempts: number }>();
  const expired = !row || now - Date.parse(row.window_started_at) > 15 * 60 * 1000;
  const attempts = expired ? 1 : Number(row.attempts || 0) + 1;
  const lockedUntil = attempts >= 8 ? new Date(now + 15 * 60 * 1000).toISOString() : null;
  await env.STUDENT_DB.prepare(`INSERT INTO admin_login_attempts (actor_hash, window_started_at, attempts, locked_until)
    VALUES (?, ?, ?, ?) ON CONFLICT(actor_hash) DO UPDATE SET window_started_at = excluded.window_started_at,
    attempts = excluded.attempts, locked_until = excluded.locked_until`)
    .bind(actor, expired ? new Date(now).toISOString() : row!.window_started_at, attempts, lockedUntil).run();
  return !lockedUntil;
}

export async function clearAdminLoginAttempts(request: Request, env: AuthEnv) {
  if (!env.STUDENT_DB) return;
  await env.STUDENT_DB.prepare("DELETE FROM admin_login_attempts WHERE actor_hash = ?").bind(await loginActorHash(request)).run();
}

export async function allowRenshinKanVerificationAttempt(request: Request, env: AuthEnv) {
  if (!env.STUDENT_DB) return true;
  const actor = await loginActorHash(request, "renshinkan-secondary");
  const row = await env.STUDENT_DB.prepare("SELECT locked_until FROM admin_rsk_verification_attempts WHERE actor_hash = ?")
    .bind(actor).first<{ locked_until: string | null }>();
  return !(row?.locked_until && Date.parse(row.locked_until) > Date.now());
}

export async function recordFailedRenshinKanVerificationAttempt(request: Request, env: AuthEnv) {
  if (!env.STUDENT_DB) return true;
  const actor = await loginActorHash(request, "renshinkan-secondary");
  const now = Date.now();
  const row = await env.STUDENT_DB.prepare("SELECT window_started_at, attempts FROM admin_rsk_verification_attempts WHERE actor_hash = ?")
    .bind(actor).first<{ window_started_at: string; attempts: number }>();
  const expired = !row || now - Date.parse(row.window_started_at) > 15 * 60 * 1000;
  const attempts = expired ? 1 : Number(row.attempts || 0) + 1;
  const lockedUntil = attempts >= 6 ? new Date(now + 15 * 60 * 1000).toISOString() : null;
  await env.STUDENT_DB.prepare(`INSERT INTO admin_rsk_verification_attempts (actor_hash, window_started_at, attempts, locked_until)
    VALUES (?, ?, ?, ?) ON CONFLICT(actor_hash) DO UPDATE SET window_started_at = excluded.window_started_at,
    attempts = excluded.attempts, locked_until = excluded.locked_until`)
    .bind(actor, expired ? new Date(now).toISOString() : row!.window_started_at, attempts, lockedUntil).run();
  return !lockedUntil;
}

export async function clearRenshinKanVerificationAttempts(request: Request, env: AuthEnv) {
  if (!env.STUDENT_DB) return;
  await env.STUDENT_DB.prepare("DELETE FROM admin_rsk_verification_attempts WHERE actor_hash = ?")
    .bind(await loginActorHash(request, "renshinkan-secondary")).run();
}

export async function verifyRenshinKanSecondaryPassword(password: string, env: AuthEnv) {
  if (!isConfigured(env.RSK_ADMIN_SECONDARY_PASSWORD)) return false;
  return timingSafeEqual(password, env.RSK_ADMIN_SECONDARY_PASSWORD!);
}

function normalizeHash(value: string) {
  return value.replace(/^hmac-sha256:/i, "").trim();
}

export async function verifyAdminPassword(password: string, env: AuthEnv) {
  if (!isConfigured(env.ADMIN_PASSWORD_HASH) || !isConfigured(env.SESSION_SECRET)) {
    return false;
  }

  const expectedHash = normalizeHash(env.ADMIN_PASSWORD_HASH!);
  const submittedHash = await hmacSha256Hex(env.SESSION_SECRET!, password);

  return timingSafeEqual(submittedHash, expectedHash);
}

function configuredDojoPasswordHashes(env: AuthEnv) {
  if (!isConfigured(env.DOJO_ADMIN_PASSWORD_HASHES)) return new Map<string, string>();
  try {
    const parsed = JSON.parse(env.DOJO_ADMIN_PASSWORD_HASHES!) as Record<string, unknown>;
    return new Map(Object.entries(parsed)
      .filter((entry): entry is [string, string] => /^dojo-[a-z0-9-]+$/.test(entry[0]) && typeof entry[1] === "string")
      .map(([dojoId, hash]) => [dojoId, normalizeHash(hash)]));
  } catch {
    return new Map<string, string>();
  }
}

export async function authenticateAdminPassword(password: string, env: AuthEnv) {
  if (await verifyAdminPassword(password, env)) {
    return { role: "central" as const, allowedDojoIds: [] };
  }
  if (!isConfigured(env.SESSION_SECRET)) return null;
  const submittedHash = await hmacSha256Hex(env.SESSION_SECRET!, password);
  for (const [dojoId, expectedHash] of configuredDojoPasswordHashes(env)) {
    if (await timingSafeEqual(submittedHash, expectedHash)) {
      return { role: "dojo" as const, allowedDojoIds: [dojoId] };
    }
  }
  return null;
}

type NewSession = Partial<Pick<AdminSession, "sessionId" | "adminName" | "role" | "allowedDojoIds" | "selectedDojoId" | "renshinkanVerified">>;

export async function createSessionCookie(env: AuthEnv, session: NewSession = {}) {
  if (!isConfigured(env.SESSION_SECRET)) {
    throw new Error("SESSION_SECRET is not configured");
  }

  const now = Math.floor(Date.now() / 1000);
  const payload: AdminSession = {
    sub: "admin",
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
    sessionId: session.sessionId || crypto.randomUUID(),
    adminName: (session.adminName || "Administrator").normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, 120),
    role: session.role === "dojo" ? "dojo" : "central",
    allowedDojoIds: session.role === "dojo" ? Array.from(new Set(session.allowedDojoIds || [])).slice(0, 3) : [],
    selectedDojoId: session.selectedDojoId || null,
    renshinkanVerified: session.selectedDojoId === RENSHINKAN_DOJO_ID && session.role === "central" && session.renshinkanVerified === true,
  };
  const encodedPayload = bytesToBase64Url(textToBytes(JSON.stringify(payload)));
  const encodedSignature = bytesToBase64Url(await hmacSha256(env.SESSION_SECRET!, encodedPayload));
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

export async function getAdminSession(request: Request, env: AuthEnv): Promise<AdminSession | null> {
  if (!isConfigured(env.SESSION_SECRET)) {
    return null;
  }

  const token = getCookie(request, COOKIE_NAME);
  const [encodedPayload, encodedSignature] = token.split(".");

  if (!encodedPayload || !encodedSignature) {
    return null;
  }

  const expectedSignature = bytesToBase64Url(await hmacSha256(env.SESSION_SECRET!, encodedPayload));

  if (!(await timingSafeEqual(encodedSignature, expectedSignature))) {
    return null;
  }

  try {
    const payloadJson = new TextDecoder().decode(base64UrlToBytes(encodedPayload));
    const payload = JSON.parse(payloadJson) as Partial<AdminSession>;
    if (payload.sub !== "admin" || typeof payload.exp !== "number" || payload.exp <= Math.floor(Date.now() / 1000)
      || (payload.role !== "central" && payload.role !== "dojo") || typeof payload.sessionId !== "string"
      || typeof payload.adminName !== "string" || !payload.adminName.trim()) return null;
    const role = payload.role;
    const allowedDojoIds = role === "dojo" && Array.isArray(payload.allowedDojoIds)
      ? payload.allowedDojoIds.filter((value): value is string => typeof value === "string" && /^dojo-[a-z0-9-]+$/.test(value)).slice(0, 3)
      : [];
    if (role === "dojo" && allowedDojoIds.length === 0) return null;
    const result: AdminSession = {
      sub: "admin",
      iat: typeof payload.iat === "number" ? payload.iat : 0,
      exp: payload.exp,
      sessionId: payload.sessionId.slice(0, 120),
      adminName: payload.adminName.trim().slice(0, 120),
      role,
      allowedDojoIds,
      selectedDojoId: typeof payload.selectedDojoId === "string" ? payload.selectedDojoId : null,
      renshinkanVerified: payload.renshinkanVerified === true,
    };
    return result;
  } catch {
    return null;
  }
}

export async function hasValidAdminSession(request: Request, env: AuthEnv) {
  return Boolean(await getAdminSession(request, env));
}

export function canSelectDojo(session: AdminSession, dojoId: string | null | undefined) {
  if (!dojoId) return false;
  if (session.role === "central") return true;
  return dojoId !== RENSHINKAN_DOJO_ID && session.allowedDojoIds.includes(dojoId);
}

export function isRenShinKanSuperAdmin(session: AdminSession | null | undefined) {
  return Boolean(session && session.role === "central" && session.selectedDojoId === RENSHINKAN_DOJO_ID && session.renshinkanVerified);
}

export function effectivePermissionLevel(session: AdminSession): AdminPermissionLevel {
  return isRenShinKanSuperAdmin(session) ? "renshinkan_super_admin" : "dojo_admin";
}

export function hasSelectedDojoAccess(session: AdminSession | null | undefined): session is AdminSession {
  if (!session?.selectedDojoId || !canSelectDojo(session, session.selectedDojoId)) return false;
  return session.selectedDojoId !== RENSHINKAN_DOJO_ID || isRenShinKanSuperAdmin(session);
}

export async function getAuthorizedAdminSession(request: Request, env: AuthEnv) {
  const session = await getAdminSession(request, env);
  return hasSelectedDojoAccess(session) ? session : null;
}

export function canAccessDojo(session: AdminSession, dojoId: string | null | undefined) {
  if (!dojoId || !hasSelectedDojoAccess(session)) return false;
  return isRenShinKanSuperAdmin(session) || dojoId === session.selectedDojoId;
}

export function requiresCentralAdmin(session: AdminSession | null) {
  return isRenShinKanSuperAdmin(session);
}

export async function updateSelectedDojoCookie(env: AuthEnv, session: AdminSession, selectedDojoId: string | null) {
  return createSessionCookie(env, {
    sessionId: session.sessionId,
    adminName: session.adminName,
    role: session.role,
    allowedDojoIds: session.allowedDojoIds,
    selectedDojoId,
    renshinkanVerified: false,
  });
}

export async function updateRenshinKanVerifiedCookie(env: AuthEnv, session: AdminSession) {
  return createSessionCookie(env, {
    sessionId: session.sessionId,
    adminName: session.adminName,
    role: session.role,
    allowedDojoIds: session.allowedDojoIds,
    selectedDojoId: RENSHINKAN_DOJO_ID,
    renshinkanVerified: true,
  });
}
