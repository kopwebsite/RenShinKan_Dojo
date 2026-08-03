import { promoteRank } from "../../shared/ranks";
import { isCanonicalDate } from "../../shared/date";
import {
  canAccessAdminPath,
  normalizeAdminPath,
  type AdminPermission,
} from "../../shared/adminPermissions";
import {
  canAccessDojo,
  effectivePermissionLevel,
  getAuthorizedAdminSession,
  isRenShinKanSuperAdmin,
  isSameOriginRequest,
  jsonResponse,
  type AdminSession,
} from "./auth";
import { consumeRateLimit } from "./rateLimit";
import {
  adminAuditMetadata,
  auditStatement,
  currentBangkokMonthKey,
  hmacHex,
  requestIdentifier,
  requireStudentDb,
  sha256Hex,
  type D1Database,
  type D1PreparedStatement,
  type StudentEnv,
} from "./studentRecords";

type WorkersAiBinding = {
  run(
    model: string,
    input: unknown,
    options?: { signal?: AbortSignal },
  ): Promise<unknown>;
};

export type AdminAuggieEnv = StudentEnv & {
  AI?: WorkersAiBinding;
  ADMIN_AUGGIE_MODEL?: string;
};

export type AdminAuggieLocale = "en" | "th";

export type AdminAuggieContext = {
  request: Request;
  env: AdminAuggieEnv;
  db: D1Database;
  session: AdminSession;
  permission: AdminPermission;
  locale: AdminAuggieLocale;
  currentPath: string;
  requestId: string;
};

type StudentTarget = {
  id: string;
  publicId: string;
  name: string;
  dojoId: string;
  dojoName: string;
  currentRank: string;
  active: number;
  profileStatus: string;
  publicVisible: number;
  publicVisibleBeforeArchive: number | null;
  archivedAt: string | null;
  deletedAt: string | null;
  updatedAt: string;
  totalHours: number;
};

type StoredTarget = StudentTarget & { expectedState: string };

type OperationArgs = {
  action: "archive" | "restore";
  targets: StoredTarget[];
  contributionGuard?: {
    monthKey: string;
    periodExpected: boolean;
    snapshotTargetIds: string[];
  };
};

type GuidedBulkArgs = {
  action:
    | "add_hours"
    | "approve_pending_hours"
    | "mass_rank_change"
    | "mass_promotion";
  targets: StoredTarget[];
  hours?: number;
  levels?: number;
  location?: string;
  examinationDate?: string;
  pendingRequestCount?: number;
  pendingHours?: number;
};

type OperationRow = {
  id: string;
  idempotency_key: string;
  account_id: string;
  session_hash: string;
  selected_dojo_id: string;
  permission_level: AdminPermission;
  tool_name: string;
  execution_mode: "direct" | "guided";
  status:
    | "prepared"
    | "guided"
    | "succeeded"
    | "failed"
    | "expired"
    | "undone"
    | "cancelled";
  normalized_args_json: string;
  args_sha256: string;
  preview_json: string;
  fingerprints_json: string;
  result_fingerprints_json: string | null;
  confirmation_sha256: string | null;
  request_id: string;
  undo_of_operation_id: string | null;
  undone_by_operation_id: string | null;
  expires_at: string;
  undo_expires_at: string | null;
  confirmed_at: string | null;
  completed_at: string | null;
  result_json: string | null;
  error_code: string | null;
  payload_expires_at: string;
  payload_scrubbed_at: string | null;
  created_at: string;
  updated_at: string;
};

type ToolCall = { name: string; arguments: unknown };

export class AdminAuggieError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = "ADMIN_AUGGIE_REQUEST_INVALID",
  ) {
    super(message);
  }
}

export function adminAuggieErrorResponse(error: unknown, request: Request) {
  const known =
    error instanceof AdminAuggieError
      ? error
      : new AdminAuggieError(
          "Admin Auggie failed safely. Administration itself is unchanged.",
          500,
          "ADMIN_AUGGIE_INTERNAL",
        );
  return jsonResponse(
    {
      ok: false,
      error: known.message,
      code: known.code,
      requestId: requestIdentifier(request),
    },
    known.status,
    { "Cache-Control": "private, no-store" },
  );
}

const MODEL_ALLOWLIST = new Set([
  "@cf/zai-org/glm-4.7-flash",
  "@cf/openai/gpt-oss-120b",
]);
const DEFAULT_MODEL = "@cf/zai-org/glm-4.7-flash";
const MAX_BODY_BYTES = 8 * 1024;
const MAX_MESSAGE_CHARS = 1_600;
const MAX_TARGETS = 50;
const OPERATION_TTL_MS = 10 * 60 * 1_000;
const UNDO_TTL_MS = 30 * 60 * 1_000;
const AI_TIMEOUT_MS = 18_000;
const STUDENT_ID = /^[A-Z0-9]{2,8}-\d{4,}$/;

function localized(locale: AdminAuggieLocale, english: string, thai: string) {
  return locale === "th" ? thai : english;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function cleanText(value: unknown, max: number) {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFKC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, max + 1);
}

function parseStudentIds(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_TARGETS)
    throw new AdminAuggieError("Choose between 1 and 50 exact Student IDs.");
  const ids = Array.from(
    new Set(
      value.map((entry) => cleanText(entry, 40).toLocaleUpperCase("en-US")),
    ),
  );
  if (
    ids.length < 1 ||
    ids.length > MAX_TARGETS ||
    ids.some((id) => !STUDENT_ID.test(id))
  )
    throw new AdminAuggieError(
      "Use the exact public Student IDs shown in administration.",
    );
  return ids;
}

function safeJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function statusState(
  target: Pick<
    StudentTarget,
    | "active"
    | "archivedAt"
    | "deletedAt"
    | "updatedAt"
    | "publicVisible"
    | "publicVisibleBeforeArchive"
    | "profileStatus"
  >,
) {
  return [
    target.active,
    target.archivedAt || "",
    target.deletedAt || "",
    target.updatedAt,
    target.publicVisible,
    target.publicVisibleBeforeArchive == null
      ? ""
      : target.publicVisibleBeforeArchive,
    target.profileStatus,
  ].join("|");
}

const STATUS_STATE_SQL = `CAST(active AS TEXT) || '|' || COALESCE(archived_at, '') || '|' ||
  COALESCE(deleted_at, '') || '|' || COALESCE(updated_at, '') || '|' || CAST(public_visible AS TEXT) || '|' ||
  COALESCE(CAST(public_visible_before_archive AS TEXT), '') || '|' || COALESCE(profile_status, '')`;

const SENSITIVE_VALUE_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  [
    "identity_document",
    /\b(?:passport|national[ _-]?id|citizen[ _-]?id|social security|ssn)\b(?:\s+(?:number|no\.?))?\s*(?:is|=|:|#)\s*[a-z0-9][a-z0-9 -]{5,}/iu,
  ],
  [
    "identity_document",
    /\b(?:passport|national[ _-]?id|citizen[ _-]?id)\s+(?:number|no\.?)\s+[a-z0-9][a-z0-9-]{5,}\b/iu,
  ],
  [
    "identity_document",
    /(?:หนังสือเดินทาง|เลขบัตร(?:ประชาชน)?|บัตรประชาชน)\s*(?:เลขที่|คือ|=|:)?\s*[a-z0-9๐-๙][a-z0-9๐-๙ -]{5,}/iu,
  ],
  ["identity_document", /\b\d(?:[ -]?\d){12}\b/u],
  [
    "credential",
    /\b(?:password|passcode|secret|api[ _-]?key|access[ _-]?token|refresh[ _-]?token|authorization|cookie|session[ _-]?id)\b\s*(?:is|=|:)\s*[^\s,;]{4,}/iu,
  ],
  ["credential", /\bbearer\s+[a-z0-9._~-]{8,}/iu],
  ["credential", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/u],
  ["credential", /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/u],
  ["credential", /\bsk-[A-Za-z0-9_-]{20,}\b/u],
  ["credential", /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/u],
  ["credential", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u],
  [
    "credential",
    /(?:รหัสผ่าน|รหัสลับ|โทเคน|คุกกี้|รหัสเซสชัน|คีย์ลับ)\s*(?:คือ|=|:)\s*[^\s,;]{4,}/iu,
  ],
  [
    "credential",
    /\beyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\b/u,
  ],
  ["credential", /\brsk_admin_session\s*=\s*[^\s;]{8,}/iu],
  [
    "email",
    /\b[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+\b/iu,
  ],
  [
    "private_url",
    /https?:\/\/[^\s]*(?:\/share(?:d)?\/|\/admin\/|[?&](?:token|key|signature|sig|secret)=)[^\s]*/iu,
  ],
  [
    "financial",
    /\b(?:card|credit card|debit card|bank account|account number)\b(?:\s+(?:number|no\.?))?\s*(?:is|=|:|#)\s*\d[\d -]{5,}/iu,
  ],
  [
    "financial",
    /(?:เลขบัตรเครดิต|เลขบัตรเดบิต|บัญชีธนาคาร|เลขบัญชี)\s*(?:คือ|=|:)?\s*[0-9๐-๙][0-9๐-๙ -]{5,}/iu,
  ],
  ["financial", /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/u],
  [
    "private_note",
    /\b(?:private|internal|admin(?:istrator)?)\s+notes?\s*(?:is|are|=|:)\s*\S.+/iu,
  ],
  [
    "private_note",
    /(?:หมายเหตุส่วนตัว|หมายเหตุภายใน|หมายเหตุผู้ดูแล)\s*(?:คือ|=|:)\s*\S.+/iu,
  ],
  [
    "questionnaire_answer",
    /\b(?:questionnaire|application)\s+answers?\s*(?:is|are|=|:)\s*\S.+/iu,
  ],
  ["questionnaire_answer", /คำตอบ(?:ใน)?แบบสอบถาม\s*(?:คือ|=|:)\s*\S.+/iu],
];

function hasSensitivePhoneValue(message: string) {
  const candidates = message.match(/(?:\+?\d[\d ().-]{7,}\d)/g) || [];
  return candidates.some((candidate) => {
    const digits = candidate.replace(/\D/g, "");
    return digits.length >= 9 && digits.length <= 15;
  });
}

export function detectSensitiveAdminAuggieInput(message: string) {
  for (const [code, pattern] of SENSITIVE_VALUE_PATTERNS) {
    if (pattern.test(message)) return code;
  }
  return hasSensitivePhoneValue(message) ? "phone" : null;
}

function sessionSecret(env: AdminAuggieEnv) {
  const secret = env.SESSION_SECRET?.trim() || "";
  if (secret.length < 32)
    throw new AdminAuggieError(
      "Administrator security configuration is unavailable.",
      503,
      "ADMIN_AUGGIE_CONFIGURATION",
    );
  return secret;
}

async function sessionHash(env: AdminAuggieEnv, session: AdminSession) {
  return hmacHex(
    sessionSecret(env),
    `admin-auggie-session\n${session.sessionId}`,
  );
}

export async function scrubExpiredAdminAuggiePayloads(
  db: D1Database,
  now = new Date().toISOString(),
  requestedLimit = 50,
) {
  const limit = Math.min(1_000, Math.max(1, Math.trunc(requestedLimit)));
  // D1 permits at most 100 bound parameters per statement. The update binds
  // four timestamps in addition to the operation IDs because it repeats the
  // eligibility predicate inside the write, so keep every batch at 96 IDs.
  const maxIdsPerBatch = 96;
  let scrubbed = 0;
  let examined = 0;
  while (examined < limit) {
    const chunkLimit = Math.min(maxIdsPerBatch, limit - examined);
    const rows = (
      await db
        .prepare(
          `SELECT id FROM admin_ai_operations
          WHERE payload_scrubbed_at IS NULL AND payload_expires_at <= ?
            AND (status IN ('guided', 'succeeded', 'failed', 'expired', 'undone', 'cancelled')
              OR (status = 'prepared' AND expires_at <= ?))
          ORDER BY payload_expires_at, id LIMIT ?`,
        )
        .bind(now, now, chunkLimit)
        .all<{ id: string }>()
    ).results;
    const ids = (rows || []).map((row) => row.id);
    if (!ids.length) break;
    const placeholders = ids.map(() => "?").join(",");
    const results = await db.batch([
      db
        .prepare(
          `UPDATE admin_ai_operations SET
            normalized_args_json = '{"scrubbed":true}', args_sha256 = 'scrubbed',
            preview_json = '{}', fingerprints_json = '{}',
            result_fingerprints_json = NULL, confirmation_sha256 = NULL,
            result_json = NULL, payload_scrubbed_at = ?, updated_at = ?
          WHERE id IN (${placeholders}) AND payload_scrubbed_at IS NULL
            AND payload_expires_at <= ?
            AND (status IN ('guided', 'succeeded', 'failed', 'expired', 'undone', 'cancelled')
              OR (status = 'prepared' AND expires_at <= ?))`,
        )
        .bind(now, now, ...ids, now, now),
      db
        .prepare(
          `DELETE FROM admin_ai_execution_guards WHERE operation_id IN (
            SELECT id FROM admin_ai_operations
            WHERE id IN (${placeholders}) AND payload_scrubbed_at = ?
          )`,
        )
        .bind(...ids, now),
      db
        .prepare(
          `DELETE FROM admin_ai_operation_state_guards WHERE operation_id IN (
            SELECT id FROM admin_ai_operations
            WHERE id IN (${placeholders}) AND payload_scrubbed_at = ?
          )`,
        )
        .bind(...ids, now),
      db
        .prepare(
          `DELETE FROM admin_ai_execution_claims WHERE operation_id IN (
            SELECT id FROM admin_ai_operations
            WHERE id IN (${placeholders}) AND payload_scrubbed_at = ?
          )`,
        )
        .bind(...ids, now),
    ]);
    examined += ids.length;
    scrubbed += Number(results[0]?.meta?.changes ?? ids.length);
    if (ids.length < chunkLimit) break;
  }
  return scrubbed;
}

export async function parseBoundedJson(
  request: Request,
  allowedKeys: readonly string[],
) {
  const contentType =
    request.headers.get("Content-Type")?.toLocaleLowerCase("en-US") || "";
  if (contentType.split(";", 1)[0].trim() !== "application/json")
    throw new AdminAuggieError(
      "Send a JSON request.",
      415,
      "ADMIN_AUGGIE_CONTENT_TYPE",
    );
  const lengthHeader = request.headers.get("Content-Length")?.trim() || "";
  if (lengthHeader && !/^\d+$/.test(lengthHeader))
    throw new AdminAuggieError(
      "The content length is invalid.",
      400,
      "ADMIN_AUGGIE_BODY_LIMIT",
    );
  const declared = lengthHeader ? Number(lengthHeader) : 0;
  if (!Number.isSafeInteger(declared) || declared > MAX_BODY_BYTES)
    throw new AdminAuggieError(
      "The request is too large.",
      413,
      "ADMIN_AUGGIE_BODY_LIMIT",
    );
  const reader = request.body?.getReader();
  const decoder = new TextDecoder("utf-8", {
    fatal: true,
    ignoreBOM: false,
  });
  let bytes = 0;
  let text = "";
  if (reader) {
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > MAX_BODY_BYTES) {
          await reader.cancel("admin-auggie-body-limit").catch(() => undefined);
          throw new AdminAuggieError(
            "The request is too large.",
            413,
            "ADMIN_AUGGIE_BODY_LIMIT",
          );
        }
        text += decoder.decode(chunk.value, { stream: true });
      }
      text += decoder.decode();
    } catch (error) {
      if (error instanceof AdminAuggieError) throw error;
      throw new AdminAuggieError(
        "The request body is invalid.",
        400,
        "ADMIN_AUGGIE_BODY_INVALID",
      );
    } finally {
      reader.releaseLock();
    }
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new AdminAuggieError("The JSON request is invalid.");
  }
  const object = objectValue(value);
  if (!object || !exactKeys(object, allowedKeys))
    throw new AdminAuggieError("The request contains unsupported fields.");
  return object;
}

