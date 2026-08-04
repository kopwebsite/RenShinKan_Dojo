import { beltKeyForRank, nextRank, normalizeRank } from "../../shared/ranks";
import { aatMembershipStatus } from "../../shared/membership";
import { studentRequestStatus } from "../../shared/requestStatus";
import {
  bangkokBuddhistYear,
  bangkokGregorianYear,
  currentBangkokMonthKey as gregorianBangkokMonthKey,
} from "../../shared/date";
import { examinationFeeThb } from "../../shared/examFees";
import { decideStudentPaymentAlerts } from "../../shared/studentPaymentAlerts";
import {
  canAccessDojo,
  effectivePermissionLevel,
  jsonResponse,
  type AdminSession,
} from "./auth";
import { consumeRateLimit } from "./rateLimit";
import { trustedClientIp } from "./requestIdentity";

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
  APP_ENV?: string;
  BUILD_ID?: string;
  STUDENT_DB?: D1Database;
  STUDENT_LOOKUP_PEPPER?: string;
  SESSION_SECRET?: string;
  TURNSTILE_SECRET_KEY?: string;
  SITE_URL?: string;
  RENSHINKAN_MONTHLY_CONTRIBUTION_AMOUNT?: string;
  AAT_ANNUAL_CONTRIBUTION_AMOUNT?: string;
};

export const DEFAULT_DOJO = "RenShinKan Dojo";
export const DEFAULT_DOJO_ID = "dojo-rsk";
export const DEFAULT_SHARE_FIELDS = {
  photo: true,
  trainingHours: true,
  examinations: true,
  lastUpdated: true,
};
const STUDENT_ID_PATTERN = /^[A-Z0-9]{2,8}-\d{4,}$/;
const ACCESS_SESSION_MINUTES = 20;
const encoder = new TextEncoder();

export function configuredMonthlyContributionAmount(env: StudentEnv) {
  const amount = Number(env.RENSHINKAN_MONTHLY_CONTRIBUTION_AMOUNT);
  return Number.isSafeInteger(amount) && amount > 0 && amount <= 1_000_000
    ? amount
    : null;
}

export function configuredAatAnnualContributionAmount(env: StudentEnv) {
  const amount = Number(env.AAT_ANNUAL_CONTRIBUTION_AMOUNT);
  return Number.isSafeInteger(amount) && amount > 0 && amount <= 1_000_000
    ? amount
    : null;
}

