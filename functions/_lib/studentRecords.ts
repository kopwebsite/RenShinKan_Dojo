import { beltKeyForRank, normalizeRank } from "../../shared/ranks";
import { jsonResponse } from "./auth";

export type D1Result<T = unknown> = {
  results?: T[];
  success: boolean;
  meta?: { changes?: number; last_row_id?: number | string };
};
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

export const DEFAULT_DOJO = "RenShinKan Dojo";
export const DEFAULT_SHARE_FIELDS = { photo: true, trainingHours: true, examinations: true, lastUpdated: true };
const STUDENT_ID_PATTERN = /^RSK-\d{4,}$/;
const ACCESS_SESSION_MINUTES = 20;
const encoder = new TextEncoder();

function bytesToHex(value: ArrayBuffer | Uint8Array) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.slice(index, index + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function randomToken(byteLength = 32) {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export function requestIdentifier(request: Request) {
  const supplied = request.headers.get("X-Request-ID")?.trim() || "";
  return /^[A-Za-z0-9._:-]{8,128}$/.test(supplied) ? supplied : crypto.randomUUID();
}

export function normalizeVerifiedName(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("und");
}

function compactVerifiedName(value: string) {
  return normalizeVerifiedName(value).replace(/[\p{P}\p{S}\s]+/gu, "");
}

function editDistance(left: string, right: string) {
  if (left === right) return 0;
  if (!left) return [...right].length;
  if (!right) return [...left].length;
  const a = [...left];
  const b = [...right];
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let row = 0; row < a.length; row += 1) {
    const current = [row + 1];
    for (let column = 0; column < b.length; column += 1) {
      current[column + 1] = Math.min(
        current[column] + 1,
        previous[column + 1] + 1,
        previous[column] + (a[row] === b[column] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length];
}

export function namesLikelyMatch(submitted: string, recorded: string) {
  const left = compactVerifiedName(submitted);
  const right = compactVerifiedName(recorded);
  if (!left || !right) return false;
  if (left === right) return true;
  if (Math.min(left.length, right.length) >= 6 && (left.includes(right) || right.includes(left))) return true;
  const allowance = Math.max(2, Math.ceil(Math.max(left.length, right.length) * 0.12));
  return editDistance(left, right) <= allowance;
}

export function normalizeInternationalPhone(callingCodeValue: unknown, phoneValue: unknown) {
  const callingCode = typeof callingCodeValue === "string" ? callingCodeValue.trim().replace(/\s+/g, "") : "";
  const phone = typeof phoneValue === "string" ? phoneValue.normalize("NFKC").trim() : "";
  if (!/^\+[1-9]\d{0,3}$/.test(callingCode)) throw new Error("Choose a valid telephone country and calling code.");
  if (!phone || !/^[\d\s()+.\-]+$/.test(phone)) throw new Error("Enter a telephone number using digits, spaces, parentheses, dots, or hyphens.");

  const digits = phone.replace(/\D/g, "");
  let international = "";
  if (phone.startsWith("+")) {
    international = `+${digits}`;
    if (!international.startsWith(callingCode)) throw new Error(`The telephone number must use the selected ${callingCode} calling code.`);
  } else {
    international = `${callingCode}${digits.replace(/^0/, "")}`;
  }
  if (!/^\+[1-9]\d{7,14}$/.test(international)) throw new Error("Enter a valid international telephone number containing 8 to 15 digits.");
  return international;
}

export function isMonthKey(value: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return false;
  const [year] = value.split("-").map(Number);
  return year >= 2000 && year <= 2200;
}

export function currentBangkokMonthKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  if (!year || !month) throw new Error("The current contribution month could not be determined.");
  return `${year}-${month}`;
}

export function recentMonthKeys(count = 12, from = currentBangkokMonthKey()) {
  const [year, month] = from.split("-").map(Number);
  return Array.from({ length: Math.max(1, Math.min(24, count)) }, (_, index) =>
    new Date(Date.UTC(year, month - 1 - index, 1)).toISOString().slice(0, 7));
}

export async function hmacHex(secret: string, value: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return bytesToHex(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

export async function sha256Hex(value: string) {
  return bytesToHex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

function studentSecret(env: StudentEnv) {
  const secret = env.STUDENT_LOOKUP_PEPPER || env.SESSION_SECRET;
  if (!secret) throw new Error("Student record security is not configured");
  return secret;
}

export async function studentNameVerificationHash(env: StudentEnv, name: string) {
  const secret = studentSecret(env);
  return hmacHex(secret, `name:${normalizeVerifiedName(name)}`);
}

export function normalizeStudentId(value: string) {
  return value.normalize("NFKC").trim().toLocaleUpperCase("en-US");
}

export function isValidStudentId(value: string) {
  return STUDENT_ID_PATTERN.test(normalizeStudentId(value));
}

export function formatStudentId(sequence: number) {
  return `RSK-${String(sequence).padStart(4, "0")}`;
}

export function rankColor(rank: string, fallback = "white") {
  return beltKeyForRank(rank) || fallback || "white";
}

export async function nextStudentId(db: D1Database) {
  const row = await db.prepare("UPDATE student_id_sequence SET last_number = last_number + 1 WHERE sequence_name = 'student' RETURNING last_number")
    .first<{ last_number: number }>();
  if (!row) throw new Error("Student ID sequence is not configured");
  return formatStudentId(Number(row.last_number));
}

export async function suggestedStudentId(db: D1Database) {
  const row = await db.prepare("SELECT last_number FROM student_id_sequence WHERE sequence_name = 'student'").first<{ last_number: number }>();
  return formatStudentId(Number(row?.last_number || 0) + 1);
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
  const row = await db.prepare("SELECT window_started_at, attempts FROM lookup_attempts WHERE actor_hash = ?").bind(actor)
    .first<{ window_started_at: string; attempts: number }>();
  const expired = !row || now - Date.parse(row.window_started_at) > 15 * 60 * 1000;
  if (!expired && row.attempts >= 8) return false;
  if (expired) {
    await db.prepare("INSERT INTO lookup_attempts (actor_hash, window_started_at, attempts) VALUES (?, ?, 1) ON CONFLICT(actor_hash) DO UPDATE SET window_started_at = excluded.window_started_at, attempts = 1")
      .bind(actor, new Date(now).toISOString()).run();
  } else {
    await db.prepare("UPDATE lookup_attempts SET attempts = attempts + 1 WHERE actor_hash = ?").bind(actor).run();
  }
  return true;
}

async function capabilityKey(env: StudentEnv) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(`share:${studentSecret(env)}`));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptCapabilityToken(env: StudentEnv, token: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await capabilityKey(env), encoder.encode(token)));
  return `v1.${bytesToBase64Url(iv)}.${bytesToBase64Url(encrypted)}`;
}

export async function decryptCapabilityToken(env: StudentEnv, value: string) {
  const [version, ivValue, encryptedValue] = value.split(".");
  if (version !== "v1" || !ivValue || !encryptedValue) return null;
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64UrlToBytes(ivValue) },
      await capabilityKey(env),
      base64UrlToBytes(encryptedValue),
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
}

export async function ensureOwnerShareUrl(db: D1Database, env: StudentEnv, studentId: string, request: Request) {
  const existing = await db.prepare("SELECT token_ciphertext FROM share_tokens WHERE student_id = ? AND active = 1 AND purpose = 'owner' AND token_ciphertext IS NOT NULL ORDER BY created_at DESC LIMIT 1")
    .bind(studentId).first<{ token_ciphertext: string }>();
  let token = existing?.token_ciphertext ? await decryptCapabilityToken(env, existing.token_ciphertext) : null;
  let created = false;
  if (!token) {
    token = randomToken();
    created = true;
    const now = new Date().toISOString();
    await db.prepare("INSERT INTO share_tokens (id, token_hash, student_id, active, created_at, token_ciphertext, purpose) VALUES (?, ?, ?, 1, ?, ?, 'owner')")
      .bind(crypto.randomUUID(), await sha256Hex(token), studentId, now, await encryptCapabilityToken(env, token)).run();
  }
  const origin = (env.SITE_URL || new URL(request.url).origin).replace(/\/$/, "");
  return { url: `${origin}/records/share/${token}`, created };
}

export async function issueStudentAccessSession(db: D1Database, studentId: string, requestId: string) {
  const token = randomToken();
  const now = new Date();
  const expires = new Date(now.getTime() + ACCESS_SESSION_MINUTES * 60 * 1000).toISOString();
  await db.prepare("INSERT INTO student_access_sessions (id, token_hash, student_id, expires_at, request_id, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), await sha256Hex(token), studentId, expires, requestId, now.toISOString()).run();
  return token;
}

export async function validStudentAccessSession(db: D1Database, studentId: string, token: string) {
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) return null;
  return db.prepare("SELECT id FROM student_access_sessions WHERE token_hash = ? AND student_id = ? AND used_at IS NULL AND expires_at > ? LIMIT 1")
    .bind(await sha256Hex(token), studentId, new Date().toISOString()).first<{ id: string }>();
}

export async function studentTotal(db: D1Database, studentId: string) {
  const row = await db.prepare(`SELECT COALESCE((SELECT SUM(verified_hours) FROM training_hours WHERE student_id = s.id), 0)
    + s.training_hours_adjustment AS total FROM students s WHERE s.id = ?`).bind(studentId).first<{ total: number }>();
  return row ? Number(row.total || 0) : null;
}

export type StudentRow = {
  id: string;
  public_student_id: string;
  display_name: string;
  current_belt: string;
  belt_color: string;
  profile_image_url: string | null;
  profile_image_consent: number;
  public_visible: number;
  active: number;
  profile_status?: string;
  share_fields: string;
  dojo_name: string;
  updated_at: string;
  training_hours_adjustment?: number;
};

function safeVisibility(value: string) {
  try { return JSON.parse(value) as Record<string, boolean>; } catch { return {}; }
}

export async function publicStudentRecord(db: D1Database, student: StudentRow) {
  const visibility = safeVisibility(student.share_fields);
  const exams = visibility.examinations !== false
    ? (await db.prepare(`SELECT examination_date, belt_awarded, belt_color, rank, examiner, public_notes,
        passed, rank_before, rank_attempted, rank_after, examination_location
        FROM belt_examinations WHERE student_id = ? ORDER BY examination_date DESC`).bind(student.id).all()).results || []
    : [];
  const total = visibility.trainingHours !== false ? await studentTotal(db, student.id) : 0;
  return {
    displayName: student.display_name,
    studentId: student.public_student_id,
    currentBelt: student.current_belt,
    beltColor: student.belt_color,
    totalVerifiedTrainingHours: Number(total || 0),
    examinations: exams,
    dojoName: student.dojo_name,
    lastUpdated: visibility.lastUpdated === false ? null : student.updated_at,
    profileImage: student.profile_image_consent ? student.profile_image_url : null,
    verified: true,
  };
}

export function genericLookupFailure(status = 404) {
  return jsonResponse(
    { error: "We could not find a matching student record. Please check the details and try again." },
    status,
    { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
  );
}

export type AuditInput = {
  actorType: "administrator" | "student" | "system";
  actorIdentifier: string;
  action: string;
  entityType: string;
  entityId: string;
  studentId?: string | null;
  studentPublicId?: string | null;
  studentNameSnapshot?: string | null;
  examCycleId?: string | null;
  contributionMonth?: string | null;
  previousValues?: unknown;
  newValues?: unknown;
  source: string;
  bulkOperationId?: string | null;
  requestId: string;
  administratorNote?: string | null;
  summary: string;
  createdAt?: string;
};

function structuredValue(value: unknown) {
  return value === undefined ? null : JSON.stringify(value);
}

export function auditStatement(db: D1Database, input: AuditInput) {
  const createdAt = input.createdAt || new Date().toISOString();
  return db.prepare(`INSERT INTO audit_log (
      id, admin_action, record_type, record_id, action_summary, created_at,
      actor_type, actor_identifier, action, entity_type, entity_id, student_id,
      previous_values, new_values, source, bulk_operation_id, request_id, administrator_note,
      student_public_id_snapshot, student_name_snapshot, exam_cycle_id, contribution_month
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      crypto.randomUUID(), input.action, input.entityType, input.entityId, input.summary.slice(0, 300), createdAt,
      input.actorType, input.actorIdentifier.slice(0, 160), input.action, input.entityType, input.entityId,
      input.studentId || null, structuredValue(input.previousValues), structuredValue(input.newValues), input.source,
      input.bulkOperationId || null, input.requestId, input.administratorNote?.slice(0, 2000) || null,
      input.studentPublicId?.slice(0, 80) || null, input.studentNameSnapshot?.slice(0, 160) || null,
      input.examCycleId || null, input.contributionMonth || null,
    );
}

export async function audit(db: D1Database, input: AuditInput) {
  await auditStatement(db, input).run();
}

export function normalizedRankOrError(value: unknown) {
  const rank = normalizeRank(value);
  if (!rank) throw new Error("Choose a valid rank from the official progression.");
  return rank;
}