export async function requireAdminAuggieContext(
  request: Request,
  env: AdminAuggieEnv,
  locale: AdminAuggieLocale = "en",
  currentPath = "/admin/dashboard",
) {
  if (!isSameOriginRequest(request))
    throw new AdminAuggieError("Forbidden.", 403, "ADMIN_AUGGIE_FORBIDDEN");
  const session = await getAuthorizedAdminSession(request, env);
  if (!session)
    throw new AdminAuggieError(
      "Administrator sign-in is required.",
      401,
      "ADMIN_AUGGIE_UNAUTHORIZED",
    );
  const permission = effectivePermissionLevel(session);
  const normalizedPath = normalizeAdminPath(currentPath);
  const db = requireStudentDb(env);
  await scrubExpiredAdminAuggiePayloads(db);
  return {
    request,
    env,
    db,
    session,
    permission,
    locale,
    currentPath: canAccessAdminPath(normalizedPath, permission)
      ? normalizedPath
      : "/admin/dashboard",
    requestId: requestIdentifier(request),
  } satisfies AdminAuggieContext;
}

type Destination = {
  key: string;
  path: string;
  domain: string;
  manualOnly?: boolean;
  en: string;
  th: string;
};

const DESTINATIONS: Destination[] = [
  {
    key: "dashboard",
    path: "/admin/dashboard",
    domain: "dashboard",
    en: "Open the dashboard and its current queues.",
    th: "เปิดแดชบอร์ดและคิวงานปัจจุบัน",
  },
  {
    key: "students",
    path: "/admin/students",
    domain: "students",
    en: "Open student records. Permanent deletion, full private-data edits, uploads, and sharing stay in the existing reviewed interface.",
    th: "เปิดระเบียนนักเรียน การลบถาวร การแก้ไขข้อมูลส่วนตัว การอัปโหลด และการแชร์ ต้องทำในหน้าจอเดิมที่มีการตรวจสอบ",
  },
  {
    key: "profile_requests",
    path: "/admin/profile-requests",
    domain: "profile requests",
    manualOnly: true,
    en: "Open profile requests. Inspect private images and approve them manually.",
    th: "เปิดคำขอโปรไฟล์ โปรดตรวจรูปภาพส่วนตัวและอนุมัติด้วยตนเอง",
  },
  {
    key: "training_requests",
    path: "/admin/training-requests",
    domain: "training requests",
    en: "Open training-hour requests and the existing confirmation workflow.",
    th: "เปิดคำขอชั่วโมงฝึกและขั้นตอนยืนยันเดิม",
  },
  {
    key: "exam_applications",
    path: "/admin/exam-applications",
    domain: "examinations",
    en: "Open examination applications. Private questionnaire answers remain in the existing interface.",
    th: "เปิดใบสมัครสอบ คำตอบแบบสอบถามส่วนตัวยังคงอยู่ในหน้าจอเดิม",
  },
  {
    key: "examination_records",
    path: "/admin/examination-records",
    domain: "examination records",
    en: "Open examination records and exports.",
    th: "เปิดประวัติการสอบและการส่งออก",
  },
  {
    key: "exam_payment_proofs",
    path: "/admin/exam-payslips",
    domain: "exam payment proofs",
    manualOnly: true,
    en: "Open private exam-payment proofs. A person must inspect evidence before deciding.",
    th: "เปิดหลักฐานชำระค่าสอบส่วนตัว ต้องมีผู้ตรวจหลักฐานก่อนตัดสินใจ",
  },
  {
    key: "monthly_contributions",
    path: "/admin/monthly-contributions",
    domain: "monthly contributions",
    manualOnly: true,
    en: "Open the RenShinKan monthly ledger. Financial status changes remain in its confirmed interface.",
    th: "เปิดบัญชีรายเดือนของ RenShinKan การเปลี่ยนสถานะทางการเงินต้องทำในหน้าจอที่มีการยืนยัน",
  },
  {
    key: "aat_contributions",
    path: "/admin/aat-contributions",
    domain: "AAT contributions",
    manualOnly: true,
    en: "Open AAT annual contributions. Paid and reversal entries remain manually confirmed.",
    th: "เปิดเงินสมทบ AAT รายปี รายการชำระและย้อนกลับต้องยืนยันด้วยตนเอง",
  },
  {
    key: "payment_proofs",
    path: "/admin/payment-proofs",
    domain: "payment proofs",
    manualOnly: true,
    en: "Open private payment proofs. Auggie never approves evidence it cannot inspect safely.",
    th: "เปิดหลักฐานการชำระเงินส่วนตัว Auggie จะไม่อนุมัติหลักฐานที่ไม่สามารถตรวจอย่างปลอดภัย",
  },
  {
    key: "memberships",
    path: "/admin/memberships",
    domain: "memberships",
    manualOnly: true,
    en: "Open membership cards. Generation, downloads, and any membership-data changes stay in the reviewed interface.",
    th: "เปิดบัตรสมาชิก การสร้าง ดาวน์โหลด และแก้ไขข้อมูลสมาชิกต้องทำในหน้าจอที่มีการตรวจสอบ",
  },
  {
    key: "website",
    path: "/admin/website",
    domain: "website and newsletters",
    manualOnly: true,
    en: "Open website and newsletter management. Publishing, media uploads, tests, sends, and deletes stay manual.",
    th: "เปิดการจัดการเว็บไซต์และจดหมายข่าว การเผยแพร่ อัปโหลด ทดสอบ ส่ง และลบ ต้องทำด้วยตนเอง",
  },
  {
    key: "gallery_on_the_mat",
    path: "/admin/galleries/on-the-mat",
    domain: "galleries",
    manualOnly: true,
    en: "Open the On the Mat gallery. Uploads, trash, draft saves, and publishing stay manual.",
    th: "เปิดแกลเลอรี On the Mat การอัปโหลด ถังขยะ บันทึกร่าง และเผยแพร่ ต้องทำด้วยตนเอง",
  },
  {
    key: "gallery_history",
    path: "/admin/galleries/history",
    domain: "galleries",
    manualOnly: true,
    en: "Open the History gallery. Gallery writes stay manual.",
    th: "เปิดแกลเลอรีประวัติ การแก้ไขแกลเลอรีต้องทำด้วยตนเอง",
  },
  {
    key: "gallery_achievements",
    path: "/admin/galleries/achievements",
    domain: "galleries",
    manualOnly: true,
    en: "Open the Achievements gallery. Gallery writes stay manual.",
    th: "เปิดแกลเลอรีผลงาน การแก้ไขแกลเลอรีต้องทำด้วยตนเอง",
  },
  {
    key: "downloads",
    path: "/admin/downloads",
    domain: "downloads",
    manualOnly: true,
    en: "Open downloads. PDF uploads, replacements, publishing, archiving, and deletion stay manual.",
    th: "เปิดไฟล์ดาวน์โหลด การอัปโหลด แทนที่ เผยแพร่ เก็บถาวร และลบ PDF ต้องทำด้วยตนเอง",
  },
  {
    key: "dojos",
    path: "/admin/dojos",
    domain: "dojo settings",
    manualOnly: true,
    en: "Open dojo settings. Identity, contact, active-state, and ordering changes stay manual.",
    th: "เปิดการตั้งค่าโดโจ การเปลี่ยนข้อมูลติดต่อ สถานะ และลำดับ ต้องทำด้วยตนเอง",
  },
  {
    key: "audit",
    path: "/admin/audit",
    domain: "audit",
    en: "Open the permanent audit history. Auggie does not send raw audit details to AI.",
    th: "เปิดประวัติการตรวจสอบถาวร Auggie จะไม่ส่งรายละเอียดดิบให้ AI",
  },
];