function bytesToHex(value: ArrayBuffer | Uint8Array) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.slice(index, index + 0x8000));
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
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function randomToken(byteLength = 32) {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export function requestIdentifier(request: Request) {
  const supplied = request.headers.get("X-Request-ID")?.trim() || "";
  return /^[A-Za-z0-9._:-]{8,128}$/.test(supplied)
    ? supplied
    : crypto.randomUUID();
}

export async function scopedAdminMutationRequestId(
  env: StudentEnv,
  session: AdminSession,
  requestId: string,
  routeKey: string,
  payload: unknown,
) {
  const secret = env.SESSION_SECRET?.trim() || "";
  const dojoId = session.selectedDojoId || "";
  if (secret.length < 32 || !dojoId || !/^[a-z0-9/_-]{3,100}$/.test(routeKey))
    throw new Error("Administrator mutation replay protection is unavailable");
  const payloadHash = await sha256Hex(JSON.stringify(payload));
  return hmacHex(
    secret,
    `admin-mutation-v1\n${session.accountId}\n${effectivePermissionLevel(session)}\n${dojoId}\n${routeKey}\n${requestId}\n${payloadHash}`,
  );
}

export function normalizeVerifiedName(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("und");
}

export function namesLikelyMatch(submitted: string, recorded: string) {
  const left = normalizeVerifiedName(submitted);
  const right = normalizeVerifiedName(recorded);
  return Boolean(left && right && left === right);
}

export function normalizeInternationalPhone(
  callingCodeValue: unknown,
  phoneValue: unknown,
) {
  const callingCode =
    typeof callingCodeValue === "string"
      ? callingCodeValue.trim().replace(/\s+/g, "")
      : "";
  const phone =
    typeof phoneValue === "string" ? phoneValue.normalize("NFKC").trim() : "";
  if (!/^\+[1-9]\d{0,3}$/.test(callingCode))
    throw new Error("Choose a valid telephone country and calling code.");
  if (!phone || !/^[\d\s()+.\-]+$/.test(phone))
    throw new Error(
      "Enter a telephone number using digits, spaces, parentheses, dots, or hyphens.",
    );

  const digits = phone.replace(/\D/g, "");
  let international = "";
  if (phone.startsWith("+")) {
    international = `+${digits}`;
    if (!international.startsWith(callingCode))
      throw new Error(
        `The telephone number must use the selected ${callingCode} calling code.`,
      );
  } else {
    international = `${callingCode}${digits.replace(/^0/, "")}`;
  }
  if (!/^\+[1-9]\d{7,14}$/.test(international))
    throw new Error(
      "Enter a valid international telephone number containing 8 to 15 digits.",
    );
  return international;
}

export function isMonthKey(value: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return false;
  const [year] = value.split("-").map(Number);
  return year >= 2000 && year <= 2200;
}

export const currentBangkokMonthKey = gregorianBangkokMonthKey;

export function recentMonthKeys(count = 12, from = currentBangkokMonthKey()) {
  const [year, month] = from.split("-").map(Number);
  return Array.from({ length: Math.max(1, Math.min(24, count)) }, (_, index) =>
    new Date(Date.UTC(year, month - 1 - index, 1)).toISOString().slice(0, 7),
  );
}

/**
 * The single definition of "a student who still belongs on a live roster".
 * Archived and removed records are excluded, so every screen that counts or
 * lists roster students agrees instead of drifting apart.
 */
export function liveRosterStudentSql(alias = "s") {
  const column = alias ? `${alias}.` : "";
  return `${column}active = 1 AND ${column}archived_at IS NULL AND ${column}deleted_at IS NULL AND ${column}profile_status IN ('pending_admin_approval', 'approved')`;
}

export const LIVE_ROSTER_STUDENT_SQL = liveRosterStudentSql();

/**
 * Recomputes a contribution period's stored active-student count using the same
 * roster definition the monthly contributions page renders.
 */
export function contributionPeriodCountStatement(
  db: D1Database,
  monthKey: string,
  dojoId: string = DEFAULT_DOJO_ID,
) {
  return db
    .prepare(
      `UPDATE contribution_periods SET active_student_count_snapshot = (
      SELECT COUNT(*) FROM contribution_period_students r
      JOIN students s ON s.id = r.student_id
      WHERE r.month_key = ? AND r.active_at_period_start = 1 AND s.dojo_id = ?
        AND ${LIVE_ROSTER_STUDENT_SQL}
    ) WHERE month_key = ?`,
    )
    .bind(monthKey, dojoId, monthKey);
}

export async function hmacHex(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToHex(
    await crypto.subtle.sign("HMAC", key, encoder.encode(value)),
  );
}

export async function sha256Hex(value: string) {
  return bytesToHex(
    await crypto.subtle.digest("SHA-256", encoder.encode(value)),
  );
}

function studentSecret(env: StudentEnv) {
  const secret = env.STUDENT_LOOKUP_PEPPER || env.SESSION_SECRET;
  if (!secret) throw new Error("Student record security is not configured");
  return secret;
}

export async function studentNameVerificationHash(
  env: StudentEnv,
  name: string,
) {
  const secret = studentSecret(env);
  return hmacHex(secret, `name:${normalizeVerifiedName(name)}`);
}

export function normalizeStudentId(value: string) {
  return value.normalize("NFKC").trim().toLocaleUpperCase("en-US");
}

export function isValidStudentId(value: string) {
  return STUDENT_ID_PATTERN.test(normalizeStudentId(value));
}

export { bangkokBuddhistYear, bangkokGregorianYear };

export function formatStudentId(
  sequence: number,
  code = "RSK",
  buddhistYear = bangkokBuddhistYear(),
) {
  const normalizedSequence = Math.max(1, Math.trunc(sequence));
  const yearSuffix = String(buddhistYear).slice(-2).padStart(2, "0");
  return `${code.toLocaleUpperCase("en-US")}-${yearSuffix}${String(normalizedSequence).padStart(2, "0")}`;
}

export function studentIdSequenceForCurrentYear(
  studentId: string,
  code: string,
  date = new Date(),
) {
  const buddhistYear = bangkokBuddhistYear(date);
  const prefix = `${code.toLocaleUpperCase("en-US")}-${String(buddhistYear).slice(-2).padStart(2, "0")}`;
  const normalized = normalizeStudentId(studentId);
  if (!normalized.startsWith(prefix)) return null;
  const sequenceText = normalized.slice(prefix.length);
  if (!/^\d{2,}$/.test(sequenceText)) return null;
  const sequence = Number(sequenceText);
  return Number.isSafeInteger(sequence) && sequence > 0
    ? { buddhistYear, sequence }
    : null;
}

export function syncStudentIdSequenceStatement(
  db: D1Database,
  dojoId: string,
  dojoCode: string,
  studentId: string,
  updatedAt: string,
) {
  const parsed = studentIdSequenceForCurrentYear(
    studentId,
    dojoCode,
    new Date(updatedAt),
  );
  if (!parsed) return null;
  return db
    .prepare(
      `INSERT INTO dojo_student_year_sequences (dojo_id, buddhist_year, last_number, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(dojo_id, buddhist_year) DO UPDATE SET
        last_number = MAX(dojo_student_year_sequences.last_number, excluded.last_number),
        updated_at = excluded.updated_at`,
    )
    .bind(dojoId, parsed.buddhistYear, parsed.sequence, updatedAt);
}

export function rankColor(rank: string, fallback = "white") {
  return beltKeyForRank(rank) || fallback || "white";
}

export async function nextStudentId(
  db: D1Database,
  dojoId = DEFAULT_DOJO_ID,
  date = new Date(),
) {
  const buddhistYear = bangkokBuddhistYear(date);
  const row = await db
    .prepare(
      `INSERT INTO dojo_student_year_sequences (dojo_id, buddhist_year, last_number, updated_at)
      SELECT d.id, ?, MAX(1, COALESCE((
        SELECT MAX(CAST(substr(s.public_student_id, length(d.code) + 4) AS INTEGER))
        FROM students s
        WHERE s.dojo_id = d.id
          AND upper(s.public_student_id) LIKE upper(d.code) || '-' || printf('%02d', ? % 100) || '%'
          AND length(s.public_student_id) >= length(d.code) + 5
          AND substr(s.public_student_id, length(d.code) + 4) NOT GLOB '*[^0-9]*'
      ), 0) + 1), ? FROM dojos d WHERE d.id = ? AND d.active = 1
      ON CONFLICT(dojo_id, buddhist_year) DO UPDATE SET
        last_number = MAX(dojo_student_year_sequences.last_number + 1, excluded.last_number),
        updated_at = excluded.updated_at
      RETURNING last_number, (SELECT code FROM dojos WHERE id = ?) AS code`,
    )
    .bind(buddhistYear, buddhistYear, date.toISOString(), dojoId, dojoId)
    .first<{ last_number: number; code: string }>();
  if (!row?.code)
    throw new Error("The dojo Student ID sequence is not configured");
  return formatStudentId(Number(row.last_number), row.code, buddhistYear);
}

export async function suggestedStudentId(
  db: D1Database,
  dojoId = DEFAULT_DOJO_ID,
  date = new Date(),
) {
  const buddhistYear = bangkokBuddhistYear(date);
  const row = await db
    .prepare(
      `SELECT d.code, MAX(COALESCE(seq.last_number, 0), COALESCE((
        SELECT MAX(CAST(substr(s.public_student_id, length(d.code) + 4) AS INTEGER))
        FROM students s
        WHERE s.dojo_id = d.id
          AND upper(s.public_student_id) LIKE upper(d.code) || '-' || printf('%02d', ? % 100) || '%'
          AND length(s.public_student_id) >= length(d.code) + 5
          AND substr(s.public_student_id, length(d.code) + 4) NOT GLOB '*[^0-9]*'
      ), 0)) AS last_number
    FROM dojos d LEFT JOIN dojo_student_year_sequences seq ON seq.dojo_id = d.id AND seq.buddhist_year = ?
    WHERE d.id = ? AND d.active = 1`,
    )
    .bind(buddhistYear, buddhistYear, dojoId)
    .first<{ code: string; last_number: number }>();
  if (!row) return formatStudentId(1, "RSK", buddhistYear);
  return formatStudentId(
    Number(row.last_number || 0) + 1,
    row.code,
    buddhistYear,
  );
}

export type DojoRow = {
  id: string;
  official_name: string;
  short_name: string;
  code: string;
  logo_url: string;
  slug: string;
  active: number;
  sort_order: number;
  contact_json?: string;
};

export async function activeDojo(db: D1Database, dojoId: string) {
  return db
    .prepare(
      `SELECT id, official_name, short_name, code, logo_url, slug, active, sort_order, contact_json
    FROM dojos WHERE id = ? AND active = 1 LIMIT 1`,
    )
    .bind(dojoId)
    .first<DojoRow>();
}

export async function assertStudentAccess(
  db: D1Database,
  session: AdminSession,
  studentId: string,
) {
  const student = await db
    .prepare("SELECT id, dojo_id FROM students WHERE id = ? LIMIT 1")
    .bind(studentId)
    .first<{ id: string; dojo_id: string | null }>();
  if (!student)
    return { ok: false as const, status: 404, error: "Student not found" };
  if (!canAccessDojo(session, student.dojo_id))
    return {
      ok: false as const,
      status: 403,
      error: "You do not have access to this student's dojo.",
    };
  return { ok: true as const, student };
}

export function requireStudentDb(env: StudentEnv) {
  if (!env.STUDENT_DB) throw new Error("STUDENT_DB binding is not configured");
  return env.STUDENT_DB;
}

export async function verifyTurnstile(
  request: Request,
  env: StudentEnv,
  token: string,
  expectedAction: string,
) {
  if (!env.TURNSTILE_SECRET_KEY || !token || token.length > 2048) return false;
  const body = new URLSearchParams({
    secret: env.TURNSTILE_SECRET_KEY,
    response: token,
    idempotency_key: crypto.randomUUID(),
  });
  const ip = trustedClientIp(request);
  if (ip) body.set("remoteip", ip);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body, signal: controller.signal },
    );
    if (!response.ok) return false;
    const result = await response.json<{
      success?: boolean;
      action?: string;
      hostname?: string;
      metadata?: { result_with_testing_key?: boolean };
    }>();
    const officialPassingTestSecret = "1x0000000000000000000000000000000AA";
    if (
      env.APP_ENV !== "production" &&
      env.TURNSTILE_SECRET_KEY === officialPassingTestSecret &&
      result.success === true &&
      result.metadata?.result_with_testing_key === true
    ) {
      return true;
    }
    const expectedHostname = new URL(env.SITE_URL || request.url).hostname;
    return (
      result.success === true &&
      result.action === expectedAction &&
      result.hostname === expectedHostname
    );
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export async function enforceLookupRateLimit(
  request: Request,
  env: StudentEnv,
  subject?: string | null,
) {
  return consumeRateLimit(request, env, {
    endpoint: subject ? "student-lookup-subject" : "student-lookup-ip",
    subject,
    limit: subject ? 6 : 16,
    windowSeconds: 15 * 60,
    lockSeconds: subject ? 15 * 60 : 5 * 60,
  });
}

