import { jsonResponse } from "./auth";

export type D1Result<T = unknown> = { results?: T[]; success: boolean };
export type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
};
export type D1Database = {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
};

export type StudentEnv = {
  STUDENT_DB?: D1Database;
  STUDENT_LOOKUP_PEPPER?: string;
  SESSION_SECRET?: string;
  TURNSTILE_SECRET_KEY?: string;
  SITE_URL?: string;
};

const encoder = new TextEncoder();

function bytesToHex(value: ArrayBuffer) {
  return [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function normalizeVerifiedName(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("und");
}

export async function hmacHex(secret: string, value: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return bytesToHex(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

export async function sha256Hex(value: string) {
  return bytesToHex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

export async function studentCredentialHashes(env: StudentEnv, name: string, code: string) {
  const pepper = env.STUDENT_LOOKUP_PEPPER || env.SESSION_SECRET;
  if (!pepper) throw new Error("Student record hashing is not configured");
  return {
    nameHash: await hmacHex(pepper, `name:${normalizeVerifiedName(name)}`),
    codeHash: await hmacHex(pepper, `code:${code.trim().toLocaleUpperCase("en-US")}`),
  };
}

export function requireStudentDb(env: StudentEnv) {
  if (!env.STUDENT_DB) throw new Error("STUDENT_DB binding is not configured");
  return env.STUDENT_DB;
}

export async function verifyTurnstile(request: Request, env: StudentEnv, token: string) {
  if (!env.TURNSTILE_SECRET_KEY || !token || token.length > 2048) return false;
  const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token });
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) body.set("remoteip", ip);
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
  if (!response.ok) return false;
  const result = await response.json<{ success?: boolean }>();
  return result.success === true;
}

export async function enforceLookupRateLimit(request: Request, env: StudentEnv) {
  const db = requireStudentDb(env);
  const actor = await sha256Hex(`${request.headers.get("CF-Connecting-IP") || "unknown"}:${request.headers.get("User-Agent") || ""}`);
  const now = Date.now();
  const row = await db.prepare("SELECT window_started_at, attempts FROM lookup_attempts WHERE actor_hash = ?").bind(actor).first<{ window_started_at: string; attempts: number }>();
  const expired = !row || now - Date.parse(row.window_started_at) > 15 * 60 * 1000;
  if (!expired && row.attempts >= 8) return false;
  if (expired) {
    await db.prepare("INSERT INTO lookup_attempts (actor_hash, window_started_at, attempts) VALUES (?, ?, 1) ON CONFLICT(actor_hash) DO UPDATE SET window_started_at = excluded.window_started_at, attempts = 1").bind(actor, new Date(now).toISOString()).run();
  } else {
    await db.prepare("UPDATE lookup_attempts SET attempts = attempts + 1 WHERE actor_hash = ?").bind(actor).run();
  }
  return true;
}

type StudentRow = {
  id: string; public_student_id: string; display_name: string; current_belt: string; belt_color: string;
  profile_image_url: string | null; profile_image_consent: number; public_visible: number; active: number;
  share_fields: string; dojo_name: string; updated_at: string;
};

function safeVisibility(value: string) {
  try { return JSON.parse(value) as Record<string, boolean>; } catch { return {}; }
}

export async function publicStudentRecord(db: D1Database, student: StudentRow, shared = false) {
  const visibility = safeVisibility(student.share_fields);
  const exams = visibility.examinations !== false
    ? (await db.prepare("SELECT examination_date, belt_awarded, belt_color, rank, examiner, public_notes FROM belt_examinations WHERE student_id = ? ORDER BY examination_date DESC").bind(student.id).all()).results || []
    : [];
  const total = visibility.trainingHours !== false
    ? await db.prepare("SELECT COALESCE(SUM(verified_hours), 0) AS total FROM training_hours WHERE student_id = ?").bind(student.id).first<{ total: number }>()
    : { total: 0 };
  return {
    displayName: student.display_name,
    studentId: student.public_student_id,
    currentBelt: student.current_belt,
    beltColor: student.belt_color,
    totalVerifiedTrainingHours: Number(total?.total || 0),
    examinations: exams,
    dojoName: student.dojo_name,
    lastUpdated: visibility.lastUpdated === false ? null : student.updated_at,
    profileImage: student.profile_image_consent && (!shared || visibility.photo === true) ? student.profile_image_url : null,
    verified: true,
  };
}

export function genericLookupFailure(status = 404) {
  return jsonResponse({ error: "The record could not be verified. Check both details and try again." }, status, { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" });
}

export async function audit(db: D1Database, action: string, recordType: string, recordId: string, summary: string) {
  await db.prepare("INSERT INTO audit_log (id, admin_action, record_type, record_id, action_summary, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), action, recordType, recordId, summary.slice(0, 300), new Date().toISOString()).run();
}