function permittedDestinations(ctx: AdminAuggieContext) {
  return DESTINATIONS.filter((destination) =>
    canAccessAdminPath(destination.path, ctx.permission),
  );
}

function toolSchemas(ctx: AdminAuggieContext) {
  const destinations = permittedDestinations(ctx).map((item) => item.key);
  const definitions = [
    {
      name: "navigate_admin",
      description:
        "Open the allowlisted administration page for any domain that needs its existing reviewed UI, including payments, proofs, publishing, newsletters, galleries, downloads, uploads, deletes, settings, audits, profiles, examinations, or student records.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: { destination: { type: "string", enum: destinations } },
        required: ["destination"],
      },
    },
    {
      name: "get_dashboard_summary",
      description:
        "Read current permission-scoped counts for the administration dashboard.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {},
      },
    },
    {
      name: "search_students",
      description:
        "Search permission-scoped student records by exact Student ID or name. This returns only minimal administrative identity and status fields.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          query: { type: "string", minLength: 1, maxLength: 120 },
          limit: { type: "integer", minimum: 1, maximum: 20 },
        },
        required: ["query"],
      },
    },
    {
      name: "propose_student_status",
      description:
        "Prepare, but do not execute, an archive or restore operation for exact public Student IDs. The server will require a separate exact confirmation.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          action: { type: "string", enum: ["archive", "restore"] },
          studentIds: {
            type: "array",
            minItems: 1,
            maxItems: 50,
            items: { type: "string" },
          },
        },
        required: ["action", "studentIds"],
      },
    },
    {
      name: "propose_bulk_student_action",
      description:
        "Resolve exact eligible students and prepare a guided proposal for the existing bulk add-hours, approve-pending-hours, rank-change, or promotion interface. This v1 never executes these bulk actions in chat.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          action: {
            type: "string",
            enum: [
              "add_hours",
              "approve_pending_hours",
              "mass_rank_change",
              "mass_promotion",
            ],
          },
          studentIds: {
            type: "array",
            minItems: 1,
            maxItems: 50,
            items: { type: "string" },
          },
          hours: { type: "number", exclusiveMinimum: 0, maximum: 1000 },
          levels: { type: "integer", minimum: 1, maximum: 14 },
          location: { type: "string", maxLength: 200 },
          examinationDate: { type: "string" },
        },
        required: ["action", "studentIds"],
      },
    },
  ];
  return definitions.map((definition) => ({
    type: "function" as const,
    function: definition,
  }));
}

function normalizeToolCalls(output: unknown): ToolCall[] {
  const root = objectValue(output);
  if (!root) return [];
  let raw: unknown = root.tool_calls;
  if (!Array.isArray(raw)) {
    const choices = Array.isArray(root.choices) ? root.choices : [];
    const first = objectValue(choices[0]);
    const message = objectValue(first?.message);
    raw = message?.tool_calls;
  }
  if (!Array.isArray(raw)) return [];
  return raw.map((entry): ToolCall => {
    const item = objectValue(entry);
    const fn = objectValue(item?.function);
    const name = cleanText(fn?.name ?? item?.name, 80);
    let args: unknown = fn?.arguments ?? item?.arguments;
    if (typeof args === "string") {
      try {
        args = JSON.parse(args);
      } catch {
        args = null;
      }
    }
    return { name, arguments: args };
  });
}