async function capabilityKey(env: StudentEnv) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(`share:${studentSecret(env)}`),
  );
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptCapabilityToken(env: StudentEnv, token: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      await capabilityKey(env),
      encoder.encode(token),
    ),
  );
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

export async function ensureOwnerShareUrl(
  db: D1Database,
  env: StudentEnv,
  studentId: string,
  request: Request,
) {
  const existing = await db
    .prepare(
      "SELECT token_ciphertext FROM share_tokens WHERE student_id = ? AND active = 1 AND purpose = 'owner' AND token_ciphertext IS NOT NULL ORDER BY created_at DESC LIMIT 1",
    )
    .bind(studentId)
    .first<{ token_ciphertext: string }>();
  let token = existing?.token_ciphertext
    ? await decryptCapabilityToken(env, existing.token_ciphertext)
    : null;
  let created = false;
  if (!token) {
    token = randomToken();
    created = true;
    const now = new Date().toISOString();
    await db
      .prepare(
        "INSERT INTO share_tokens (id, token_hash, student_id, active, created_at, token_ciphertext, purpose) VALUES (?, ?, ?, 1, ?, ?, 'owner')",
      )
      .bind(
        crypto.randomUUID(),
        await sha256Hex(token),
        studentId,
        now,
        await encryptCapabilityToken(env, token),
      )
      .run();
  }
  const origin = (env.SITE_URL || new URL(request.url).origin).replace(
    /\/$/,
    "",
  );
  return { url: `${origin}/records/share/${token}`, created };
}

