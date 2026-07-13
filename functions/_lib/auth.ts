const COOKIE_NAME = "rsk_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

type AuthEnv = {
  ADMIN_PASSWORD_HASH?: string;
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

type SessionPayload = {
  sub: "admin";
  iat: number;
  exp: number;
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

function timingSafeEqual(a: string, b: string) {
  const maxLength = Math.max(a.length, b.length);
  let result = a.length ^ b.length;

  for (let index = 0; index < maxLength; index += 1) {
    result |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
  }

  return result === 0;
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

async function loginActorHash(request: Request) {
  const value = `${request.headers.get("CF-Connecting-IP") || "unknown"}:${request.headers.get("User-Agent") || ""}`;
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

export async function createSessionCookie(env: AuthEnv) {
  if (!isConfigured(env.SESSION_SECRET)) {
    throw new Error("SESSION_SECRET is not configured");
  }

  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sub: "admin",
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  };
  const encodedPayload = bytesToBase64Url(textToBytes(JSON.stringify(payload)));
  const encodedSignature = bytesToBase64Url(await hmacSha256(env.SESSION_SECRET!, encodedPayload));
  const token = `${encodedPayload}.${encodedSignature}`;

  return `${COOKIE_NAME}=${token}; Max-Age=${SESSION_TTL_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function getCookie(request: Request, name: string) {
  const cookieHeader = request.headers.get("Cookie") ?? "";
  const cookies = cookieHeader.split(";").map((cookie) => cookie.trim());
  const prefix = `${name}=`;
  const match = cookies.find((cookie) => cookie.startsWith(prefix));

  return match ? decodeURIComponent(match.slice(prefix.length)) : "";
}

export async function hasValidAdminSession(request: Request, env: AuthEnv) {
  if (!isConfigured(env.SESSION_SECRET)) {
    return false;
  }

  const token = getCookie(request, COOKIE_NAME);
  const [encodedPayload, encodedSignature] = token.split(".");

  if (!encodedPayload || !encodedSignature) {
    return false;
  }

  const expectedSignature = bytesToBase64Url(await hmacSha256(env.SESSION_SECRET!, encodedPayload));

  if (!timingSafeEqual(encodedSignature, expectedSignature)) {
    return false;
  }

  try {
    const payloadJson = new TextDecoder().decode(base64UrlToBytes(encodedPayload));
    const payload = JSON.parse(payloadJson) as Partial<SessionPayload>;
    return payload.sub === "admin" && typeof payload.exp === "number" && payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}