async function runToolSelection(ctx: AdminAuggieContext, message: string) {
  if (!ctx.env.AI?.run)
    throw new AdminAuggieError(
      localized(
        ctx.locale,
        "Admin Auggie is temporarily unavailable. Administration itself is unchanged.",
        "Admin Auggie ไม่พร้อมใช้งานชั่วคราว ระบบผู้ดูแลส่วนอื่นยังใช้งานได้ตามปกติ",
      ),
      503,
      "ADMIN_AUGGIE_AI_UNAVAILABLE",
    );
  const configured = ctx.env.ADMIN_AUGGIE_MODEL?.trim() || DEFAULT_MODEL;
  const model = MODEL_ALLOWLIST.has(configured) ? configured : DEFAULT_MODEL;
  const controller = new AbortController();
  const selection = ctx.env.AI.run(
    model,
    {
      messages: [
        {
          role: "system",
          content:
            "Select exactly one provided administration tool. Never answer with prose. Never invent Student IDs. Use search_students first when a person is identified only by name. Use navigate_admin for uploads, private evidence decisions, publishing, newsletter sends, deletion, settings, or any unsupported write. A tool request is not confirmation and must never claim a write succeeded.",
        },
        { role: "user", content: message },
      ],
      tools: toolSchemas(ctx),
      tool_choice: "required",
      parallel_tool_calls: false,
      max_completion_tokens: 300,
      temperature: 0,
    },
    { signal: controller.signal },
  );
  let timeoutId = 0;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort("admin-auggie-timeout");
      reject(
        new AdminAuggieError(
          localized(
            ctx.locale,
            "Admin Auggie timed out safely. No action was taken.",
            "Admin Auggie หมดเวลาอย่างปลอดภัย ไม่มีการดำเนินการใด ๆ",
          ),
          503,
          "ADMIN_AUGGIE_TIMEOUT",
        ),
      );
    }, AI_TIMEOUT_MS) as unknown as number;
  });
  let output: unknown;
  try {
    output = await Promise.race([selection, timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
  const calls = normalizeToolCalls(output);
  if (calls.length !== 1 || !calls[0].name || !objectValue(calls[0].arguments))
    throw new AdminAuggieError(
      localized(
        ctx.locale,
        "Admin Auggie could not select one safe action. No action was taken.",
        "Admin Auggie ไม่สามารถเลือกการทำงานที่ปลอดภัยเพียงรายการเดียว ไม่มีการดำเนินการใด ๆ",
      ),
      502,
      calls.length > 1
        ? "ADMIN_AUGGIE_MULTIPLE_TOOLS"
        : "ADMIN_AUGGIE_MALFORMED_TOOL",
    );
  return calls[0];
}

async function auditAi(
  ctx: AdminAuggieContext,
  action: string,
  toolName: string,
  outcome: "success" | "failure" = "success",
  values: Record<string, unknown> = {},
) {
  await auditStatement(ctx.db, {
    actorType: "administrator",
    ...adminAuditMetadata(ctx.session, ctx.request),
    action,
    entityType: "admin_ai_interaction",
    entityId: ctx.requestId,
    newValues: { toolName, locale: ctx.locale, ...values },
    source: "admin_ai",
    requestId: ctx.requestId,
    outcome,
    summary: `Admin Auggie ${action.replace(/^admin_ai_/, "").replace(/_/g, " ")}`,
    createdAt: new Date().toISOString(),
  }).run();
}

async function dashboardSummary(ctx: AdminAuggieContext) {
  const superAdmin = isRenShinKanSuperAdmin(ctx.session);
  const dojoId = ctx.session.selectedDojoId!;
  const scope = superAdmin ? "" : " AND s.dojo_id = ?";
  const proofScope = superAdmin
    ? ""
    : " AND s.dojo_id = ? AND p.payment_type <> 'renshinkan_monthly'";
  const bindings = superAdmin ? [] : [dojoId];
  const row = await ctx.db
    .prepare(
      `SELECT
    (SELECT COUNT(*) FROM students s WHERE s.deleted_at IS NULL AND s.profile_status = 'pending_admin_approval' ${scope}) AS pending_profiles,
    (SELECT COUNT(*) FROM examination_applications ea JOIN examination_cycles ec ON ec.id = ea.cycle_id AND ec.status = 'active'
      JOIN students s ON s.id = ea.student_id WHERE s.deleted_at IS NULL AND ea.status = 'application_submitted'
      AND ea.payment_status = 'payment_pending' ${scope}) AS pending_exams,
    (SELECT COUNT(*) FROM payments p JOIN students s ON s.id = p.student_id WHERE s.deleted_at IS NULL
      AND p.payment_type = 'aat_annual' AND p.status = 'awaiting_payment' ${scope}) AS pending_aat,
    (SELECT COUNT(*) FROM training_hour_requests r JOIN students s ON s.id = r.student_id WHERE s.deleted_at IS NULL
      AND r.status = 'pending' ${scope}) AS pending_hours,
    ${
      superAdmin
        ? `(SELECT COUNT(*) FROM monthly_contributions c JOIN students s ON s.id = c.student_id
      WHERE s.deleted_at IS NULL AND s.dojo_id = 'dojo-rsk' AND c.status = 'awaiting_payment')`
        : "0"
    } AS pending_monthly,
    (SELECT COUNT(*) FROM payment_proofs p JOIN students s ON s.id = p.student_id WHERE s.deleted_at IS NULL
      AND p.status = 'pending_review' AND p.object_key IS NOT NULL ${proofScope}) AS pending_proofs`,
    )
    .bind(...bindings, ...bindings, ...bindings, ...bindings, ...bindings)
    .first<Record<string, number>>();
  const counts = {
    pendingProfiles: Number(row?.pending_profiles || 0),
    pendingExams: Number(row?.pending_exams || 0),
    pendingAatPayments: Number(row?.pending_aat || 0),
    pendingTrainingHours: Number(row?.pending_hours || 0),
    pendingMonthlyContributions: Number(row?.pending_monthly || 0),
    pendingPaymentProofs: Number(row?.pending_proofs || 0),
  };
  await auditAi(
    ctx,
    "admin_ai_dashboard_read",
    "get_dashboard_summary",
    "success",
    { counts },
  );
  return {
    kind: "dashboard" as const,
    heading: localized(ctx.locale, "Dashboard summary", "สรุปแดชบอร์ด"),
    message: localized(
      ctx.locale,
      "These counts are limited to your current administrator scope.",
      "จำนวนเหล่านี้จำกัดตามขอบเขตผู้ดูแลปัจจุบันของคุณ",
    ),
    counts,
  };
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

async function searchStudents(
  ctx: AdminAuggieContext,
  args: Record<string, unknown>,
) {
  if (!exactKeys(args, ["query", "limit"]))
    throw new AdminAuggieError(
      "The student search contains unsupported fields.",
    );
  const query = cleanText(args.query, 120);
  const limit = args.limit === undefined ? 10 : Number(args.limit);
  if (
    !query ||
    query.length > 120 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 20
  )
    throw new AdminAuggieError(
      "Enter a search of 1-120 characters and a limit from 1-20.",
    );
  const superAdmin = isRenShinKanSuperAdmin(ctx.session);
  const like = `%${escapeLike(query)}%`;
  const scope = superAdmin ? "" : " AND s.dojo_id = ?";
  const bindings: unknown[] = [like, like];
  if (!superAdmin) bindings.push(ctx.session.selectedDojoId!);
  bindings.push(limit);
  const rows =
    (
      await ctx.db
        .prepare(
          `SELECT s.public_student_id, s.display_name, s.current_belt,
      s.active, s.profile_status, s.archived_at, d.official_name AS dojo_name
    FROM students s JOIN dojos d ON d.id = s.dojo_id
    WHERE s.deleted_at IS NULL AND (s.public_student_id LIKE ? ESCAPE '\\' COLLATE NOCASE
      OR s.display_name LIKE ? ESCAPE '\\' COLLATE NOCASE) ${scope}
    ORDER BY CASE WHEN s.public_student_id = ? THEN 0 ELSE 1 END, s.display_name COLLATE NOCASE, s.id
    LIMIT ?`,
        )
        .bind(
          ...bindings.slice(0, -1),
          query.toLocaleUpperCase("en-US"),
          bindings[bindings.length - 1],
        )
        .all<Record<string, unknown>>()
    ).results || [];
  const students = rows.map((row) => ({
    studentId: String(row.public_student_id || ""),
    name: String(row.display_name || ""),
    rank: String(row.current_belt || ""),
    dojo: String(row.dojo_name || ""),
    status: row.archived_at
      ? "archived"
      : Number(row.active) === 1
        ? String(row.profile_status || "active")
        : "inactive",
  }));
  await auditAi(ctx, "admin_ai_student_search", "search_students", "success", {
    queryLength: query.length,
    resultCount: students.length,
  });
  return {
    kind: "students" as const,
    heading: localized(ctx.locale, "Student search", "ค้นหานักเรียน"),
    message: students.length
      ? localized(
          ctx.locale,
          "Minimal fields are shown. Use exact Student IDs when preparing a change.",
          "แสดงเฉพาะข้อมูลขั้นต่ำ โปรดใช้รหัสนักเรียนที่ถูกต้องเมื่อเตรียมการเปลี่ยนแปลง",
        )
      : localized(
          ctx.locale,
          "No student matched in your current scope.",
          "ไม่พบนักเรียนในขอบเขตปัจจุบันของคุณ",
        ),
    students,
  };
}

async function resolveStudentTargets(
  ctx: AdminAuggieContext,
  publicIds: string[],
) {
  const placeholders = publicIds.map(() => "?").join(",");
  const superAdmin = isRenShinKanSuperAdmin(ctx.session);
  const dojoScope = superAdmin ? "" : " AND s.dojo_id = ?";
  const bindings = superAdmin
    ? publicIds
    : [...publicIds, ctx.session.selectedDojoId!];
  const rows =
    (
      await ctx.db
        .prepare(
          `SELECT s.id, s.public_student_id, s.display_name, s.dojo_id,
      d.official_name AS dojo_name, s.current_belt, s.active, s.profile_status, s.public_visible,
      s.public_visible_before_archive, s.archived_at, s.deleted_at, s.updated_at,
      COALESCE((SELECT SUM(h.verified_hours) FROM training_hours h WHERE h.student_id = s.id), 0)
        + s.training_hours_adjustment AS total_hours
    FROM students s JOIN dojos d ON d.id = s.dojo_id
    WHERE s.public_student_id IN (${placeholders})${dojoScope}`,
        )
        .bind(...bindings)
        .all<Record<string, unknown>>()
    ).results || [];
  if (rows.length !== publicIds.length)
    throw new AdminAuggieError(
      "One or more exact Student IDs is missing or outside your current scope.",
      409,
      "ADMIN_AUGGIE_TARGET_MISSING",
    );
  const byPublicId = new Map(
    rows.map((row) => [String(row.public_student_id), row]),
  );
  return publicIds.map((publicId): StudentTarget => {
    const row = byPublicId.get(publicId)!;
    const dojoId = String(row.dojo_id || "");
    if (!canAccessDojo(ctx.session, dojoId))
      throw new AdminAuggieError(
        "One or more students belongs to another dojo.",
        403,
        "ADMIN_AUGGIE_CROSS_DOJO",
      );
    return {
      id: String(row.id),
      publicId,
      name: String(row.display_name || ""),
      dojoId,
      dojoName: String(row.dojo_name || ""),
      currentRank: String(row.current_belt || ""),
      active: Number(row.active || 0),
      profileStatus: String(row.profile_status || ""),
      publicVisible: Number(row.public_visible || 0),
      publicVisibleBeforeArchive:
        row.public_visible_before_archive == null
          ? null
          : Number(row.public_visible_before_archive),
      archivedAt: typeof row.archived_at === "string" ? row.archived_at : null,
      deletedAt: typeof row.deleted_at === "string" ? row.deleted_at : null,
      updatedAt: String(row.updated_at || ""),
      totalHours: Number(row.total_hours || 0),
    };
  });
}

async function contributionGuardForRestore(
  ctx: AdminAuggieContext,
  targets: StudentTarget[],
) {
  const eligible = targets.filter(
    (target) =>
      target.dojoId === "dojo-rsk" && target.profileStatus === "approved",
  );
  if (!eligible.length) return { guard: undefined, manualRequired: false };
  const monthKey = currentBangkokMonthKey();
  const period = await ctx.db
    .prepare(
      "SELECT month_key FROM contribution_periods WHERE month_key = ? LIMIT 1",
    )
    .bind(monthKey)
    .first<{ month_key: string }>();
  if (!period) {
    return {
      guard: { monthKey, periodExpected: false, snapshotTargetIds: [] },
      manualRequired: false,
    };
  }
  const placeholders = eligible.map(() => "?").join(",");
  const snapshots =
    (
      await ctx.db
        .prepare(
          `SELECT student_id FROM contribution_period_students
    WHERE month_key = ? AND student_id IN (${placeholders})`,
        )
        .bind(monthKey, ...eligible.map((target) => target.id))
        .all<{ student_id: string }>()
    ).results || [];
  const snapshotIds = new Set(snapshots.map((row) => row.student_id));
  return {
    guard: {
      monthKey,
      periodExpected: true,
      snapshotTargetIds: eligible.map((target) => target.id),
    },
    manualRequired: eligible.some((target) => !snapshotIds.has(target.id)),
  };
}

function bangkokMonthBoundary(monthKey: string) {
  const match = monthKey.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || month < 1 || month > 12) return null;
  return new Date(Date.UTC(year, month, 1) - 7 * 60 * 60 * 1_000).toISOString();
}

function earliestExpiry(...values: Array<string | null | undefined>) {
  const valid = values
    .filter((value): value is string =>
      Boolean(value && Number.isFinite(Date.parse(value))),
    )
    .sort((left, right) => Date.parse(left) - Date.parse(right));
  return valid[0] || null;
}

function manualRestoreResponse(
  ctx: AdminAuggieContext,
  reason: "soft_deleted" | "contribution_snapshot",
) {
  return {
    kind: "navigate" as const,
    heading: localized(
      ctx.locale,
      "Manual restore required",
      "ต้องกู้คืนด้วยตนเอง",
    ),
    message: localized(
      ctx.locale,
      reason === "soft_deleted"
        ? "A soft-deleted record contains deletion metadata that Admin Auggie cannot restore reversibly. Open Student records and use the existing reviewed restore flow."
        : "Restoring this record may change the current monthly contribution snapshot. Open Student records and use the existing reviewed restore flow.",
      reason === "soft_deleted"
        ? "ระเบียนที่ลบแบบกู้คืนได้มีข้อมูลการลบซึ่ง Admin Auggie ไม่สามารถกู้คืนแบบย้อนกลับได้ โปรดเปิดระเบียนนักเรียนและใช้ขั้นตอนกู้คืนเดิมที่มีการตรวจสอบ"
        : "การกู้คืนระเบียนนี้อาจเปลี่ยนภาพรวมเงินสมทบรายเดือนปัจจุบัน โปรดเปิดระเบียนนักเรียนและใช้ขั้นตอนกู้คืนเดิมที่มีการตรวจสอบ",
    ),
    path: "/admin/students",
    manualOnly: true,
  };
}

function confirmationPhrase(action: "archive" | "restore", count: number) {
  return `${action === "archive" ? "ARCHIVE" : "RESTORE"} ${count} STUDENT${count === 1 ? "" : "S"}`;
}

function previewForStatus(
  action: "archive" | "restore",
  targets: StoredTarget[],
) {
  return {
    action,
    count: targets.length,
    dojos: Array.from(new Set(targets.map((target) => target.dojoName))),
    records: targets.map((target) => ({
      studentId: target.publicId,
      name: target.name,
      dojo: target.dojoName,
      before: action === "archive" ? "active" : "archived",
      after: action === "archive" ? "archived" : "active",
    })),
  };
}

async function insertOperation(
  ctx: AdminAuggieContext,
  input: {
    toolName: string;
    mode: "direct" | "guided";
    status: "prepared" | "guided";
    args: OperationArgs | GuidedBulkArgs;
    preview: Record<string, unknown>;
    fingerprints: Record<string, string>;
    phrase?: string;
    undoOf?: string | null;
    expiresAtCap?: string | null;
  },
) {
  const now = new Date();
  const defaultExpiry = now.getTime() + OPERATION_TTL_MS;
  const cap = input.expiresAtCap ? Date.parse(input.expiresAtCap) : NaN;
  const expiryTime = Number.isFinite(cap)
    ? Math.min(defaultExpiry, cap)
    : defaultExpiry;
  if (expiryTime <= now.getTime())
    throw new AdminAuggieError(
      "The safe undo window expired. No action was taken.",
      409,
      "ADMIN_AUGGIE_UNDO_UNAVAILABLE",
    );
  const expiresAt = new Date(expiryTime).toISOString();
  const normalizedArgs = JSON.stringify(input.args);
  const argsSha = await sha256Hex(normalizedArgs);
  const boundSessionHash = await sessionHash(ctx.env, ctx.session);
  const idempotencyKey = `admin-ai:${ctx.session.accountId}:${ctx.requestId}:${input.toolName}`;
  const validateReplay = (row: OperationRow) => {
    if (
      row.args_sha256 !== argsSha ||
      row.account_id !== ctx.session.accountId ||
      row.session_hash !== boundSessionHash ||
      row.selected_dojo_id !== ctx.session.selectedDojoId ||
      row.permission_level !== ctx.permission ||
      row.tool_name !== input.toolName ||
      row.undo_of_operation_id !== (input.undoOf || null)
    )
      throw new AdminAuggieError(
        "This request identifier was already used for a different operation or administrator scope.",
        409,
        "ADMIN_AUGGIE_IDEMPOTENCY_CONFLICT",
      );
    return row;
  };
  if (input.undoOf) {
    const activeUndo = await ctx.db
      .prepare(
        `SELECT * FROM admin_ai_operations
      WHERE undo_of_operation_id = ? AND status IN ('prepared', 'succeeded')
      ORDER BY created_at DESC LIMIT 1`,
      )
      .bind(input.undoOf)
      .first<OperationRow>();
    if (
      activeUndo &&
      (activeUndo.status === "succeeded" ||
        Date.parse(activeUndo.expires_at) > Date.now())
    )
      return validateReplay(activeUndo);
    if (activeUndo) await expireOperation(ctx, activeUndo);
  }
  const existing = await ctx.db
    .prepare(
      `SELECT * FROM admin_ai_operations WHERE idempotency_key = ? LIMIT 1`,
    )
    .bind(idempotencyKey)
    .first<OperationRow>();
  if (existing) return validateReplay(existing);
  const id = crypto.randomUUID();
  const createdAt = now.toISOString();
  try {
    await ctx.db.batch([
      ctx.db
        .prepare(
          `INSERT INTO admin_ai_operations (
      id, idempotency_key, account_id, session_hash, selected_dojo_id, permission_level,
      tool_name, tool_version, execution_mode, status, normalized_args_json, args_sha256,
      preview_json, fingerprints_json, confirmation_sha256, request_id, undo_of_operation_id,
      expires_at, payload_expires_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          idempotencyKey,
          ctx.session.accountId,
          boundSessionHash,
          ctx.session.selectedDojoId!,
          ctx.permission,
          input.toolName,
          input.mode,
          input.status,
          normalizedArgs,
          argsSha,
          JSON.stringify(input.preview),
          JSON.stringify(input.fingerprints),
          input.phrase ? await sha256Hex(input.phrase) : null,
          ctx.requestId,
          input.undoOf || null,
          expiresAt,
          expiresAt,
          createdAt,
          createdAt,
        ),
      auditStatement(ctx.db, {
        actorType: "administrator",
        ...adminAuditMetadata(ctx.session, ctx.request),
        action:
          input.mode === "direct"
            ? "admin_ai_write_prepared"
            : "admin_ai_guided_proposal",
        entityType: "admin_ai_operation",
        entityId: id,
        newValues: {
          toolName: input.toolName,
          executionMode: input.mode,
          affectedCount: input.args.targets.length,
          dojoIds: Array.from(
            new Set(input.args.targets.map((target) => target.dojoId)),
          ),
          expiresAt,
        },
        source: "admin_ai",
        requestId: ctx.requestId,
        summary: `${input.mode === "direct" ? "Prepared" : "Guided"} Admin Auggie ${input.toolName} for ${input.args.targets.length} student(s)`,
        createdAt,
      }),
    ]);
  } catch (error) {
    if (!String(error).toLocaleLowerCase("en-US").includes("unique"))
      throw error;
    const replay = input.undoOf
      ? await ctx.db
          .prepare(
            `SELECT * FROM admin_ai_operations
          WHERE undo_of_operation_id = ? AND status IN ('prepared', 'succeeded')
          ORDER BY created_at DESC LIMIT 1`,
          )
          .bind(input.undoOf)
          .first<OperationRow>()
      : await ctx.db
          .prepare(
            `SELECT * FROM admin_ai_operations WHERE idempotency_key = ? LIMIT 1`,
          )
          .bind(idempotencyKey)
          .first<OperationRow>();
    if (!replay) throw error;
    return validateReplay(replay);
  }
  const inserted = await ctx.db
    .prepare(`SELECT * FROM admin_ai_operations WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<OperationRow>();
  if (!inserted)
    throw new AdminAuggieError(
      "The prepared operation could not be loaded.",
      503,
      "ADMIN_AUGGIE_OPERATION_UNAVAILABLE",
    );
  return inserted;
}

function operationProposal(row: OperationRow, locale: AdminAuggieLocale) {
  const preview = safeJson<Record<string, unknown>>(row.preview_json, {});
  const args = safeJson<OperationArgs>(row.normalized_args_json, {
    action: "archive",
    targets: [],
  });
  const confirmable =
    row.execution_mode === "direct" &&
    row.status === "prepared" &&
    Date.parse(row.expires_at) > Date.now();
  const phrase = confirmable
    ? confirmationPhrase(args.action, args.targets.length)
    : undefined;
  const affectedCount = Number(preview.count || args.targets.length || 0);
  const affectedDojos = Array.isArray(preview.dojos)
    ? preview.dojos.filter((dojo): dojo is string => typeof dojo === "string")
    : [];
  const highImpact =
    confirmable && (affectedCount >= 10 || affectedDojos.length > 1);
  return {
    id: row.id,
    toolName: row.tool_name,
    executable: confirmable,
    status: row.status,
    expiresAt: row.expires_at,
    confirmationPhrase: phrase,
    highImpact,
    preview,
    path: "/admin/students",
    warning:
      row.status === "undone"
        ? localized(
            locale,
            "This operation was safely undone.",
            "การดำเนินการนี้ถูกย้อนกลับอย่างปลอดภัยแล้ว",
          )
        : row.status === "succeeded"
          ? localized(
              locale,
              "This change was saved safely and cannot be confirmed again.",
              "บันทึกการเปลี่ยนแปลงอย่างปลอดภัยแล้วและไม่สามารถยืนยันซ้ำได้",
            )
          : row.status === "expired"
            ? localized(
                locale,
                "This proposal expired. Prepare a new one.",
                "ข้อเสนอนี้หมดอายุแล้ว โปรดเตรียมใหม่",
              )
            : row.status === "failed"
              ? localized(
                  locale,
                  "This operation failed safely. No partial change was saved.",
                  "การดำเนินการล้มเหลวอย่างปลอดภัย ไม่มีการบันทึกบางส่วน",
                )
              : highImpact
                ? localized(
                    locale,
                    `High-impact change: ${affectedCount} records across ${affectedDojos.length || 1} dojo(s). No change has been made. Recheck every Student ID and dojo before typing the exact confirmation phrase.`,
                    `การเปลี่ยนแปลงที่มีผลกระทบสูง: ${affectedCount} ระเบียนใน ${affectedDojos.length || 1} โดโจ ยังไม่มีการเปลี่ยนแปลง โปรดตรวจรหัสนักเรียนและโดโจทุกรายการก่อนพิมพ์ข้อความยืนยันให้ตรง`,
                  )
                : row.execution_mode === "direct"
                  ? localized(
                      locale,
                      "No change has been made. Type the exact phrase and use the separate Confirm button.",
                      "ยังไม่มีการเปลี่ยนแปลง พิมพ์ข้อความยืนยันให้ตรงและใช้ปุ่มยืนยันแยกต่างหาก",
                    )
                  : localized(
                      locale,
                      "This is a resolved preview only. Open Student records and use its existing reviewed bulk confirmation.",
                      "นี่เป็นเพียงตัวอย่างที่ตรวจสอบแล้ว เปิดระเบียนนักเรียนและใช้ขั้นตอนยืนยันแบบกลุ่มเดิม",
                    ),
  };
}

async function proposeStudentStatus(
  ctx: AdminAuggieContext,
  args: Record<string, unknown>,
) {
  if (
    !exactKeys(args, ["action", "studentIds"]) ||
    (args.action !== "archive" && args.action !== "restore")
  )
    throw new AdminAuggieError(
      "Choose archive or restore with exact Student IDs.",
    );
  const action = args.action;
  const targets = await resolveStudentTargets(
    ctx,
    parseStudentIds(args.studentIds),
  );
  if (action === "restore" && targets.some((target) => target.deletedAt)) {
    await auditAi(
      ctx,
      "admin_ai_manual_restore_required",
      "propose_student_status",
      "success",
      {
        affectedCount: targets.length,
        reasonCode: "soft_deleted_target",
      },
    );
    return manualRestoreResponse(ctx, "soft_deleted");
  }
  const contribution =
    action === "restore"
      ? await contributionGuardForRestore(ctx, targets)
      : { guard: undefined, manualRequired: false };
  if (contribution.manualRequired) {
    await auditAi(
      ctx,
      "admin_ai_manual_restore_required",
      "propose_student_status",
      "success",
      {
        affectedCount: targets.length,
        reasonCode: "contribution_snapshot_side_effect",
      },
    );
    return manualRestoreResponse(ctx, "contribution_snapshot");
  }
  for (const target of targets) {
    if (action === "archive" && (target.active !== 1 || target.archivedAt))
      throw new AdminAuggieError(
        `${target.publicId} is not an active record that can be archived.`,
        409,
        "ADMIN_AUGGIE_TARGET_STATE",
      );
    if (action === "restore" && (target.active === 1 || !target.archivedAt))
      throw new AdminAuggieError(
        `${target.publicId} is not an archived record that can be restored.`,
        409,
        "ADMIN_AUGGIE_TARGET_STATE",
      );
  }
  const stored = targets.map((target): StoredTarget => ({
    ...target,
    expectedState: statusState(target),
  }));
  const phrase = confirmationPhrase(action, stored.length);
  const row = await insertOperation(ctx, {
    toolName: `student_${action}`,
    mode: "direct",
    status: "prepared",
    args: { action, targets: stored, contributionGuard: contribution.guard },
    preview: previewForStatus(action, stored),
    fingerprints: Object.fromEntries(
      stored.map((target) => [target.id, target.expectedState]),
    ),
    phrase,
    expiresAtCap: contribution.guard
      ? bangkokMonthBoundary(contribution.guard.monthKey)
      : null,
  });
  return {
    kind: "proposal" as const,
    heading: localized(
      ctx.locale,
      action === "archive" ? "Archive proposal" : "Restore proposal",
      action === "archive" ? "ข้อเสนอเก็บถาวร" : "ข้อเสนอกู้คืน",
    ),
    message: localized(
      ctx.locale,
      "The server resolved and rechecked every exact record. Review the card below.",
      "เซิร์ฟเวอร์ตรวจสอบระเบียนที่ระบุทุกระเบียนแล้ว โปรดตรวจบัตรด้านล่าง",
    ),
    operation: operationProposal(row, ctx.locale),
  };
}

async function proposeGuidedBulk(
  ctx: AdminAuggieContext,
  args: Record<string, unknown>,
) {
  if (
    !exactKeys(args, [
      "action",
      "studentIds",
      "hours",
      "levels",
      "location",
      "examinationDate",
    ])
  )
    throw new AdminAuggieError(
      "The bulk proposal contains unsupported fields.",
    );
  const action = args.action;
  if (
    action !== "add_hours" &&
    action !== "approve_pending_hours" &&
    action !== "mass_rank_change" &&
    action !== "mass_promotion"
  )
    throw new AdminAuggieError("Choose a supported bulk student action.");
  const targets = await resolveStudentTargets(
    ctx,
    parseStudentIds(args.studentIds),
  );
  if (
    targets.some(
      (target) =>
        target.active !== 1 ||
        target.archivedAt ||
        target.profileStatus !== "approved",
    )
  )
    throw new AdminAuggieError(
      "Bulk actions require active, approved, unarchived students.",
      409,
      "ADMIN_AUGGIE_TARGET_STATE",
    );
  const stored = targets.map((target): StoredTarget => ({
    ...target,
    expectedState: `${statusState(target)}|${target.currentRank}|${target.totalHours}`,
  }));
  const guided: GuidedBulkArgs = { action, targets: stored };
  const records: Array<Record<string, unknown>> = [];
  if (action === "add_hours") {
    const hours = Number(args.hours);
    const location = cleanText(args.location, 200);
    if (
      !Number.isFinite(hours) ||
      hours <= 0 ||
      hours > 1000 ||
      cleanText(args.location, 201).length > 200
    )
      throw new AdminAuggieError(
        "Enter positive hours up to 1,000 and a location no longer than 200 characters.",
      );
    guided.hours = hours;
    guided.location = location;
    for (const target of stored)
      records.push({
        studentId: target.publicId,
        name: target.name,
        dojo: target.dojoName,
        before: `${target.totalHours} hours`,
        after: `${target.totalHours + hours} hours`,
      });
  } else if (action === "approve_pending_hours") {
    const placeholders = stored.map(() => "?").join(",");
    const pending =
      (
        await ctx.db
          .prepare(
            `SELECT student_id, COUNT(*) AS request_count,
        SUM(submitted_hours) AS pending_hours FROM training_hour_requests
      WHERE status = 'pending' AND student_id IN (${placeholders}) GROUP BY student_id`,
          )
          .bind(...stored.map((target) => target.id))
          .all<{
            student_id: string;
            request_count: number;
            pending_hours: number;
          }>()
      ).results || [];
    const byStudent = new Map(pending.map((row) => [row.student_id, row]));
    if (stored.some((target) => !byStudent.has(target.id)))
      throw new AdminAuggieError(
        "Every selected student must still have a pending training-hour request.",
        409,
        "ADMIN_AUGGIE_TARGET_STATE",
      );
    guided.pendingRequestCount = pending.reduce(
      (sum, row) => sum + Number(row.request_count),
      0,
    );
    guided.pendingHours = pending.reduce(
      (sum, row) => sum + Number(row.pending_hours),
      0,
    );
    for (const target of stored) {
      const row = byStudent.get(target.id)!;
      target.expectedState += `|${row.request_count}|${row.pending_hours}`;
      records.push({
        studentId: target.publicId,
        name: target.name,
        dojo: target.dojoName,
        pendingRequests: Number(row.request_count),
        pendingHours: Number(row.pending_hours),
      });
    }
  } else {
    const levels = Number(args.levels);
    if (!Number.isInteger(levels) || levels < 1 || levels > 14)
      throw new AdminAuggieError(
        "Promotion levels must be a whole number from 1 to 14.",
      );
    guided.levels = levels;
    if (action === "mass_promotion") {
      const location = cleanText(args.location, 200);
      const examinationDate = cleanText(args.examinationDate, 10);
      if (
        !location ||
        cleanText(args.location, 201).length > 200 ||
        !isCanonicalDate(examinationDate)
      )
        throw new AdminAuggieError(
          "Mass promotion needs a valid examination date and location.",
        );
      guided.location = location;
      guided.examinationDate = examinationDate;
    }
    for (const target of stored) {
      const next = promoteRank(target.currentRank, levels);
      if (!next)
        throw new AdminAuggieError(
          `${target.publicId} cannot move ${levels} level(s) from ${target.currentRank}.`,
        );
      records.push({
        studentId: target.publicId,
        name: target.name,
        dojo: target.dojoName,
        before: target.currentRank,
        after: next,
        examinationRecorded: action === "mass_promotion",
      });
    }
  }
  const preview = {
    action,
    count: stored.length,
    dojos: Array.from(new Set(stored.map((target) => target.dojoName))),
    records,
    manualOnly: true,
    reason:
      "The existing bulk handler owns its own transaction and replay record; v1 does not split that safety boundary.",
  };
  const row = await insertOperation(ctx, {
    toolName: `guided_${action}`,
    mode: "guided",
    status: "guided",
    args: guided,
    preview,
    fingerprints: Object.fromEntries(
      stored.map((target) => [target.id, target.expectedState]),
    ),
  });
  return {
    kind: "proposal" as const,
    heading: localized(
      ctx.locale,
      "Resolved bulk preview",
      "ตัวอย่างการทำงานแบบกลุ่มที่ตรวจสอบแล้ว",
    ),
    message: localized(
      ctx.locale,
      "No bulk write occurred. Continue in Student records, where the existing transaction and confirmation remain authoritative.",
      "ยังไม่มีการแก้ไขแบบกลุ่ม โปรดดำเนินการต่อในหน้าระเบียนนักเรียนซึ่งใช้ธุรกรรมและการยืนยันเดิม",
    ),
    operation: operationProposal(row, ctx.locale),
  };
}

async function navigate(
  ctx: AdminAuggieContext,
  args: Record<string, unknown>,
) {
  if (!exactKeys(args, ["destination"]) || typeof args.destination !== "string")
    throw new AdminAuggieError(
      "Choose one allowed administration destination.",
    );
  const destination = permittedDestinations(ctx).find(
    (item) => item.key === args.destination,
  );
  if (!destination)
    throw new AdminAuggieError(
      "That administration area is not available in your current permission scope.",
      403,
      "ADMIN_AUGGIE_ROUTE_FORBIDDEN",
    );
  await auditAi(ctx, "admin_ai_navigation", "navigate_admin", "success", {
    destination: destination.key,
    manualOnly: Boolean(destination.manualOnly),
  });
  return {
    kind: "navigate" as const,
    heading: localized(
      ctx.locale,
      `Open ${destination.domain}`,
      `เปิด ${destination.domain}`,
    ),
    message: localized(ctx.locale, destination.en, destination.th),
    path: destination.path,
    manualOnly: Boolean(destination.manualOnly),
  };
}

async function executeSelectedTool(ctx: AdminAuggieContext, call: ToolCall) {
  const args = objectValue(call.arguments);
  if (!args)
    throw new AdminAuggieError(
      "Tool arguments are invalid.",
      502,
      "ADMIN_AUGGIE_MALFORMED_TOOL",
    );
  if (call.name === "navigate_admin") return navigate(ctx, args);
  if (call.name === "get_dashboard_summary") {
    if (Object.keys(args).length)
      throw new AdminAuggieError("Dashboard summary takes no arguments.");
    return dashboardSummary(ctx);
  }
  if (call.name === "search_students") return searchStudents(ctx, args);
  if (call.name === "propose_student_status")
    return proposeStudentStatus(ctx, args);
  if (call.name === "propose_bulk_student_action")
    return proposeGuidedBulk(ctx, args);
  throw new AdminAuggieError(
    localized(
      ctx.locale,
      "The model selected an unknown tool. No action was taken.",
      "โมเดลเลือกเครื่องมือที่ไม่รู้จัก ไม่มีการดำเนินการใด ๆ",
    ),
    502,
    "ADMIN_AUGGIE_UNKNOWN_TOOL",
  );
}

export async function handleAdminAuggieChat(
  request: Request,
  env: AdminAuggieEnv,
) {
  const input = await parseBoundedJson(request, [
    "message",
    "locale",
    "currentPath",
  ]);
  const locale: AdminAuggieLocale = input.locale === "th" ? "th" : "en";
  const currentPath =
    typeof input.currentPath === "string"
      ? input.currentPath
      : "/admin/dashboard";
  const ctx = await requireAdminAuggieContext(
    request,
    env,
    locale,
    currentPath,
  );
  const message = cleanText(input.message, MAX_MESSAGE_CHARS);
  if (!message || message.length > MAX_MESSAGE_CHARS)
    throw new AdminAuggieError(
      localized(
        locale,
        "Enter a message of 1-1,600 characters.",
        "กรอกข้อความความยาว 1-1,600 ตัวอักษร",
      ),
    );
  const allowed = await consumeRateLimit(request, env, {
    endpoint: "admin-auggie-chat",
    subject: `${ctx.session.accountId}:${ctx.session.sessionId}:${ctx.session.selectedDojoId}`,
    limit: 12,
    windowSeconds: 60,
    lockSeconds: 60,
  });
  if (!allowed)
    throw new AdminAuggieError(
      localized(
        locale,
        "Admin Auggie is rate limited. Wait a minute and try again.",
        "Admin Auggie ถูกจำกัดการใช้งาน โปรดรอหนึ่งนาทีแล้วลองอีกครั้ง",
      ),
      429,
      "ADMIN_AUGGIE_RATE_LIMIT",
    );
  const sensitiveCategory = detectSensitiveAdminAuggieInput(message);
  if (sensitiveCategory) {
    await auditAi(ctx, "admin_ai_sensitive_input_rejected", "none", "failure", {
      code: "ADMIN_AUGGIE_SENSITIVE_INPUT",
      category: sensitiveCategory,
      inputCharacters: message.length,
    }).catch(() => undefined);
    throw new AdminAuggieError(
      localized(
        locale,
        "Remove private values such as identity, contact, financial, credential, private-link, note, or questionnaire data before asking Admin Auggie. No text was sent to AI.",
        "โปรดลบข้อมูลส่วนตัว เช่น ข้อมูลยืนยันตัวตน การติดต่อ การเงิน ข้อมูลลับ ลิงก์ส่วนตัว หมายเหตุ หรือคำตอบแบบสอบถามก่อนถาม Admin Auggie ข้อความนี้ไม่ได้ถูกส่งให้ AI",
      ),
      422,
      "ADMIN_AUGGIE_SENSITIVE_INPUT",
    );
  }
  let call: ToolCall;
  try {
    call = await runToolSelection(ctx, message);
  } catch (error) {
    const known =
      error instanceof AdminAuggieError
        ? error
        : new AdminAuggieError(
            "Admin Auggie failed safely. No action was taken.",
            502,
            "ADMIN_AUGGIE_AI_FAILURE",
          );
    await auditAi(ctx, "admin_ai_tool_rejected", "none", "failure", {
      code: known.code,
      inputCharacters: message.length,
    }).catch(() => undefined);
    throw known;
  }
  try {
    return await executeSelectedTool(ctx, call);
  } catch (error) {
    const known =
      error instanceof AdminAuggieError
        ? error
        : new AdminAuggieError(
            "The selected action failed safely. No write was made.",
            500,
            "ADMIN_AUGGIE_TOOL_FAILURE",
          );
    await auditAi(ctx, "admin_ai_tool_failed", call.name, "failure", {
      code: known.code,
      inputCharacters: message.length,
    }).catch(() => undefined);
    throw known;
  }
}

async function loadBoundOperation(
  ctx: AdminAuggieContext,
  operationId: string,
) {
  if (!/^[0-9a-f-]{36}$/i.test(operationId))
    throw new AdminAuggieError("Choose a valid Admin Auggie operation.");
  const row = await ctx.db
    .prepare(`SELECT * FROM admin_ai_operations WHERE id = ? LIMIT 1`)
    .bind(operationId)
    .first<OperationRow>();
  if (!row)
    throw new AdminAuggieError(
      "Admin Auggie operation not found.",
      404,
      "ADMIN_AUGGIE_OPERATION_MISSING",
    );
  const currentHash = await sessionHash(ctx.env, ctx.session);
  if (
    row.account_id !== ctx.session.accountId ||
    row.session_hash !== currentHash ||
    row.selected_dojo_id !== ctx.session.selectedDojoId ||
    row.permission_level !== ctx.permission
  )
    throw new AdminAuggieError(
      "This operation belongs to a different administrator session or dojo scope.",
      403,
      "ADMIN_AUGGIE_OPERATION_SCOPE",
    );
  return row;
}

async function failOperation(
  ctx: AdminAuggieContext,
  row: OperationRow,
  code: string,
  summary: string,
) {
  const now = new Date().toISOString();
  await ctx.db
    .batch([
      ctx.db
        .prepare(
          `INSERT INTO admin_ai_execution_guards
      (operation_id, target_id, expected_state, observed_state)
      VALUES (?, '__failure__', 'prepared', COALESCE((
        SELECT status FROM admin_ai_operations WHERE id = ?
      ), 'missing'))`,
        )
        .bind(row.id, row.id),
      ctx.db
        .prepare(
          `UPDATE admin_ai_operations SET status = 'failed', error_code = ?,
        payload_expires_at = ?, updated_at = ?
      WHERE id = ? AND status = 'prepared'`,
        )
        .bind(code, now, now, row.id),
      auditStatement(ctx.db, {
        actorType: "administrator",
        ...adminAuditMetadata(ctx.session, ctx.request),
        action: "admin_ai_write_failed",
        entityType: "admin_ai_operation",
        entityId: row.id,
        newValues: { toolName: row.tool_name, code },
        source: "admin_ai",
        requestId: ctx.requestId,
        outcome: "failure",
        summary,
        createdAt: now,
      }),
    ])
    .catch(() => undefined);
}

async function expireOperation(ctx: AdminAuggieContext, row: OperationRow) {
  const expiredAt = new Date().toISOString();
  try {
    await ctx.db.batch([
      ctx.db
        .prepare(
          `INSERT INTO admin_ai_execution_guards
      (operation_id, target_id, expected_state, observed_state)
      VALUES (?, '__expiry__', 'prepared|0', COALESCE((
        SELECT status || '|' || CAST(expires_at > ? AS TEXT)
        FROM admin_ai_operations WHERE id = ?
      ), 'missing'))`,
        )
        .bind(row.id, expiredAt, row.id),
      ctx.db
        .prepare(
          `UPDATE admin_ai_operations SET status = 'expired', payload_expires_at = ?, updated_at = ?
      WHERE id = ? AND status = 'prepared'`,
        )
        .bind(expiredAt, expiredAt, row.id),
      operationAudit(
        ctx,
        row,
        "admin_ai_write_expired",
        "failure",
        { code: "ADMIN_AUGGIE_EXPIRED" },
        "Admin Auggie confirmation rejected because the prepared operation expired",
        expiredAt,
      ),
    ]);
    return true;
  } catch (error) {
    const current = await ctx.db
      .prepare(`SELECT status FROM admin_ai_operations WHERE id = ? LIMIT 1`)
      .bind(row.id)
      .first<{ status: OperationRow["status"] }>();
    if (current && current.status !== "prepared") return false;
    throw error;
  }
}

function operationAudit(
  ctx: AdminAuggieContext,
  row: OperationRow,
  action: string,
  outcome: "success" | "failure",
  values: Record<string, unknown>,
  summary: string,
  createdAt = new Date().toISOString(),
) {
  return auditStatement(ctx.db, {
    actorType: "administrator",
    ...adminAuditMetadata(ctx.session, ctx.request),
    action,
    entityType: "admin_ai_operation",
    entityId: row.id,
    newValues: { toolName: row.tool_name, ...values },
    source: "admin_ai",
    requestId: ctx.requestId,
    outcome,
    summary,
    createdAt,
  });
}

async function recheckTargets(ctx: AdminAuggieContext, args: OperationArgs) {
  const current = await resolveStudentTargets(
    ctx,
    args.targets.map((target) => target.publicId),
  );
  const byId = new Map(current.map((target) => [target.id, target]));
  for (const expected of args.targets) {
    const observed = byId.get(expected.id);
    if (!observed || statusState(observed) !== expected.expectedState)
      throw new AdminAuggieError(
        "A selected student changed after the preview. Prepare a new operation.",
        409,
        "ADMIN_AUGGIE_STALE",
      );
    if (
      args.action === "archive" &&
      (observed.active !== 1 || observed.archivedAt)
    )
      throw new AdminAuggieError(
        "A selected student can no longer be archived.",
        409,
        "ADMIN_AUGGIE_STALE",
      );
    if (
      args.action === "restore" &&
      (observed.active === 1 || !observed.archivedAt)
    )
      throw new AdminAuggieError(
        "A selected student can no longer be restored.",
        409,
        "ADMIN_AUGGIE_STALE",
      );
  }
  return current;
}

function statusGuardStatement(
  db: D1Database,
  operationId: string,
  target: StoredTarget,
) {
  return db
    .prepare(
      `INSERT INTO admin_ai_execution_guards
    (operation_id, target_id, expected_state, observed_state)
    VALUES (?, ?, ?, COALESCE((SELECT ${STATUS_STATE_SQL} FROM students WHERE id = ?), 'missing'))`,
    )
    .bind(operationId, target.id, target.expectedState, target.id);
}

function operationGuardStatement(db: D1Database, operationId: string) {
  return db
    .prepare(
      `INSERT INTO admin_ai_operation_state_guards
    (operation_id, guard_name, expected_state, observed_state)
    VALUES (?, 'confirmability', 'prepared|1|1', COALESCE((
      SELECT status || '|' || CAST(julianday(expires_at) > julianday('now') AS TEXT) ||
        '|' || CAST(payload_scrubbed_at IS NULL AS TEXT)
      FROM admin_ai_operations WHERE id = ?
    ), 'missing'))`,
    )
    .bind(operationId, operationId);
}

function undoParentGuardStatement(db: D1Database, row: OperationRow) {
  if (!row.undo_of_operation_id) return [];
  return [
    db
      .prepare(
        `INSERT INTO admin_ai_operation_state_guards
      (operation_id, guard_name, expected_state, observed_state)
      VALUES (?, 'undo_parent', 'succeeded||1|1', COALESCE((
        SELECT status || '|' || COALESCE(undone_by_operation_id, '') || '|' ||
          CAST(julianday(undo_expires_at) > julianday('now') AS TEXT) || '|' ||
          CAST(payload_scrubbed_at IS NULL AS TEXT)
        FROM admin_ai_operations WHERE id = ?
      ), 'missing'))`,
      )
      .bind(row.id, row.undo_of_operation_id),
  ];
}

function contributionMonthGuardStatements(
  db: D1Database,
  operationId: string,
  args: OperationArgs,
) {
  if (!args.contributionGuard) return [];
  return [
    db
      .prepare(
        `INSERT INTO admin_ai_operation_state_guards
      (operation_id, guard_name, expected_state, observed_state)
      VALUES (?, 'contribution_month', ?, strftime('%Y-%m', 'now', '+7 hours'))`,
      )
      .bind(operationId, args.contributionGuard.monthKey),
  ];
}

function contributionGuardStatements(
  db: D1Database,
  operationId: string,
  args: OperationArgs,
) {
  const guard = args.contributionGuard;
  if (!guard) return [];
  if (!guard.periodExpected) {
    return [
      db
        .prepare(
          `INSERT INTO admin_ai_execution_guards
      (operation_id, target_id, expected_state, observed_state)
      VALUES (?, '__contribution_period__', 'absent', CASE WHEN EXISTS(
        SELECT 1 FROM contribution_periods WHERE month_key = ?
      ) THEN 'present' ELSE 'absent' END)`,
        )
        .bind(operationId, guard.monthKey),
    ];
  }
  return guard.snapshotTargetIds.map((studentId) =>
    db
      .prepare(
        `INSERT INTO admin_ai_execution_guards
    (operation_id, target_id, expected_state, observed_state)
    VALUES (?, ?, 'present', CASE WHEN EXISTS(
      SELECT 1 FROM contribution_period_students WHERE month_key = ? AND student_id = ?
    ) THEN 'present' ELSE 'missing' END)`,
      )
      .bind(
        operationId,
        `__contribution_snapshot__:${studentId}`,
        guard.monthKey,
        studentId,
      ),
  );
}

async function executeStatusOperation(
  ctx: AdminAuggieContext,
  row: OperationRow,
  args: OperationArgs,
) {
  const current = await recheckTargets(ctx, args);
  const now = new Date().toISOString();
  if (
    args.contributionGuard &&
    currentBangkokMonthKey(new Date(now)) !== args.contributionGuard.monthKey
  )
    throw new AdminAuggieError(
      "The monthly contribution period changed after the preview. Use the reviewed Student records restore flow.",
      409,
      "ADMIN_AUGGIE_STALE",
    );
  const byId = new Map(current.map((target) => [target.id, target]));
  const statements: D1PreparedStatement[] = [
    ctx.db
      .prepare(
        "INSERT INTO admin_ai_execution_claims (operation_id, claimed_at) VALUES (?, ?)",
      )
      .bind(row.id, now),
    operationGuardStatement(ctx.db, row.id),
    ...undoParentGuardStatement(ctx.db, row),
    ...contributionMonthGuardStatements(ctx.db, row.id, args),
    ...contributionGuardStatements(ctx.db, row.id, args),
    ...args.targets.map((target) =>
      statusGuardStatement(ctx.db, row.id, target),
    ),
  ];
  const resultFingerprints: Record<string, string> = {};
  for (const target of args.targets) {
    const observed = byId.get(target.id)!;
    if (args.action === "archive") {
      const resultState = statusState({
        ...observed,
        active: 0,
        archivedAt: now,
        updatedAt: now,
        publicVisible: 0,
        publicVisibleBeforeArchive: observed.publicVisible,
      });
      resultFingerprints[target.id] = resultState;
      statements.push(
        ctx.db
          .prepare(
            `UPDATE students SET active = 0, public_visible_before_archive = public_visible,
          public_visible = 0, archived_at = ?, archived_by = ?, updated_at = ?
          WHERE id = ? AND active = 1`,
          )
          .bind(now, ctx.session.adminName, now, target.id),
        auditStatement(ctx.db, {
          actorType: "administrator",
          ...adminAuditMetadata(ctx.session, ctx.request),
          action: "student_archived",
          entityType: "student",
          entityId: target.id,
          studentId: target.id,
          studentPublicId: target.publicId,
          studentNameSnapshot: target.name,
          previousValues: {
            active: true,
            publicVisible: Boolean(observed.publicVisible),
          },
          newValues: {
            active: false,
            publicVisible: false,
            adminAiOperationId: row.id,
          },
          source: "admin_ai",
          requestId: ctx.requestId,
          summary: `Admin Auggie archived ${target.publicId}: ${target.name}`,
          createdAt: now,
        }),
      );
    } else {
      const restoredVisibility =
        observed.profileStatus === "approved"
          ? Number(observed.publicVisibleBeforeArchive ?? 1)
          : 0;
      const resultState = statusState({
        ...observed,
        active: 1,
        archivedAt: null,
        updatedAt: now,
        publicVisible: restoredVisibility,
      });
      resultFingerprints[target.id] = resultState;
      statements.push(
        ctx.db
          .prepare(
            `UPDATE students SET active = 1, public_visible = ?, archived_at = NULL,
          archived_by = NULL, updated_at = ?
          WHERE id = ? AND active = 0`,
          )
          .bind(restoredVisibility, now, target.id),
      );
      statements.push(
        auditStatement(ctx.db, {
          actorType: "administrator",
          ...adminAuditMetadata(ctx.session, ctx.request),
          action: "student_restored",
          entityType: "student",
          entityId: target.id,
          studentId: target.id,
          studentPublicId: target.publicId,
          studentNameSnapshot: target.name,
          previousValues: {
            active: false,
            publicVisible: false,
            softDeleted: Boolean(observed.deletedAt),
          },
          newValues: {
            active: true,
            publicVisible: Boolean(restoredVisibility),
            softDeleted: false,
            adminAiOperationId: row.id,
          },
          source: "admin_ai",
          requestId: ctx.requestId,
          summary: `Admin Auggie restored ${target.publicId}: ${target.name}`,
          createdAt: now,
        }),
      );
    }
  }
  const result = {
    ok: true,
    operationId: row.id,
    action: args.action,
    count: args.targets.length,
    records: args.targets.map((target) => ({
      studentId: target.publicId,
      name: target.name,
      dojo: target.dojoName,
      status: args.action === "archive" ? "archived" : "active",
    })),
    completedAt: now,
    undoUntil: new Date(Date.parse(now) + UNDO_TTL_MS).toISOString(),
  };
  statements.push(
    auditStatement(ctx.db, {
      actorType: "administrator",
      ...adminAuditMetadata(ctx.session, ctx.request),
      action: "admin_ai_write_succeeded",
      entityType: "admin_ai_operation",
      entityId: row.id,
      newValues: {
        toolName: row.tool_name,
        affectedCount: args.targets.length,
        action: args.action,
      },
      source: "admin_ai",
      requestId: ctx.requestId,
      summary: `Admin Auggie ${args.action} succeeded for ${args.targets.length} student(s)`,
      createdAt: now,
    }),
    ctx.db
      .prepare(
        `UPDATE admin_ai_operations SET status = 'succeeded', confirmed_at = ?, completed_at = ?,
      result_json = ?, result_fingerprints_json = ?, undo_expires_at = ?,
      payload_expires_at = ?, error_code = NULL, updated_at = ?
      WHERE id = ? AND status = 'prepared'`,
      )
      .bind(
        now,
        now,
        JSON.stringify(result),
        JSON.stringify(resultFingerprints),
        result.undoUntil,
        result.undoUntil,
        now,
        row.id,
      ),
    ...(row.undo_of_operation_id
      ? [
          ctx.db
            .prepare(
              `UPDATE admin_ai_operations SET status = 'undone', undone_by_operation_id = ?,
          payload_expires_at = ?, updated_at = ?
        WHERE id = ? AND status = 'succeeded'`,
            )
            .bind(row.id, now, now, row.undo_of_operation_id),
        ]
      : []),
  );
  try {
    await ctx.db.batch(statements);
  } catch (error) {
    const replay = await ctx.db
      .prepare(`SELECT * FROM admin_ai_operations WHERE id = ? LIMIT 1`)
      .bind(row.id)
      .first<OperationRow>();
    if (replay?.status === "succeeded" && replay.result_json)
      return safeJson<Record<string, unknown>>(replay.result_json, result);
    const text = String(error).toLocaleLowerCase("en-US");
    const operationStateFailure =
      text.includes("admin_ai_operation_state_matches") ||
      text.includes("admin_ai_operation_state_guards");
    const code =
      operationStateFailure && Date.parse(row.expires_at) <= Date.now()
        ? "ADMIN_AUGGIE_EXPIRED"
        : text.includes("check constraint")
          ? "ADMIN_AUGGIE_STALE"
          : text.includes("unique")
            ? "ADMIN_AUGGIE_REPLAY_PENDING"
            : "ADMIN_AUGGIE_EXECUTION_FAILED";
    throw new AdminAuggieError(
      code === "ADMIN_AUGGIE_EXPIRED"
        ? "The proposal expired during confirmation. No records were changed."
        : code === "ADMIN_AUGGIE_STALE"
          ? "A student changed during confirmation. No records were changed."
          : "The operation failed transactionally. No records were changed.",
      409,
      code,
    );
  }
  return result;
}

export async function confirmAdminAuggieOperation(
  request: Request,
  env: AdminAuggieEnv,
  operationId: string,
  phrase: string,
  locale: AdminAuggieLocale,
) {
  const ctx = await requireAdminAuggieContext(request, env, locale);
  const row = await loadBoundOperation(ctx, operationId);
  if (row.status === "undone")
    throw new AdminAuggieError(
      "This operation was already undone.",
      409,
      "ADMIN_AUGGIE_ALREADY_UNDONE",
    );
  if (row.status === "succeeded" && row.result_json)
    return safeJson<Record<string, unknown>>(row.result_json, {
      ok: true,
      operationId: row.id,
    });
  if (row.execution_mode !== "direct" || row.status !== "prepared")
    throw new AdminAuggieError(
      "This operation is not available for direct confirmation.",
      409,
      "ADMIN_AUGGIE_NOT_CONFIRMABLE",
    );
  if (Date.parse(row.expires_at) <= Date.now()) {
    await expireOperation(ctx, row);
    const terminal = await ctx.db
      .prepare(`SELECT * FROM admin_ai_operations WHERE id = ? LIMIT 1`)
      .bind(row.id)
      .first<OperationRow>();
    if (terminal?.status === "succeeded" && terminal.result_json)
      return safeJson<Record<string, unknown>>(terminal.result_json, {
        ok: true,
        operationId: terminal.id,
      });
    if (terminal?.status === "undone")
      throw new AdminAuggieError(
        "This operation was already undone.",
        409,
        "ADMIN_AUGGIE_ALREADY_UNDONE",
      );
    throw new AdminAuggieError(
      "The proposal expired. Prepare it again.",
      409,
      "ADMIN_AUGGIE_EXPIRED",
    );
  }
  if (
    !row.confirmation_sha256 ||
    (await sha256Hex(phrase.trim())) !== row.confirmation_sha256
  ) {
    await operationAudit(
      ctx,
      row,
      "admin_ai_confirmation_rejected",
      "failure",
      { code: "ADMIN_AUGGIE_CONFIRMATION_MISMATCH" },
      "Admin Auggie confirmation rejected because the exact phrase did not match",
    ).run();
    throw new AdminAuggieError(
      "Type the exact confirmation phrase shown in the proposal.",
      400,
      "ADMIN_AUGGIE_CONFIRMATION_MISMATCH",
    );
  }
  const args = safeJson<OperationArgs | null>(row.normalized_args_json, null);
  if (
    !args ||
    (args.action !== "archive" && args.action !== "restore") ||
    !Array.isArray(args.targets)
  )
    throw new AdminAuggieError(
      "The stored operation is invalid.",
      409,
      "ADMIN_AUGGIE_OPERATION_INVALID",
    );
  try {
    return await executeStatusOperation(ctx, row, args);
  } catch (error) {
    const replay = await ctx.db
      .prepare(`SELECT * FROM admin_ai_operations WHERE id = ? LIMIT 1`)
      .bind(row.id)
      .first<OperationRow>();
    if (replay?.status === "succeeded" && replay.result_json)
      return safeJson<Record<string, unknown>>(replay.result_json, {
        ok: true,
        operationId: replay.id,
      });
    if (error instanceof AdminAuggieError) {
      if (error.code === "ADMIN_AUGGIE_EXPIRED") {
        await expireOperation(ctx, replay || row);
        throw error;
      }
      await failOperation(
        ctx,
        row,
        error.code,
        error.code === "ADMIN_AUGGIE_STALE"
          ? "Admin Auggie confirmation rejected a stale student preview"
          : `Admin Auggie ${args.action} failed without a partial student write`,
      );
    }
    throw error;
  }
}

export async function prepareAdminAuggieUndo(
  request: Request,
  env: AdminAuggieEnv,
  operationId: string,
  locale: AdminAuggieLocale,
) {
  const ctx = await requireAdminAuggieContext(request, env, locale);
  const original = await loadBoundOperation(ctx, operationId);
  if (
    original.status !== "succeeded" ||
    !original.undo_expires_at ||
    Date.parse(original.undo_expires_at) <= Date.now()
  )
    throw new AdminAuggieError(
      "This operation is no longer eligible for safe undo.",
      409,
      "ADMIN_AUGGIE_UNDO_UNAVAILABLE",
    );
  if (original.undone_by_operation_id)
    throw new AdminAuggieError(
      "This operation was already undone.",
      409,
      "ADMIN_AUGGIE_ALREADY_UNDONE",
    );
  const originalArgs = safeJson<OperationArgs | null>(
    original.normalized_args_json,
    null,
  );
  const resultFingerprints = safeJson<Record<string, string>>(
    original.result_fingerprints_json || "{}",
    {},
  );
  if (!originalArgs || !Array.isArray(originalArgs.targets))
    throw new AdminAuggieError(
      "The original operation cannot be undone safely.",
      409,
      "ADMIN_AUGGIE_UNDO_UNAVAILABLE",
    );
  const current = await resolveStudentTargets(
    ctx,
    originalArgs.targets.map((target) => target.publicId),
  );
  if (
    current.some(
      (target) => statusState(target) !== resultFingerprints[target.id],
    )
  )
    throw new AdminAuggieError(
      "A student changed after the operation, so automatic undo is blocked.",
      409,
      "ADMIN_AUGGIE_UNDO_STALE",
    );
  const action: "archive" | "restore" =
    originalArgs.action === "archive" ? "restore" : "archive";
  const targets = current.map((target): StoredTarget => ({
    ...target,
    expectedState: statusState(target),
  }));
  const contribution =
    action === "restore"
      ? await contributionGuardForRestore(ctx, targets)
      : { guard: undefined, manualRequired: false };
  if (contribution.manualRequired)
    return manualRestoreResponse(ctx, "contribution_snapshot");
  const phrase = confirmationPhrase(action, targets.length);
  const undoContext: AdminAuggieContext = {
    ...ctx,
    requestId: `${ctx.requestId}:undo:${original.id}`.slice(0, 128),
  };
  const row = await insertOperation(undoContext, {
    toolName: `undo_student_${originalArgs.action}`,
    mode: "direct",
    status: "prepared",
    args: { action, targets, contributionGuard: contribution.guard },
    preview: {
      ...previewForStatus(action, targets),
      undoOfOperationId: original.id,
    },
    fingerprints: Object.fromEntries(
      targets.map((target) => [target.id, target.expectedState]),
    ),
    phrase,
    undoOf: original.id,
    expiresAtCap: earliestExpiry(
      original.undo_expires_at,
      contribution.guard
        ? bangkokMonthBoundary(contribution.guard.monthKey)
        : null,
    ),
  });
  return {
    kind: "proposal" as const,
    heading: localized(locale, "Undo proposal", "ข้อเสนอย้อนกลับ"),
    message: localized(
      locale,
      "Undo is a new write. Review it and confirm separately.",
      "การย้อนกลับเป็นการเขียนข้อมูลใหม่ โปรดตรวจสอบและยืนยันแยกต่างหาก",
    ),
    operation: operationProposal(row, locale),
  };
}

export async function getAdminAuggieOperation(
  request: Request,
  env: AdminAuggieEnv,
  operationId: string,
  locale: AdminAuggieLocale,
) {
  const ctx = await requireAdminAuggieContext(request, env, locale);
  const row = await loadBoundOperation(ctx, operationId);
  if (row.status === "undone") {
    return {
      operation: {
        ...operationProposal(row, locale),
        terminal: "undone" as const,
        result: null,
      },
    };
  }
  return {
    operation:
      row.result_json && row.status === "succeeded"
        ? {
            ...operationProposal(row, locale),
            result: safeJson(row.result_json, null),
          }
        : operationProposal(row, locale),
  };
}