export async function issueStudentAccessSession(
  db: D1Database,
  studentId: string,
  requestId: string,
) {
  const token = randomToken();
  const now = new Date();
  const expires = new Date(
    now.getTime() + ACCESS_SESSION_MINUTES * 60 * 1000,
  ).toISOString();
  await db
    .prepare(
      "INSERT INTO student_access_sessions (id, token_hash, student_id, expires_at, request_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(
      crypto.randomUUID(),
      await sha256Hex(token),
      studentId,
      expires,
      requestId,
      now.toISOString(),
    )
    .run();
  return token;
}

export async function validStudentAccessSession(
  db: D1Database,
  studentId: string,
  token: string,
) {
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) return null;
  return db
    .prepare(
      "SELECT id FROM student_access_sessions WHERE token_hash = ? AND student_id = ? AND used_at IS NULL AND expires_at > ? LIMIT 1",
    )
    .bind(await sha256Hex(token), studentId, new Date().toISOString())
    .first<{ id: string }>();
}

export async function studentTotal(db: D1Database, studentId: string) {
  const row = await db
    .prepare(
      `SELECT COALESCE((SELECT SUM(verified_hours) FROM training_hours WHERE student_id = s.id), 0)
    + s.training_hours_adjustment AS total FROM students s WHERE s.id = ?`,
    )
    .bind(studentId)
    .first<{ total: number }>();
  return row ? Number(row.total || 0) : null;
}

export type StudentRow = {
  id: string;
  public_student_id: string;
  display_name: string;
  english_name?: string | null;
  thai_name?: string | null;
  account_created_date?: string | null;
  dojo_joined_date?: string | null;
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
  created_at?: string;
  dojo_id?: string;
  dojo_logo?: string | null;
  aat_number?: string | null;
  aat_last_paid_date?: string | null;
  practice_duration?: string;
  profile_reviewed_at?: string | null;
  profile_student_visible_note?: string | null;
};

function safeVisibility(value: string) {
  try {
    return JSON.parse(value) as Record<string, boolean>;
  } catch {
    return {};
  }
}

export async function publicStudentRecord(db: D1Database, student: StudentRow) {
  const visibility = safeVisibility(student.share_fields);
  const exams =
    visibility.examinations !== false
      ? (
          await db
            .prepare(
              `SELECT id, examination_date, belt_awarded, belt_color, rank, examiner, public_notes,
        passed, rank_before, rank_attempted, rank_after, examination_location
        FROM belt_examinations WHERE student_id = ? ORDER BY examination_date DESC`,
            )
            .bind(student.id)
            .all()
        ).results || []
      : [];
  const total =
    visibility.trainingHours !== false ? await studentTotal(db, student.id) : 0;
  return {
    displayName: student.display_name,
    englishName: student.english_name || student.display_name,
    thaiName: student.thai_name || null,
    studentId: student.public_student_id,
    currentBelt: student.current_belt,
    beltColor: student.belt_color,
    totalVerifiedTrainingHours: Number(total || 0),
    examinations: exams,
    dojoName: student.dojo_name,
    lastUpdated: visibility.lastUpdated === false ? null : student.updated_at,
    profileImage: student.profile_image_consent
      ? student.profile_image_url
      : null,
    profileStatus:
      student.profile_status === "approved"
        ? ("approved" as const)
        : ("pending_admin_approval" as const),
    verified: student.profile_status === "approved",
  };
}

