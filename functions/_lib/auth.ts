const COOKIE_NAME = "rsk_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

type AuthEnv = {
  ADMIN_PASSWORD_HASH?: string;
  SESSION_SECRET?: string;
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

  if (!origin) {
    return true;
  }

  try {
    return new URL(origin).origin === new URL(request.url).origin;
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