export async function ownerStudentRecord(db: D1Database, student: StudentRow) {
  const base = await publicStudentRecord(db, student);
  const [
    trainingResult,
    aatResult,
    hourRequestResult,
    examRequestResult,
    proofRequestResult,
    activeExamCycle,
  ] = await Promise.all([
    db
      .prepare(
        `SELECT id, entry_date, period_end, verified_hours, source, training_location,
        source_type, organization, source_details, notes, created_at
      FROM training_hours WHERE student_id = ?
      ORDER BY COALESCE(entry_date, created_at) DESC, created_at DESC, id ASC LIMIT 500`,
      )
      .bind(student.id)
      .all<{
        id: string;
        entry_date: string;
        period_end: string | null;
        verified_hours: number;
        source: string;
        training_location: string | null;
        source_type: string | null;
        organization: string | null;
        source_details: string | null;
        notes: string | null;
        created_at: string;
      }>(),
    db
      .prepare(
        `SELECT p.id, COALESCE(p.payment_date, substr(p.created_at, 1, 10)) AS payment_date,
        ap.renewal_due_date, p.amount, p.currency, p.status, p.created_at AS created_at,
        pp.id AS proof_id, pp.status AS proof_status, pp.submitted_at AS proof_submitted_at,
        pp.reviewed_at AS proof_reviewed_at, pp.student_visible_note AS proof_student_visible_note,
        pp.object_key AS proof_object_key, pp.content_type AS proof_content_type,
        pp.student_id AS proof_owner_student_id
      FROM payments p
      LEFT JOIN aat_membership_payments ap ON ap.id = p.id
      LEFT JOIN payment_request_items pri ON pri.payment_reference_id = p.id AND pri.student_id = p.student_id
      LEFT JOIN payment_proofs pp ON pp.payment_type = 'aat_annual'
        AND pp.payment_reference_id = COALESCE(pri.payment_request_id, p.id)
      WHERE p.student_id = ? AND p.payment_type = 'aat_annual'
      UNION ALL
      SELECT ap.id, ap.payment_date, ap.renewal_due_date, ap.amount, ap.currency, 'paid', ap.created_at AS created_at,
        pp.id, pp.status, pp.submitted_at, pp.reviewed_at, pp.student_visible_note, pp.object_key, pp.content_type,
        pp.student_id
      FROM aat_membership_payments ap
      LEFT JOIN payments p ON p.id = ap.id
      LEFT JOIN payment_request_items pri ON pri.payment_reference_id = ap.id AND pri.student_id = ap.student_id
      LEFT JOIN payment_proofs pp ON pp.payment_type = 'aat_annual'
        AND pp.payment_reference_id = COALESCE(pri.payment_request_id, ap.id)
      WHERE ap.student_id = ? AND p.id IS NULL
      ORDER BY created_at DESC LIMIT 30`,
      )
      .bind(student.id, student.id)
      .all<{
        id: string;
        payment_date: string;
        renewal_due_date: string | null;
        amount: number | null;
        currency: string;
        status: "paid" | "awaiting_payment" | "cancelled" | "refunded";
        created_at: string;
        proof_id: string | null;
        proof_status:
          "awaiting_upload" | "pending_review" | "approved" | "denied" | null;
        proof_submitted_at: string | null;
        proof_reviewed_at: string | null;
        proof_student_visible_note: string | null;
        proof_object_key: string | null;
        proof_content_type: string | null;
        proof_owner_student_id: string | null;
      }>(),
    db
      .prepare(
        `SELECT id, submitted_hours, previous_total, requested_total, status,
        submitted_at, reviewed_at, student_visible_note, training_date, source_type,
        organization, source_details, student_notes
      FROM training_hour_requests WHERE student_id = ?
      ORDER BY submitted_at DESC LIMIT 60`,
      )
      .bind(student.id)
      .all<{
        id: string;
        submitted_hours: number;
        previous_total: number;
        requested_total: number;
        status: "pending" | "approved" | "rejected";
        submitted_at: string;
        reviewed_at: string | null;
        student_visible_note: string | null;
        training_date: string | null;
        source_type: string | null;
        organization: string | null;
        source_details: string | null;
        student_notes: string | null;
      }>(),
    db
      .prepare(
        `SELECT ea.id, ea.cycle_id, ea.current_rank, ea.attempted_rank, ea.status, ea.payment_status, ea.submitted_at, ea.updated_at,
        ea.completed_at, ea.student_visible_decision_note, ec.lifecycle_status, ec.application_opens_at
      FROM examination_applications ea JOIN examination_cycles ec ON ec.id = ea.cycle_id
      WHERE ea.student_id = ?
      ORDER BY submitted_at DESC LIMIT 60`,
      )
      .bind(student.id)
      .all<{
        id: string;
        cycle_id: string;
        current_rank: string;
        attempted_rank: string;
        status: string;
        payment_status: string;
        submitted_at: string;
        updated_at: string;
        completed_at: string | null;
        student_visible_decision_note: string | null;
        lifecycle_status: string;
        application_opens_at: string | null;
      }>(),
    db
      .prepare(
        `SELECT DISTINCT pp.id, pp.student_id AS proof_owner_student_id, pp.payment_type, pp.payment_reference_id, pp.status,
        pp.submitted_at, pp.reviewed_at, pp.student_visible_note, pp.object_key, pp.content_type,
        COALESCE(mc.month_key, substr(pay.created_at, 1, 7)) AS period
      FROM payment_proofs pp
      LEFT JOIN monthly_contributions mc ON pp.payment_type = 'renshinkan_monthly'
        AND (mc.payment_group_id = pp.payment_reference_id OR mc.id = pp.payment_reference_id)
      LEFT JOIN payments pay ON pay.id = pp.payment_reference_id
      WHERE pp.student_id = ? OR mc.student_id = ?
      ORDER BY COALESCE(pp.submitted_at, pp.created_at) DESC LIMIT 100`,
      )
      .bind(student.id, student.id)
      .all<{
        id: string;
        proof_owner_student_id: string;
        payment_type: "exam" | "aat_annual" | "renshinkan_monthly";
        payment_reference_id: string;
        status: "awaiting_upload" | "pending_review" | "approved" | "denied";
        submitted_at: string | null;
        reviewed_at: string | null;
        student_visible_note: string | null;
        object_key: string | null;
        content_type: string | null;
        period: string | null;
      }>(),
    db
      .prepare(
        `SELECT id, lifecycle_status, application_opens_at, application_closes_at, examination_at
        FROM examination_cycles WHERE status = 'active'
        ORDER BY created_at DESC LIMIT 1`,
      )
      .first<{
        id: string;
        lifecycle_status: string;
        application_opens_at: string | null;
        application_closes_at: string | null;
        examination_at: string | null;
      }>(),
  ]);
  const monthlyResult =
    student.dojo_id === DEFAULT_DOJO_ID
      ? await db
          .prepare(
            `SELECT COALESCE(mc.id, 'expected:' || cps.month_key) AS id, cps.month_key,
          COALESCE(mc.status, 'no_submission') AS status, mc.submitted_at, mc.paid_at,
          COALESCE(mc.updated_at, cps.created_at) AS updated_at, 1 AS expected,
          pp.id AS proof_id, pp.status AS proof_status, pp.submitted_at AS proof_submitted_at,
          pp.reviewed_at AS proof_reviewed_at, pp.student_visible_note AS proof_student_visible_note,
          pp.object_key AS proof_object_key, pp.content_type AS proof_content_type,
          pp.student_id AS proof_owner_student_id
        FROM contribution_period_students cps
        LEFT JOIN monthly_contributions mc ON mc.student_id = cps.student_id AND mc.month_key = cps.month_key
        LEFT JOIN payment_proofs pp ON pp.payment_type = 'renshinkan_monthly'
          AND pp.payment_reference_id = COALESCE(mc.payment_group_id, mc.id)
        WHERE cps.student_id = ? AND cps.active_at_period_start = 1
        UNION ALL
        SELECT mc.id, mc.month_key, mc.status, mc.submitted_at, mc.paid_at, mc.updated_at, 0,
          pp.id, pp.status, pp.submitted_at, pp.reviewed_at, pp.student_visible_note, pp.object_key, pp.content_type,
          pp.student_id
        FROM monthly_contributions mc
        LEFT JOIN payment_proofs pp ON pp.payment_type = 'renshinkan_monthly'
          AND pp.payment_reference_id = COALESCE(mc.payment_group_id, mc.id)
        WHERE mc.student_id = ? AND NOT EXISTS (
          SELECT 1 FROM contribution_period_students cps
          WHERE cps.student_id = mc.student_id AND cps.month_key = mc.month_key
        )
        ORDER BY month_key DESC LIMIT 36`,
          )
          .bind(student.id, student.id)
          .all<{
            id: string;
            month_key: string;
            status: "no_submission" | "awaiting_payment" | "paid";
            submitted_at: string | null;
            paid_at: string | null;
            updated_at: string;
            expected: number;
            proof_id: string | null;
            proof_status:
              | "awaiting_upload"
              | "pending_review"
              | "approved"
              | "denied"
              | null;
            proof_submitted_at: string | null;
            proof_reviewed_at: string | null;
            proof_student_visible_note: string | null;
            proof_object_key: string | null;
            proof_content_type: string | null;
            proof_owner_student_id: string | null;
          }>()
      : null;

  const uploadTokens = new Map<string, string>();
  const uploadTokenExpiry = new Date(
    Date.now() + ACCESS_SESSION_MINUTES * 60 * 1000,
  ).toISOString();
  const refreshableProofIds = Array.from(
    new Set(
      (proofRequestResult.results || [])
        .filter(
          (entry) =>
            entry.proof_owner_student_id === student.id &&
            (entry.status === "awaiting_upload" || entry.status === "denied"),
        )
        .map((entry) => entry.id),
    ),
  );
  if (refreshableProofIds.length) {
    const tokenStatements: D1PreparedStatement[] = [];
    for (const proofId of refreshableProofIds) {
      const uploadToken = randomToken();
      uploadTokens.set(proofId, uploadToken);
      tokenStatements.push(
        db
          .prepare(
            `UPDATE payment_proofs SET upload_token_hash = ?, upload_token_expires_at = ?, updated_at = ?
        WHERE id = ? AND status IN ('awaiting_upload', 'denied')`,
          )
          .bind(
            await sha256Hex(uploadToken),
            uploadTokenExpiry,
            new Date().toISOString(),
            proofId,
          ),
      );
    }
    await db.batch(tokenStatements);
  }

  const proof = (entry: {
    proof_id: string | null;
    proof_status:
      "awaiting_upload" | "pending_review" | "approved" | "denied" | null;
    proof_submitted_at: string | null;
    proof_reviewed_at: string | null;
    proof_student_visible_note: string | null;
    proof_object_key: string | null;
    proof_content_type: string | null;
    proof_owner_student_id?: string | null;
  }) =>
    entry.proof_id && entry.proof_status
      ? {
          id: entry.proof_id,
          status: entry.proof_status,
          submittedAt: entry.proof_submitted_at || null,
          reviewedAt: entry.proof_reviewed_at || null,
          studentVisibleNote: entry.proof_student_visible_note || null,
          fileAvailable:
            Boolean(entry.proof_object_key) &&
            (!entry.proof_owner_student_id ||
              entry.proof_owner_student_id === student.id),
          contentType: entry.proof_content_type || null,
          uploadToken: uploadTokens.get(entry.proof_id) || null,
        }
      : null;

  const aatContributions = (aatResult.results || []).map((entry) => ({
    id: entry.id,
    paymentDate: entry.payment_date,
    renewalDueDate: entry.renewal_due_date || null,
    amount: entry.amount === null ? null : Number(entry.amount),
    currency: entry.currency,
    status: entry.status,
    proof: proof(entry),
  }));
  const latestPaidAat = aatContributions
    .filter((entry) => entry.status === "paid")
    .sort((left, right) =>
      right.paymentDate.localeCompare(left.paymentDate),
    )[0];
  const membership = aatMembershipStatus(
    student.aat_number,
    latestPaidAat?.paymentDate || "",
  );
  const currentAatProof =
    aatContributions.find((entry) => entry.status === "awaiting_payment")
      ?.proof || null;
  const aatSummary = {
    state:
      currentAatProof?.status === "pending_review"
        ? ("submitted_for_review" as const)
        : currentAatProof?.status === "awaiting_upload" ||
            currentAatProof?.status === "denied"
          ? ("payslip_needed" as const)
          : membership.state === "current"
            ? ("up_to_date" as const)
            : membership.state === "expiring"
              ? ("due_soon" as const)
              : ("payment_record_missing" as const),
    lastVerifiedPayment: latestPaidAat?.paymentDate || null,
    nextDueDate: membership.dueDate,
  };

  const hourRequests = (hourRequestResult.results || []).map((entry) => ({
    id: entry.id,
    type: "training_hours" as const,
    title: "Verified training hours",
    previousValue: `${Number(entry.previous_total || 0)} hours`,
    requestedValue: `${Number(entry.requested_total || 0)} hours · ${entry.organization || entry.source_details || entry.source_type || "source not supplied"} · ${entry.training_date || "date not supplied"}`,
    submittedAt: entry.submitted_at,
    decisionAt: entry.reviewed_at || null,
    studentVisibleNote: entry.student_visible_note || null,
    status: studentRequestStatus(entry.status),
    paymentStatus: null,
    documentStatus: null,
    period: null,
    explanation:
      entry.status === "approved"
        ? "The approved hours have been added to your verified record."
        : entry.status === "rejected"
          ? "This request was not approved. Please review the note from your sensei below."
          : "This request is waiting for a sensei to review it.",
  }));
  const examRequests = (examRequestResult.results || []).map((entry) => ({
    id: entry.id,
    type: "examination_application" as const,
    title: `Examination application: ${entry.attempted_rank}`,
    previousValue: entry.current_rank,
    requestedValue: entry.attempted_rank,
    submittedAt: entry.submitted_at,
    decisionAt:
      entry.status === "application_submitted"
        ? null
        : entry.completed_at || entry.updated_at,
    studentVisibleNote: entry.student_visible_decision_note || null,
    status: studentRequestStatus(entry.status),
    paymentStatus: entry.payment_status,
    documentStatus: null,
    period: null,
    explanation:
      entry.status === "rejected"
        ? "This application was not approved. Please review the note from your sensei below."
        : entry.status === "examination_completed"
          ? "The examination workflow has been completed."
          : "Your application has been received and is waiting for review.",
  }));
  const contributionRequests = [
    ...aatContributions
      .filter((entry) => entry.status !== "paid")
      .map((entry) => ({
        id: `aat:${entry.id}`,
        type: "aat_contribution" as const,
        title: "AAT annual contribution",
        previousValue: null,
        requestedValue: entry.paymentDate,
        submittedAt: entry.paymentDate,
        decisionAt: entry.proof?.reviewedAt || null,
        studentVisibleNote: entry.proof?.studentVisibleNote || null,
        status:
          entry.proof?.status === "denied"
            ? ("denied" as const)
            : entry.status === "paid"
              ? ("approved" as const)
              : ("pending" as const),
        paymentStatus: entry.status,
        documentStatus: entry.proof?.status || "awaiting_upload",
        period: entry.paymentDate.slice(0, 4),
        explanation:
          entry.proof?.status === "denied"
            ? "The submitted payslip was not approved. Please review the note from your sensei below."
            : entry.proof?.status === "pending_review"
              ? "A payslip has been submitted and is waiting for review."
              : "This contribution is waiting for a payslip or payment review.",
      })),
    ...(monthlyResult?.results || [])
      .filter((entry) => entry.status !== "no_submission")
      .map((entry) => ({
        id: `monthly:${entry.id}`,
        type: "monthly_contribution" as const,
        title: `RenShinKan monthly contribution: ${entry.month_key}`,
        previousValue: null,
        requestedValue: entry.month_key,
        submittedAt: entry.submitted_at || entry.updated_at,
        decisionAt: entry.proof_reviewed_at || entry.paid_at || null,
        studentVisibleNote: entry.proof_student_visible_note || null,
        status:
          entry.proof_status === "denied"
            ? ("denied" as const)
            : entry.status === "paid"
              ? ("approved" as const)
              : ("pending" as const),
        paymentStatus: entry.status,
        documentStatus: entry.proof_status || "awaiting_upload",
        period: entry.month_key,
        explanation:
          entry.proof_status === "denied"
            ? "The submitted payslip was not approved. Please review the note from your sensei below."
            : entry.status === "paid"
              ? "This monthly contribution has been verified."
              : entry.proof_status === "pending_review"
                ? "A payslip has been submitted and is waiting for review."
                : "This contribution is waiting for a payslip.",
      })),
  ];
  const proofRequests = (proofRequestResult.results || [])
    .filter(
      (entry) =>
        entry.payment_type !== "renshinkan_monthly" ||
        student.dojo_id === DEFAULT_DOJO_ID,
    )
    .map((entry) => ({
      id: `proof:${entry.id}`,
      type: "payslip" as const,
      title: `${entry.payment_type === "exam" ? "Examination" : entry.payment_type === "aat_annual" ? "AAT annual contribution" : "Monthly contribution"} payslip`,
      previousValue: null,
      requestedValue: "Payslip submitted for review",
      submittedAt: entry.submitted_at || new Date(0).toISOString(),
      decisionAt: entry.reviewed_at || null,
      studentVisibleNote: entry.student_visible_note || null,
      status:
        entry.status === "approved"
          ? ("approved" as const)
          : entry.status === "denied"
            ? ("denied" as const)
            : ("pending" as const),
      paymentStatus: null,
      documentStatus: entry.status,
      period: entry.period || null,
      explanation:
        entry.status === "approved"
          ? "Your payslip has been verified."
          : entry.status === "denied"
            ? "This payslip was not approved. Please review the note from your sensei below."
            : entry.status === "pending_review"
              ? "A payslip has been submitted and is waiting for review."
              : "A payslip has not been uploaded yet.",
    }));
  const profileRequest = student.created_at
    ? [
        {
          id: `profile:${student.id}`,
          type: "profile_information" as const,
          title: "Student profile request",
          previousValue: null,
          requestedValue: "Create a usable student profile",
          submittedAt: student.created_at,
          decisionAt: student.profile_reviewed_at || null,
          studentVisibleNote: student.profile_student_visible_note || null,
          status: studentRequestStatus(student.profile_status || "approved"),
          paymentStatus: null,
          documentStatus: null,
          period: null,
          explanation:
            student.profile_status === "approved"
              ? "Your student profile is approved and available in this passport."
              : "Your profile is usable now and is pending administrator review.",
        },
      ]
    : [];
  const requests = [
    ...profileRequest,
    ...hourRequests,
    ...examRequests,
    ...contributionRequests,
    ...proofRequests,
  ]
    .filter((entry) => entry.submittedAt !== new Date(0).toISOString())
    .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt));

  const monthlyContributions = monthlyResult
    ? (monthlyResult.results || []).map((entry) => ({
        id: entry.id,
        month: entry.month_key,
        status: entry.status,
        submittedAt: entry.submitted_at || null,
        paidAt: entry.paid_at || null,
        updatedAt: entry.updated_at,
        expected: entry.expected === 1,
        proof: proof(entry),
      }))
    : null;
  const currentMonth = currentBangkokMonthKey();
  const currentMonthly =
    monthlyContributions?.find((entry) => entry.month === currentMonth) || null;
  const pendingAat =
    aatContributions.find((entry) => entry.status === "awaiting_payment") ||
    null;
  const nowIso = new Date().toISOString();
  const attemptedRank = nextRank(student.current_belt);
  const examinationOpen = Boolean(
    activeExamCycle &&
    activeExamCycle.lifecycle_status === "open" &&
    (!activeExamCycle.application_opens_at ||
      nowIso >= activeExamCycle.application_opens_at) &&
    (!activeExamCycle.application_closes_at ||
      nowIso <= activeExamCycle.application_closes_at) &&
    (!activeExamCycle.examination_at ||
      nowIso <= activeExamCycle.examination_at) &&
    attemptedRank &&
    examinationFeeThb(attemptedRank) !== null,
  );
  const alertDecisions = decideStudentPaymentAlerts({
    isRenshinKan: student.dojo_id === DEFAULT_DOJO_ID,
    currentMonth,
    monthly: currentMonthly
      ? {
          id: currentMonthly.id,
          month: currentMonthly.month,
          expected: currentMonthly.expected,
          paymentStatus: currentMonthly.status,
          proofStatus: currentMonthly.proof?.status || null,
        }
      : null,
    aat: {
      id: pendingAat?.id || `aat:${student.id}`,
      hasMembershipNumber: Boolean(student.aat_number?.trim()),
      membershipState: membership.state,
      proofStatus: pendingAat?.proof?.status || null,
    },
    examination:
      activeExamCycle && attemptedRank
        ? {
            id: activeExamCycle.id,
            attemptedRank,
            open: examinationOpen,
            alreadyApplied: (examRequestResult.results || []).some(
              (entry) => entry.cycle_id === activeExamCycle.id,
            ),
          }
        : null,
  });
  const paymentAlerts = alertDecisions.map((decision) => {
    if (decision.type === "monthly_missing") {
      return {
        ...decision,
        period: currentMonthly?.month || null,
        attemptedRank: null,
        proof: currentMonthly?.proof || null,
      };
    }
    if (decision.type === "aat_number_missing") {
      return {
        ...decision,
        period: null,
        attemptedRank: null,
        proof: null,
      };
    }
    if (decision.type === "aat_contribution_due") {
      return {
        ...decision,
        period: null,
        attemptedRank: null,
        proof: pendingAat?.proof || null,
      };
    }
    return {
      ...decision,
      period: null,
      attemptedRank: attemptedRank || null,
      proof: null,
    };
  });

  return {
    ...base,
    registrationDate:
      student.account_created_date || student.created_at || null,
    accountCreatedDate:
      student.account_created_date || student.created_at || null,
    dojoJoinedDate: student.dojo_joined_date || null,
    dojoId: student.dojo_id || "",
    dojoLogo: student.dojo_logo || null,
    aatNumber: student.aat_number || null,
    practiceDuration: student.practice_duration || null,
    trainingEntries: (trainingResult.results || []).map((entry) => ({
      id: entry.id,
      entryDate: entry.entry_date || entry.created_at,
      periodEnd: entry.period_end || null,
      hours: Number(entry.verified_hours || 0),
      source: entry.source,
      location: entry.training_location || null,
      sourceType: entry.source_type || null,
      organization: entry.organization || null,
      sourceDetails: entry.source_details || null,
      notes: entry.notes || null,
      verified: true as const,
    })),
    aatContributions,
    aatSummary,
    monthlyContributions,
    paymentAlerts,
    requests,
  };
}

export function genericLookupFailure(status = 404) {
  return jsonResponse(
    {
      error: "Check the name and Student ID and try again.",
    },
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
  administratorName?: string | null;
  administratorRole?: string | null;
  selectedDojoId?: string | null;
  ipAddress?: string | null;
  countryCode?: string | null;
  userAgent?: string | null;
  outcome?: "success" | "failure";
};

export function adminAuditMetadata(session: AdminSession, request: Request) {
  return {
    actorIdentifier: session.accountId,
    administratorName: session.adminName,
    administratorRole: effectivePermissionLevel(session),
    selectedDojoId: session.selectedDojoId,
    ipAddress: request.headers.get("CF-Connecting-IP"),
    countryCode: request.headers.get("CF-IPCountry"),
    userAgent: (request.headers.get("User-Agent") || "").slice(0, 500),
  };
}

function structuredValue(value: unknown) {
  return value === undefined ? null : JSON.stringify(value);
}

export function auditStatement(db: D1Database, input: AuditInput) {
  const createdAt = input.createdAt || new Date().toISOString();
  return db
    .prepare(
      `INSERT INTO audit_log (
      id, admin_action, record_type, record_id, action_summary, created_at,
      actor_type, actor_identifier, action, entity_type, entity_id, student_id,
      previous_values, new_values, source, bulk_operation_id, request_id, administrator_note,
      student_public_id_snapshot, student_name_snapshot, exam_cycle_id, contribution_month,
      administrator_name, administrator_role, selected_dojo_id, ip_address, country_code, user_agent, outcome
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      input.action,
      input.entityType,
      input.entityId,
      input.summary.slice(0, 300),
      createdAt,
      input.actorType,
      input.actorIdentifier.slice(0, 160),
      input.action,
      input.entityType,
      input.entityId,
      input.studentId || null,
      structuredValue(input.previousValues),
      structuredValue(input.newValues),
      input.source,
      input.bulkOperationId || null,
      input.requestId,
      input.administratorNote?.slice(0, 2000) || null,
      input.studentPublicId?.slice(0, 80) || null,
      input.studentNameSnapshot?.slice(0, 160) || null,
      input.examCycleId || null,
      input.contributionMonth || null,
      input.administratorName?.slice(0, 120) || null,
      input.administratorRole || null,
      input.selectedDojoId || null,
      input.ipAddress || null,
      input.countryCode?.slice(0, 8) || null,
      input.userAgent?.slice(0, 500) || null,
      input.outcome || "success",
    );
}

export async function audit(db: D1Database, input: AuditInput) {
  await auditStatement(db, input).run();
}

export function normalizedRankOrError(value: unknown) {
  const rank = normalizeRank(value);
  if (!rank)
    throw new Error("Choose a valid rank from the official progression.");
  return rank;
}
