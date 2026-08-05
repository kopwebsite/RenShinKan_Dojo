import { normalizeRank, promoteRank, rankIndex, RANKS } from "../../shared/ranks";
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
  configuredMonthlyContributionAmount,
  currentBangkokMonthKey,
  hmacHex,
  isMonthKey,
  LIVE_ROSTER_STUDENT_SQL,
  rankColor,
  requestIdentifier,
  requireStudentDb,
  sha256Hex,
  type D1Database,
  type D1PreparedStatement,
  type StudentEnv,
} from "./studentRecords";
import {
  adminAuggieDelegatedRequestId,
  callAdminApi,
  type AdminApiRoute,
} from "./adminAuggieDelegation";
import {
  albumRecord,
  albumWithDetails,
  albumWithPhotoCaptions,
  albumWithPhotoOrder,
  albumsState,
  albumsWithOrder,
  dojoRecord,
  dojoState,
  dojoUpdateBody,
  livePhotos,
  newsletterLifecycle,
  newsletterRecord,
  newsletterSendStatus,
  newsletterState,
  newsletterStatusLabel,
  newsletterWithLifecycle,
  newsletterWithWebsiteState,
  photoRecord,
  sitePageRecord,
  sitePagesState,
  sitePagesWithStatus,
  type ContentRecord,
  type DojoRecord,
  type NewsletterLifecycle,
} from "./adminAuggieContent";
import {
  GALLERY_IDS,
  type GalleryAlbum,
  type GalleryId,
} from "../../shared/gallery";
import {
  NEWSLETTER_CATEGORIES,
  newsletterPublicationIssues,
  type NewsletterCategory,
} from "../../shared/newsletter";
import {
  activeFields,
  applyFlowMessage,
  currentField,
  flowCommand,
  flowDefinition,
  flowQuestionCount,
  flowSummaryRows,
  flowText,
  FLOW_WORDING,
  isFlowId,
  resolvedAnswers,
  rewindTo,
  stepBack,
  type FlowId,
  type FlowText,
  type FlowRuntime,
  type FlowState,
} from "./adminAuggieFlows";
import {
  clearFlowSession,
  deleteExpiredFlowSessions,
  readFlowSession,
  writeFlowSession,
  type FlowSessionOwner,
} from "./adminAuggieFlowStore";
import type { RecentEvent, SitePage, SiteSettings } from "./content";
import { readEditableContentFromStorage, type StorageEnv } from "./storage";
import {
  getBrevoSubscriberCount,
  missingBrevoEnv,
  type BrevoEnv,
} from "./brevo";
import { newsletterPublishingEnabled } from "./operationalControls";

type WorkersAiBinding = {
  run(
    model: string,
    input: unknown,
    options?: { signal?: AbortSignal },
  ): Promise<unknown>;
};

export type AdminAuggieEnv = StudentEnv &
  StorageEnv &
  BrevoEnv & {
    AI?: WorkersAiBinding;
    ADMIN_AUGGIE_MODEL?: string;
    NEWSLETTER_PUBLISHING_ENABLED?: string;
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

type BulkStudentAction =
  | "add_hours"
  | "approve_pending_hours"
  | "mass_rank_change"
  | "mass_promotion";

// Examination, payment and student-record operations are prepared here but
// executed by the reviewed administration endpoint. Every identifier below is
// resolved by the server from exact public Student IDs; the model never
// supplies a dojo, a role, a permission level, an internal row id, or a money
// amount.
type DelegatedKind =
  | "exam_status"
  | "exam_rejection"
  | "contribution_status"
  | "payment_proof_decision"
  | "student_record_update"
  | "student_hours"
  | "student_examination"
  | "student_profile_decision"
  | "bulk_student_action"
  | "student_create";

type DelegatedArgs = {
  kind: DelegatedKind;
  action: string;
  targets: StoredTarget[];
  route: AdminApiRoute;
  requiresSecondaryConfirmation: boolean;
  requiredPath: string;
  cycleId?: string;
  cycleName?: string;
  monthKey?: string;
  amount?: number | null;
  paymentType?: "exam" | "aat_annual" | "renshinkan_monthly";
  applicationId?: string;
  proofIds?: string[];
  coveredStudentCount?: number;
  // Student record, hour, examination, profile and bulk fields. Only the small
  // instruction is stored, never a copy of the record: the reviewed endpoint
  // always applies it to the row the server re-reads at confirmation time.
  bulkAction?: BulkStudentAction;
  currentRank?: string;
  newRank?: string;
  previousRank?: string;
  publicVisible?: boolean;
  previousPublicVisible?: boolean;
  dojoJoinedDate?: string;
  previousDojoJoinedDate?: string;
  hours?: number;
  levels?: number;
  location?: string;
  examinationDate?: string;
  passed?: boolean;
  profileDecision?: "approve" | "reject";
  pendingRequestCount?: number;
  pendingHours?: number;
  // New student record fields. Only the plain administrative details a new
  // profile needs are carried; notes, contact details, identity documents and
  // images are never collected here and stay in the reviewed student page.
  englishName?: string;
  thaiName?: string;
  dojoIdForCreate?: string;
  // Set only when the change is a plain, reversible field value that Admin
  // Auggie can put back exactly. Permanent history rows are never undoable.
  undoable?: boolean;
};

// Undoing a bulk rank change must put every student back in one transaction, so
// it is the one student write Admin Auggie performs itself instead of
// delegating. It only writes the rank the server recorded before the change.
type RankRevertArgs = {
  kind: "rank_revert";
  action: "rank_revert";
  targets: StoredTarget[];
  ranks: Record<string, string>;
  requiredPath: string;
};

// Newsletter, gallery, website and dojo operations follow the same rule as the
// examination and payment ones: Admin Auggie prepares and proves, and the
// reviewed administration endpoint performs the write. The stored arguments
// hold only the small instruction, never a copy of the record, so the change is
// always reapplied to the record the server itself re-reads at confirmation.
type ContentKind =
  | "newsletter_website_state"
  | "newsletter_lifecycle"
  | "newsletter_send"
  | "newsletter_delete"
  | "gallery_album_update"
  | "gallery_album_order"
  | "gallery_photo_captions"
  | "gallery_photo_order"
  | "gallery_publish"
  | "site_page_visibility"
  | "site_publish"
  | "dojo_settings"
  | "newsletter_create";

type ContentCaption = { photoId: string; caption?: string; alt?: string };

type ContentArgs = {
  kind: ContentKind;
  action: string;
  targets: StoredTarget[];
  route: AdminApiRoute;
  requiresSecondaryConfirmation: boolean;
  requiredPath: string;
  expectedState: string;
  affectedCount: number;
  newsletterSlug?: string;
  published?: boolean;
  lifecycle?: NewsletterLifecycle;
  recipientCount?: number;
  galleryId?: GalleryId;
  albumId?: string;
  albumIds?: string[];
  photoIds?: string[];
  captions?: ContentCaption[];
  albumTitle?: string;
  albumDescription?: string;
  albumDate?: string;
  albumVisibility?: GalleryAlbum["visibility"];
  coverPhotoId?: string;
  pageRoute?: string;
  pageStatus?: SitePage["status"];
  dojoId?: string;
  officialName?: string;
  shortName?: string;
  dojoActive?: boolean;
  sortOrder?: number;
  // New newsletter fields. A newsletter made here is always an unpublished
  // draft, so nothing reaches the website or anybody's email until the
  // administrator publishes or sends it through the existing reviewed steps.
  newsletterTitle?: string;
  newsletterSummary?: string;
  newsletterBody?: string;
  newsletterCategory?: NewsletterCategory;
  newsletterDate?: string;
};

type OperationArgsUnion =
  | OperationArgs
  | RankRevertArgs
  | DelegatedArgs
  | ContentArgs;

function isDelegatedArgs(value: unknown): value is DelegatedArgs {
  const args = objectValue(value);
  return Boolean(
    args &&
      typeof args.kind === "string" &&
      DELEGATED_KINDS.has(args.kind) &&
      typeof args.route === "string" &&
      Array.isArray(args.targets),
  );
}

function isRankRevertArgs(value: unknown): value is RankRevertArgs {
  const args = objectValue(value);
  return Boolean(
    args &&
      args.kind === "rank_revert" &&
      args.action === "rank_revert" &&
      Array.isArray(args.targets) &&
      objectValue(args.ranks),
  );
}

function isContentArgs(value: unknown): value is ContentArgs {
  const args = objectValue(value);
  return Boolean(
    args &&
      typeof args.kind === "string" &&
      CONTENT_KINDS.has(args.kind) &&
      typeof args.route === "string" &&
      typeof args.expectedState === "string" &&
      typeof args.requiredPath === "string",
  );
}

// Both delegated families are previewed, phrase-bound and executed by a
// reviewed endpoint, so neither is ever offered an Admin Auggie undo.
function isEndpointOwnedArgs(
  value: unknown,
): value is DelegatedArgs | ContentArgs {
  return isDelegatedArgs(value) || isContentArgs(value);
}

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
          "Sorry, something went wrong. Nothing was changed, and the rest of administration still works as normal.",
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
// Both approved models were measured against the same shortlisted requests on
// 5 August 2026. gpt-oss-120b answered in about 1.3 seconds against about 4.1
// seconds for glm-4.7-flash, and was never slower, so it is the default. The
// ADMIN_AUGGIE_MODEL setting can still name the other approved model.
const DEFAULT_MODEL = "@cf/openai/gpt-oss-120b";
const MAX_BODY_BYTES = 8 * 1024;
const MAX_MESSAGE_CHARS = 1_600;
const MAX_TARGETS = 50;
// The reviewed endpoints accept larger batches from a human operator. AI-
// prepared batches stay smaller so a single confirmation can never move more
// examination or money records than an administrator can read in one preview.
const MAX_EXAM_TARGETS = 15;
const MAX_CONTRIBUTION_TARGETS = 15;
const MAX_PAYSLIP_TARGETS = 10;
const DELEGATED_KINDS = new Set<string>([
  "exam_status",
  "exam_rejection",
  "contribution_status",
  "payment_proof_decision",
  "student_record_update",
  "student_hours",
  "student_examination",
  "student_profile_decision",
  "bulk_student_action",
  "student_create",
]);
// A bulk confirmation must never move more student records than an
// administrator can read in one preview card, so it stays well under the
// reviewed endpoint's own limit for a human operator.
const MAX_BULK_TARGETS = 25;
const CONTENT_KINDS = new Set<string>([
  "newsletter_website_state",
  "newsletter_lifecycle",
  "newsletter_send",
  "newsletter_delete",
  "gallery_album_update",
  "gallery_album_order",
  "gallery_photo_captions",
  "gallery_photo_order",
  "gallery_publish",
  "site_page_visibility",
  "site_publish",
  "dojo_settings",
  "newsletter_create",
]);
// One confirmation must cover no more records than an administrator can read in
// one preview card, so photo and album batches stay small.
const MAX_GALLERY_ITEMS = 60;
const OPERATION_TTL_MS = 10 * 60 * 1_000;
const UNDO_TTL_MS = 30 * 60 * 1_000;
// The tool-selection call is the only model call Admin Auggie makes. Eighteen
// seconds cut off answers that were still arriving, so the administrator saw a
// timeout instead of a result. Thirty seconds stays well inside the platform
// request budget while leaving the safe-failure path unchanged.
const AI_TIMEOUT_MS = 30_000;
const STUDENT_ID = /^[A-Z0-9]{2,8}-\d{4,}$/;
const NEWSLETTER_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// The reviewed gallery endpoint keeps an album or photo identifier only when it
// matches this shape, so the model may never name anything else.
const GALLERY_ITEM_ID = /^[A-Za-z0-9_-]{4,120}$/;
const SITE_ROUTE = /^\/[a-zA-Z0-9_./-]{0,200}$/;
const DOJO_ID = /^dojo-[a-z0-9-]{1,60}$/;

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

// The same cleaning as cleanText, except that line breaks survive. A guided
// answer may hold several replies on separate lines, and collapsing them into
// one line would turn three answers into one.
function cleanFlowText(value: unknown, max: number) {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFKC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
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

function parseStudentIds(value: unknown, max = MAX_TARGETS) {
  if (!Array.isArray(value) || value.length < 1 || value.length > max)
    throw new AdminAuggieError(
      `Choose between 1 and ${max} exact Student IDs.`,
    );
  const ids = Array.from(
    new Set(
      value.map((entry) => cleanText(entry, 40).toLocaleUpperCase("en-US")),
    ),
  );
  if (ids.length < 1 || ids.length > max || ids.some((id) => !STUDENT_ID.test(id)))
    throw new AdminAuggieError(
      "Use the exact public Student IDs shown in administration.",
    );
  return ids;
}

// A prepared operation stores one digest. Money changes and payslip decisions
// bind both required phrases into that single digest, so a confirmation that
// omits or mistypes the second phrase can never satisfy the first.
function confirmationDigest(primary: string, secondary?: string) {
  return sha256Hex(secondary ? `${primary}\n${secondary}` : primary);
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

const STUDENT_PATH = "/admin/students";
const PROFILE_REQUEST_PATH = "/admin/profile-requests";
const EXAM_PATH = "/admin/exam-applications";
const EXAM_PAYSLIP_PATH = "/admin/exam-payslips";
const CONTRIBUTION_PATH = "/admin/monthly-contributions";
const PAYMENT_PROOF_PATH = "/admin/payment-proofs";
const WEBSITE_PATH = "/admin/website";
const DOJO_SETTINGS_PATH = "/admin/dojos";

function galleryPath(galleryId: GalleryId) {
  return `/admin/galleries/${galleryId}`;
}

// Every examination and payment tool is gated by the administration page the
// signed-in administrator may already open. The same check runs again inside
// the tool handler, so a model that names a tool it was never offered is
// refused on the server.
function requirePathPermission(ctx: AdminAuggieContext, path: string) {
  if (!canAccessAdminPath(path, ctx.permission))
    throw new AdminAuggieError(
      "That administration area is not available in your current permission scope.",
      403,
      "ADMIN_AUGGIE_ROUTE_FORBIDDEN",
    );
  return path;
}

function permittedProofScopes(ctx: AdminAuggieContext) {
  const scopes: string[] = [];
  if (canAccessAdminPath(EXAM_PAYSLIP_PATH, ctx.permission)) scopes.push("exam");
  if (canAccessAdminPath(PAYMENT_PROOF_PATH, ctx.permission))
    scopes.push("contributions");
  return scopes;
}

function proofScopePath(scope: "exam" | "contributions") {
  return scope === "exam" ? EXAM_PAYSLIP_PATH : PAYMENT_PROOF_PATH;
}

type ToolDefinition = {
  name: string;
  description: string;
  parameters: {
    type: "object";
    additionalProperties: false;
    properties: Record<string, unknown>;
    required?: string[];
  };
};

// The guided conversations this administrator may start. The list is built
// from the same permission rules as every other tool, so a flow can never be
// offered, and can never be started, outside the administrator's own access.
function permittedFlows(ctx: AdminAuggieContext): FlowId[] {
  const flows: FlowId[] = [];
  if (canAccessAdminPath(STUDENT_PATH, ctx.permission))
    flows.push("create_student", "add_training_hours", "record_exam_result");
  if (canAccessAdminPath(WEBSITE_PATH, ctx.permission))
    flows.push("create_newsletter");
  return flows;
}

function toolSchemas(ctx: AdminAuggieContext) {
  const destinations = permittedDestinations(ctx).map((item) => item.key);
  const flows = permittedFlows(ctx);
  const definitions: ToolDefinition[] = [
    {
      name: "navigate_admin",
      description:
        "Open an administration page. Use this for uploads, media, private data, deletion, settings, audits, or anything no other tool covers.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: { destination: { type: "string", enum: destinations } },
        required: ["destination"],
      },
    },
    {
      name: "converse",
      description:
        "Reply to a greeting, a thank you, small talk, or a message that names no administration task. Choose this instead of guessing a tool. It only sends one short friendly reply with a few examples, and never reads, invents or changes anything.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {},
      },
    },
    {
      name: "look_up_information",
      description:
        "Look up a fact from the outside world through an approved source. Right now the only source is the current weather for a place. The site does the lookup itself; you never browse. Only the place the administrator typed is sent out — never anything about this dojo, its students, its money or its records. Do not use this for students, payments, examinations, the website or anything inside the dojo; use the dojo tools for those.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          topic: { type: "string", minLength: 1, maxLength: 40 },
          place: { type: "string", minLength: 1, maxLength: 80 },
        },
        required: ["topic", "place"],
      },
    },
    {
      name: "get_dashboard_summary",
      description:
        "Read the dashboard counts.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {},
      },
    },
    {
      name: "search_students",
      description:
        "Find students by exact Student ID or by name.",
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
        "Prepare archiving or restoring students, named by exact Student IDs.",
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
        "Prepare one bulk change for many exact Student IDs: add hours, approve pending hours, change rank by whole levels, or a mass promotion.",
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
            maxItems: MAX_BULK_TARGETS,
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
    {
      name: "propose_student_record_update",
      description:
        "Prepare a correction to one student, named by exact Student ID: rank, public-website visibility, or dojo-joined date. Give only the fields that change.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          studentId: { type: "string", minLength: 1, maxLength: 40 },
          currentRank: { type: "string", enum: [...RANKS] },
          publicVisible: { type: "boolean" },
          dojoJoinedDate: { type: "string", minLength: 10, maxLength: 10 },
        },
        required: ["studentId"],
      },
    },
    {
      name: "propose_student_hours",
      description:
        "Prepare adding training hours to one student, named by exact Student ID.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          studentId: { type: "string", minLength: 1, maxLength: 40 },
          hours: { type: "number", exclusiveMinimum: 0, maximum: 1000 },
          location: { type: "string", maxLength: 200 },
        },
        required: ["studentId", "hours"],
      },
    },
    {
      name: "propose_student_examination",
      description:
        "Prepare recording one examination result for one student, named by exact Student ID.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          studentId: { type: "string", minLength: 1, maxLength: 40 },
          attemptedRank: { type: "string", enum: [...RANKS] },
          passed: { type: "boolean" },
          location: { type: "string", minLength: 1, maxLength: 200 },
          examinationDate: { type: "string", minLength: 10, maxLength: 10 },
        },
        required: [
          "studentId",
          "attemptedRank",
          "passed",
          "location",
          "examinationDate",
        ],
      },
    },
    {
      name: "propose_student_create",
      description:
        "Prepare creating one new student record. Every detail must already be known; otherwise choose start_guided_flow.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          englishName: { type: "string", minLength: 1, maxLength: 120 },
          thaiName: { type: "string", maxLength: 120 },
          currentRank: { type: "string", enum: [...RANKS] },
          dojoId: { type: "string", minLength: 1, maxLength: 80 },
          dojoJoinedDate: { type: "string", minLength: 10, maxLength: 10 },
          currentTrainingHours: { type: "number", minimum: 0, maximum: 1000 },
        },
        required: ["englishName"],
      },
    },
  ];
  if (flows.length) {
    definitions.push({
      name: "start_guided_flow",
      description:
        "Start a step-by-step conversation that asks the administrator for each detail in turn. Choose this whenever they want to create, add or record something but have not given every detail.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: { flow: { type: "string", enum: flows } },
        required: ["flow"],
      },
    });
  }
  if (canAccessAdminPath(PROFILE_REQUEST_PATH, ctx.permission)) {
    definitions.push({
      name: "propose_student_profile_decision",
      description:
        "Prepare approving or rejecting one waiting profile request, named by exact Student ID.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          studentId: { type: "string", minLength: 1, maxLength: 40 },
          decision: { type: "string", enum: ["approve", "reject"] },
        },
        required: ["studentId", "decision"],
      },
    });
  }
  if (canAccessAdminPath(EXAM_PATH, ctx.permission)) {
    definitions.push(
      {
        name: "get_examination_summary",
        description:
          "Read counts for the current examination cycle.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {},
        },
      },
      {
        name: "list_examination_applications",
        description:
          "List examination roster rows for the current cycle.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            query: { type: "string", minLength: 1, maxLength: 120 },
            status: {
              type: "string",
              enum: ["not_signed_up", "unpaid", "paid"],
            },
            limit: { type: "integer", minimum: 1, maximum: 20 },
          },
        },
      },
      {
        name: "propose_examination_status",
        description:
          "Prepare an examination status change for exact Student IDs in the current cycle.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            status: {
              type: "string",
              enum: ["not_signed_up", "unpaid", "paid"],
            },
            studentIds: {
              type: "array",
              minItems: 1,
              maxItems: MAX_EXAM_TARGETS,
              items: { type: "string" },
            },
          },
          required: ["status", "studentIds"],
        },
      },
      {
        name: "propose_examination_rejection",
        description:
          "Prepare rejecting one submitted examination application, named by exact Student ID.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            studentId: { type: "string", minLength: 1, maxLength: 40 },
          },
          required: ["studentId"],
        },
      },
    );
  }
  if (canAccessAdminPath(CONTRIBUTION_PATH, ctx.permission)) {
    definitions.push(
      {
        name: "get_contribution_summary",
        description:
          "Read monthly contribution counts for one month.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            month: { type: "string", minLength: 7, maxLength: 7 },
          },
        },
      },
      {
        name: "propose_contribution_status",
        description:
          "Prepare a monthly contribution status change for exact Student IDs. This is a money change.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            status: {
              type: "string",
              enum: ["no_submission", "awaiting_payment", "paid"],
            },
            month: { type: "string", minLength: 7, maxLength: 7 },
            studentIds: {
              type: "array",
              minItems: 1,
              maxItems: MAX_CONTRIBUTION_TARGETS,
              items: { type: "string" },
            },
          },
          required: ["status", "studentIds"],
        },
      },
    );
  }
  const proofScopes = permittedProofScopes(ctx);
  if (proofScopes.length) {
    definitions.push(
      {
        name: "list_payment_proofs",
        description:
          "List submitted payslips awaiting review.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            scope: { type: "string", enum: proofScopes },
            status: {
              type: "string",
              enum: ["pending_review", "approved", "denied"],
            },
            limit: { type: "integer", minimum: 1, maximum: 20 },
          },
          required: ["scope"],
        },
      },
      {
        name: "propose_payment_proof_decision",
        description:
          "Prepare approving or denying submitted payslips, named by the exact Student IDs that sent them.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            decision: { type: "string", enum: ["approve", "deny"] },
            scope: { type: "string", enum: proofScopes },
            studentIds: {
              type: "array",
              minItems: 1,
              maxItems: MAX_PAYSLIP_TARGETS,
              items: { type: "string" },
            },
          },
          required: ["decision", "scope", "studentIds"],
        },
      },
    );
  }
  if (canAccessAdminPath(WEBSITE_PATH, ctx.permission)) {
    definitions.push(
      {
        name: "list_newsletters",
        description:
          "List saved newsletters and events with web address, date and state.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            query: { type: "string", minLength: 1, maxLength: 120 },
            contentType: { type: "string", enum: ["newsletter", "event"] },
            state: {
              type: "string",
              enum: ["draft", "published", "sent", "archived", "trash"],
            },
            limit: { type: "integer", minimum: 1, maximum: 20 },
          },
        },
      },
      {
        name: "propose_newsletter_create",
        description:
          "Prepare creating one new newsletter draft. Every detail must already be known; otherwise choose start_guided_flow.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string", minLength: 1, maxLength: 160 },
            summary: { type: "string", minLength: 1, maxLength: 500 },
            body: { type: "string", minLength: 1, maxLength: 5000 },
            category: { type: "string", enum: [...NEWSLETTER_CATEGORIES] },
            date: { type: "string", minLength: 10, maxLength: 10 },
            webAddress: { type: "string", minLength: 1, maxLength: 100 },
          },
          required: ["title", "summary", "body", "category", "date"],
        },
      },
      {
        name: "propose_newsletter_website_state",
        description:
          "Prepare publishing or unpublishing one newsletter, named by its exact web address.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            webAddress: { type: "string", minLength: 1, maxLength: 100 },
            published: { type: "boolean" },
          },
          required: ["webAddress", "published"],
        },
      },
      {
        name: "propose_newsletter_lifecycle",
        description:
          "Prepare archiving, trashing or restoring one newsletter, named by its exact web address.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            webAddress: { type: "string", minLength: 1, maxLength: 100 },
            lifecycle: {
              type: "string",
              enum: ["active", "archived", "trash"],
            },
          },
          required: ["webAddress", "lifecycle"],
        },
      },
      {
        name: "propose_newsletter_send",
        description:
          "Prepare sending one newsletter as real email to every subscriber, named by its exact web address.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            webAddress: { type: "string", minLength: 1, maxLength: 100 },
          },
          required: ["webAddress"],
        },
      },
      {
        name: "propose_newsletter_delete",
        description:
          "Prepare permanently deleting one newsletter that is already in the trash, named by its exact web address.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            webAddress: { type: "string", minLength: 1, maxLength: 100 },
          },
          required: ["webAddress"],
        },
      },
      {
        name: "list_site_pages",
        description:
          "List website pages with web address and draft or published state.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            limit: { type: "integer", minimum: 1, maximum: 20 },
          },
        },
      },
      {
        name: "propose_site_page_visibility",
        description:
          "Prepare marking one website page as draft or published inside the website draft.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            route: { type: "string", minLength: 1, maxLength: 200 },
            status: { type: "string", enum: ["draft", "published"] },
          },
          required: ["route", "status"],
        },
      },
      {
        name: "propose_site_publish",
        description:
          "Prepare publishing the whole website draft to the live public website.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {},
        },
      },
    );
  }
  const galleries = GALLERY_IDS.filter((galleryId) =>
    canAccessAdminPath(galleryPath(galleryId), ctx.permission),
  );
  if (galleries.length) {
    definitions.push(
      {
        name: "list_gallery_albums",
        description:
          "List albums in one gallery, or the photos inside one album.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            galleryId: { type: "string", enum: [...galleries] },
            albumId: { type: "string", minLength: 1, maxLength: 140 },
            limit: { type: "integer", minimum: 1, maximum: 20 },
          },
          required: ["galleryId"],
        },
      },
      {
        name: "propose_gallery_album_update",
        description:
          "Prepare a change to one album's title, description, date, visibility or cover, named by its exact album id.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            galleryId: { type: "string", enum: [...galleries] },
            albumId: { type: "string", minLength: 1, maxLength: 140 },
            title: { type: "string", minLength: 1, maxLength: 160 },
            description: { type: "string", maxLength: 2000 },
            date: { type: "string", maxLength: 40 },
            visibility: {
              type: "string",
              enum: ["published", "draft", "hidden"],
            },
            coverPhotoId: { type: "string", minLength: 1, maxLength: 140 },
          },
          required: ["galleryId", "albumId"],
        },
      },
      {
        name: "propose_gallery_album_order",
        description:
          "Prepare a new order for the albums of one gallery. Give every exact album id once.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            galleryId: { type: "string", enum: [...galleries] },
            albumIds: {
              type: "array",
              minItems: 1,
              maxItems: MAX_GALLERY_ITEMS,
              items: { type: "string" },
            },
          },
          required: ["galleryId", "albumIds"],
        },
      },
      {
        name: "propose_gallery_photo_captions",
        description:
          "Prepare new captions or alternative text for photos in one album, named by exact photo ids.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            galleryId: { type: "string", enum: [...galleries] },
            albumId: { type: "string", minLength: 1, maxLength: 140 },
            photos: {
              type: "array",
              minItems: 1,
              maxItems: MAX_GALLERY_ITEMS,
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  photoId: { type: "string", minLength: 1, maxLength: 140 },
                  caption: { type: "string", maxLength: 1000 },
                  alt: { type: "string", maxLength: 300 },
                },
                required: ["photoId"],
              },
            },
          },
          required: ["galleryId", "albumId", "photos"],
        },
      },
      {
        name: "propose_gallery_photo_order",
        description:
          "Prepare a new order for the photos inside one album. Give every exact photo id once.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            galleryId: { type: "string", enum: [...galleries] },
            albumId: { type: "string", minLength: 1, maxLength: 140 },
            photoIds: {
              type: "array",
              minItems: 1,
              maxItems: MAX_GALLERY_ITEMS,
              items: { type: "string" },
            },
          },
          required: ["galleryId", "albumId", "photoIds"],
        },
      },
      {
        name: "propose_gallery_publish",
        description:
          "Prepare publishing the gallery draft to the live public website.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            galleryId: { type: "string", enum: [...galleries] },
          },
        },
      },
    );
  }
  if (canAccessAdminPath(DOJO_SETTINGS_PATH, ctx.permission)) {
    definitions.push(
      {
        name: "list_dojos",
        description:
          "List the dojos with their exact dojo id, names, code, active state and order.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {},
        },
      },
      {
        name: "propose_dojo_settings",
        description:
          "Prepare a change to one dojo's names, active state or display order, named by its exact dojo id.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            dojoId: { type: "string", minLength: 1, maxLength: 80 },
            officialName: { type: "string", minLength: 1, maxLength: 160 },
            shortName: { type: "string", minLength: 1, maxLength: 100 },
            active: { type: "boolean" },
            sortOrder: { type: "integer", minimum: 0, maximum: 10000 },
          },
          required: ["dojoId"],
        },
      },
    );
  }
  return definitions;
}

// Every tool this administrator is allowed to use, in the shape the model
// expects. Kept separate from the shortlist below so the permission rules are
// applied once, before anything is narrowed down.
function allToolSchemas(ctx: AdminAuggieContext) {
  return toolSchemas(ctx).map((definition) => ({
    type: "function" as const,
    function: definition,
  }));
}

// Which tools each subject and each administration page is about. Sending all
// of them on every message cost thousands of characters and made a simple
// question time out. Narrowing the list can only ever remove tools from the
// permitted set built above, so it can never widen what an administrator may
// reach, and the server still rechecks the permission of whatever is chosen.
type ToolTopic = { words: RegExp; paths: readonly string[] };

const STUDENT_WORDS =
  /student|pupil|member|roster|profile|rank|belt|grade|promot|archive|restore|hour|training|exam|test|grading|create|make|add|new|register|enrol|enroll|record/i;

const TOOL_TOPICS: Record<string, ToolTopic> = {
  get_dashboard_summary: {
    words: /dashboard|summary|overview|count|how many|waiting|pending|today/i,
    paths: ["/admin/dashboard"],
  },
  search_students: {
    words: /student|find|search|look ?up|who is|name|roster|member|pupil/i,
    paths: ["/admin/students", "/admin/profile-requests"],
  },
  propose_student_status: {
    words: /archive|restore|unarchive|deactivate|reactivate|leave|left|quit|return/i,
    paths: ["/admin/students"],
  },
  propose_bulk_student_action: {
    words: /bulk|batch|everyone|all students|mass|group|several|many|whole class/i,
    paths: ["/admin/students"],
  },
  propose_student_record_update: {
    words: /rank|belt|grade|correct|fix|change|update|edit|visible|website|joined|date/i,
    paths: ["/admin/students"],
  },
  propose_student_hours: {
    words: /hour|training|practice|session|attend/i,
    paths: ["/admin/students", "/admin/training-requests"],
  },
  propose_student_examination: {
    words: /exam|test|grading|pass|fail|result|promot|attempt/i,
    paths: ["/admin/students", "/admin/examination-records"],
  },
  propose_student_create: {
    words: /new student|create|make|add|register|enrol|enroll|sign ?up|joined/i,
    paths: ["/admin/students"],
  },
  propose_student_profile_decision: {
    words: /profile|picture|photo request|approve|reject|waiting|request/i,
    paths: ["/admin/profile-requests"],
  },
  get_examination_summary: {
    words: /exam|test|grading|cycle|signed up|unpaid|paid/i,
    paths: ["/admin/exam-applications", "/admin/examination-records"],
  },
  list_examination_applications: {
    words: /exam|test|grading|applicant|application|roster|signed up|unpaid|paid/i,
    paths: ["/admin/exam-applications"],
  },
  propose_examination_status: {
    words: /exam|test|grading|unpaid|paid|signed up|status/i,
    paths: ["/admin/exam-applications"],
  },
  propose_examination_rejection: {
    words: /exam|application|reject|refuse|decline/i,
    paths: ["/admin/exam-applications"],
  },
  get_contribution_summary: {
    words: /contribution|monthly|dues|subscription|month/i,
    paths: ["/admin/monthly-contributions"],
  },
  propose_contribution_status: {
    words: /contribution|monthly|dues|subscription|paid|awaiting|money/i,
    paths: ["/admin/monthly-contributions"],
  },
  list_payment_proofs: {
    words: /payslip|proof|receipt|slip|payment|transfer|evidence/i,
    paths: ["/admin/payment-proofs", "/admin/exam-payslips"],
  },
  propose_payment_proof_decision: {
    words: /payslip|proof|receipt|slip|approve|deny|payment/i,
    paths: ["/admin/payment-proofs", "/admin/exam-payslips"],
  },
  list_newsletters: {
    words: /newsletter|news|event|article|post|bulletin/i,
    paths: ["/admin/website", "/admin/site-editor"],
  },
  propose_newsletter_create: {
    words: /newsletter|news|article|post|bulletin|write|create|make|new/i,
    paths: ["/admin/website"],
  },
  propose_newsletter_website_state: {
    words: /newsletter|publish|unpublish|show|hide|live|website/i,
    paths: ["/admin/website"],
  },
  propose_newsletter_lifecycle: {
    words: /newsletter|archive|trash|bin|restore|remove/i,
    paths: ["/admin/website"],
  },
  propose_newsletter_send: {
    words: /send|email|subscriber|mail|blast|deliver/i,
    paths: ["/admin/website"],
  },
  propose_newsletter_delete: {
    words: /delete|permanent|remove for good|purge|trash/i,
    paths: ["/admin/website"],
  },
  list_site_pages: {
    words: /page|website|site|menu|route/i,
    paths: ["/admin/site-editor", "/admin/website"],
  },
  propose_site_page_visibility: {
    words: /page|draft|publish|hide|show|website|site/i,
    paths: ["/admin/site-editor"],
  },
  propose_site_publish: {
    words: /publish|go live|website|site|release/i,
    paths: ["/admin/site-editor", "/admin/website"],
  },
  list_gallery_albums: {
    words: /gallery|album|photo|picture|image/i,
    paths: ["/admin/galleries/"],
  },
  propose_gallery_album_update: {
    words: /album|gallery|title|cover|description|visibility|photo/i,
    paths: ["/admin/galleries/"],
  },
  propose_gallery_album_order: {
    words: /album|gallery|order|sort|arrange|rearrange|move/i,
    paths: ["/admin/galleries/"],
  },
  propose_gallery_photo_captions: {
    words: /caption|alt|describe|photo|picture|image/i,
    paths: ["/admin/galleries/"],
  },
  propose_gallery_photo_order: {
    words: /photo|picture|image|order|sort|arrange|rearrange/i,
    paths: ["/admin/galleries/"],
  },
  propose_gallery_publish: {
    words: /gallery|publish|go live|album/i,
    paths: ["/admin/galleries/"],
  },
  list_dojos: {
    words: /dojo|branch|location|club/i,
    paths: ["/admin/dojos"],
  },
  propose_dojo_settings: {
    words: /dojo|branch|club|name|active|order|setting/i,
    paths: ["/admin/dojos"],
  },
  start_guided_flow: {
    words: STUDENT_WORDS,
    paths: [
      "/admin/students",
      "/admin/website",
      "/admin/examination-records",
      "/admin/training-requests",
    ],
  },
  look_up_information: {
    words:
      /weather|forecast|temperature|raining|climate|humid|wind|sunny|snow|how (hot|cold)|degrees|look ?up|search the (web|internet)|on the internet|google/i,
    paths: [],
  },
};

// Thai wording for the same subjects. An administrator working in Thai must get
// exactly the same shortlist as one working in English.
const THAI_SUBJECTS: ReadonlyArray<readonly [RegExp, readonly string[]]> = [
  [
    /นักเรียน|สมาชิก|ประวัติ|รายชื่อ/,
    [
      "search_students",
      "propose_student_status",
      "propose_student_record_update",
      "propose_student_create",
      "start_guided_flow",
    ],
  ],
  [
    /ชั่วโมง|ฝึก|ฝึกซ้อม/,
    ["propose_student_hours", "propose_bulk_student_action", "start_guided_flow"],
  ],
  [
    /สอบ|การสอบ|ผลสอบ|เลื่อนขั้น|ระดับ|สายพาน/,
    [
      "propose_student_examination",
      "get_examination_summary",
      "list_examination_applications",
      "propose_examination_status",
      "propose_student_record_update",
      "start_guided_flow",
    ],
  ],
  [
    /จดหมายข่าว|ข่าว|บทความ|กิจกรรม/,
    [
      "list_newsletters",
      "propose_newsletter_create",
      "propose_newsletter_website_state",
      "propose_newsletter_lifecycle",
      "start_guided_flow",
    ],
  ],
  [/ส่งอีเมล|อีเมล|สมาชิกรับข่าว/, ["propose_newsletter_send"]],
  [
    /แกลเลอรี|อัลบั้ม|รูป|ภาพ/,
    [
      "list_gallery_albums",
      "propose_gallery_album_update",
      "propose_gallery_photo_captions",
      "propose_gallery_publish",
    ],
  ],
  [
    /เว็บไซต์|หน้าเว็บ|เผยแพร่/,
    ["list_site_pages", "propose_site_page_visibility", "propose_site_publish"],
  ],
  [/โดโจ/, ["list_dojos", "propose_dojo_settings"]],
  [
    /เงินสมทบ|รายเดือน|ค่าบำรุง/,
    ["get_contribution_summary", "propose_contribution_status"],
  ],
  [
    /หลักฐาน|สลิป|ชำระเงิน|โอนเงิน/,
    ["list_payment_proofs", "propose_payment_proof_decision"],
  ],
  [/โปรไฟล์|คำขอ/, ["propose_student_profile_decision"]],
  [/สรุป|แดชบอร์ด|ภาพรวม|จำนวน/, ["get_dashboard_summary"]],
  [
    /สร้าง|เพิ่ม|บันทึก|ทำใหม่|ลงทะเบียน/,
    ["start_guided_flow", "propose_student_create", "propose_newsletter_create"],
  ],
  [/เก็บถาวร|กู้คืน/, ["propose_student_status", "propose_newsletter_lifecycle"]],
  [/ลบ/, ["propose_newsletter_delete"]],
  [/อากาศ|สภาพอากาศ|พยากรณ์|อุณหภูมิ|ฝนตก|ค้นหาข้อมูล/, ["look_up_information"]],
];

// navigate_admin is the safe way out of anything unsupported, so it is always
// offered. converse is the plain answer to a greeting or an unclear message.
// The others give the model a way to look a record up before naming it, and a
// way to start a guided conversation.
const ALWAYS_OFFERED = [
  "navigate_admin",
  "converse",
  "search_students",
  "start_guided_flow",
] as const;

const MAX_OFFERED_TOOLS = 12;

export function relevantToolNames(input: {
  available: readonly string[];
  message: string;
  currentPath: string;
}) {
  const message = input.message.toLocaleLowerCase("en-US");
  const path = normalizeAdminPath(input.currentPath);
  const thaiMatches = new Set<string>();
  for (const [pattern, names] of THAI_SUBJECTS)
    if (pattern.test(input.message)) for (const name of names) thaiMatches.add(name);

  const scored = input.available.map((name) => {
    const topic = TOOL_TOPICS[name];
    let score = 0;
    if (topic?.words.test(message)) score += 2;
    if (thaiMatches.has(name)) score += 2;
    if (
      topic?.paths.some((candidate) =>
        candidate.endsWith("/") ? path.startsWith(candidate) : path === candidate,
      )
    )
      score += 1;
    if ((ALWAYS_OFFERED as readonly string[]).includes(name)) score += 100;
    return { name, score };
  });

  const chosen = scored
    .filter((entry) => entry.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        input.available.indexOf(left.name) - input.available.indexOf(right.name),
    )
    .slice(0, MAX_OFFERED_TOOLS)
    .map((entry) => entry.name);

  // A message that matches no subject at all still needs somewhere to go, so
  // the shortlist falls back to reading tools plus the safe page opener.
  if (chosen.length <= ALWAYS_OFFERED.length) {
    for (const name of ["get_dashboard_summary", "list_newsletters", "list_dojos"])
      if (input.available.includes(name) && !chosen.includes(name))
        chosen.push(name);
  }
  return chosen;
}

// The complete permission-filtered catalogue, before any shortlist is applied.
// Exported so tests and the release speed check can measure exactly what used
// to be sent on every single message.
export function adminAuggieToolCatalogue(permission: AdminPermission) {
  return allToolSchemas({
    permission,
    currentPath: "/admin/dashboard",
  } as AdminAuggieContext);
}

function selectedToolSchemas(ctx: AdminAuggieContext, message: string) {
  const all = allToolSchemas(ctx);
  const names = relevantToolNames({
    available: all.map((entry) => entry.function.name),
    message,
    currentPath: ctx.currentPath,
  });
  const shortlist = all.filter((entry) => names.includes(entry.function.name));
  return shortlist.length ? shortlist : all;
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
        "Sorry, Admin Auggie is not available just now. The rest of the administration pages still work as normal.",
        "ขออภัย ขณะนี้ Admin Auggie ไม่พร้อมใช้งาน หน้าผู้ดูแลอื่น ๆ ยังใช้งานได้ตามปกติ",
      ),
      503,
      "ADMIN_AUGGIE_AI_UNAVAILABLE",
    );
  const configured = ctx.env.ADMIN_AUGGIE_MODEL?.trim() || DEFAULT_MODEL;
  const model = MODEL_ALLOWLIST.has(configured) ? configured : DEFAULT_MODEL;
  const tools = selectedToolSchemas(ctx, message);
  const deadline = Date.now() + AI_TIMEOUT_MS;

  const attempt = async () => {
    const controller = new AbortController();
    const remaining = deadline - Date.now();
    const selection = ctx.env.AI!.run(
      model,
      {
        messages: [
          {
            role: "system",
            content:
              "Choose exactly one tool from the list. Never answer with prose. Never invent an ID, name, rank, date, amount, hours, web address, album id or photo id. Choose converse for a greeting, a thank you, small talk, or a message that names no administration task. Choose look_up_information for a question about the current weather in a place, or another plain outside fact. When a record is named only by a person's name, choose the matching search or list tool first. Choose navigate_admin for uploads, media, private data, or anything no tool covers. Choose start_guided_flow when the administrator wants to create, add or record something but has not given the details. Every propose tool only prepares a change: the server rechecks everything and the administrator must type an exact confirmation before anything is written.",
          },
          { role: "user", content: message },
        ],
        // Only the tools that could apply to this message and this page are
        // sent. The shortlist is drawn from the permission-filtered list above,
        // so it can only ever be smaller, never wider.
        tools,
        tool_choice: "required",
        parallel_tool_calls: false,
        max_completion_tokens: 300,
        temperature: 0,
      },
      { signal: controller.signal },
    );
    let timeoutId = 0;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => {
          controller.abort("admin-auggie-timeout");
          reject(
            new AdminAuggieError(
              localized(
                ctx.locale,
                "Admin Auggie took too long and stopped safely. Nothing was changed. Please try again.",
                "Admin Auggie ใช้เวลานานเกินไปและหยุดอย่างปลอดภัย ไม่มีการเปลี่ยนแปลงใด ๆ โปรดลองอีกครั้ง",
              ),
              503,
              "ADMIN_AUGGIE_TIMEOUT",
            ),
          );
        },
        Math.max(1_000, remaining),
      ) as unknown as number;
    });
    try {
      return await Promise.race([selection, timeout]);
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const usable = (calls: ToolCall[]) =>
    calls.length === 1 && Boolean(calls[0].name) && Boolean(objectValue(calls[0].arguments));

  let calls = normalizeToolCalls(await attempt());
  // The faster model very occasionally answers with no tool call at all. One
  // more try still finishes well inside the limit, and turns what the
  // administrator would have seen as a failure into an ordinary answer.
  if (!usable(calls) && deadline - Date.now() > 5_000)
    calls = normalizeToolCalls(await attempt());

  // A greeting, a thank you or an unclear request matches no action, so the
  // model can return nothing usable even after a second try. That is not a
  // failure. Fall back to a plain, friendly conversation reply instead of
  // refusing the request, so the administrator never sees a raw error for
  // ordinary talk. Every genuine tool the model does name still goes through
  // unchanged, and the server still rechecks it.
  if (!usable(calls)) return { name: "converse", arguments: {} };
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
    heading: localized(ctx.locale, "Here is your dashboard", "สรุปแดชบอร์ดของคุณ"),
    message: localized(
      ctx.locale,
      "These are the numbers for your own dojo and access.",
      "นี่คือตัวเลขสำหรับโดโจและสิทธิ์การเข้าถึงของคุณ",
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
          "Here is what I found. Please use the exact Student ID when you want a change made.",
          "นี่คือผลการค้นหา หากต้องการให้เปลี่ยนแปลงข้อมูล โปรดใช้รหัสนักเรียนให้ตรง",
        )
      : localized(
          ctx.locale,
          "Sorry, I could not find a student matching that. Please check the spelling or the Student ID.",
          "ขออภัย ไม่พบนักเรียนที่ตรงกัน โปรดตรวจสอบการสะกดหรือรหัสนักเรียนอีกครั้ง",
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
    args: OperationArgsUnion;
    preview: Record<string, unknown>;
    fingerprints: Record<string, string>;
    phrase?: string;
    secondaryPhrase?: string;
    undoOf?: string | null;
    expiresAtCap?: string | null;
    // Website content has no student rows, so its own affected count and dojo
    // list are supplied instead of being derived from student targets.
    affectedCount?: number;
    affectedLabel?: string;
    dojoIds?: string[];
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
          input.phrase
            ? await confirmationDigest(input.phrase, input.secondaryPhrase)
            : null,
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
          affectedCount: input.affectedCount ?? input.args.targets.length,
          dojoIds:
            input.dojoIds ??
            Array.from(
              new Set(input.args.targets.map((target) => target.dojoId)),
            ),
          expiresAt,
        },
        source: "admin_ai",
        requestId: ctx.requestId,
        summary: `${input.mode === "direct" ? "Prepared" : "Guided"} Admin Auggie ${input.toolName} for ${input.affectedCount ?? input.args.targets.length} ${input.affectedLabel || "student"}(s)`,
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
  const stored = safeJson<OperationArgsUnion | null>(
    row.normalized_args_json,
    null,
  );
  const endpointOwned = isEndpointOwnedArgs(stored) ? stored : null;
  const rankRevert = isRankRevertArgs(stored);
  const args = (endpointOwned ||
    (stored as OperationArgs | null) || {
      action: "archive",
      targets: [],
    }) as { action: string; targets: StoredTarget[] };
  const confirmable =
    row.execution_mode === "direct" &&
    row.status === "prepared" &&
    Date.parse(row.expires_at) > Date.now();
  const phrase = !confirmable
    ? undefined
    : preview.confirmationPhrase
      ? String(preview.confirmationPhrase)
      : confirmationPhrase(
          args.action as "archive" | "restore",
          args.targets.length,
        );
  const secondaryPhrase =
    confirmable && endpointOwned?.requiresSecondaryConfirmation
      ? String(preview.secondaryConfirmationPhrase || "")
      : undefined;
  const affectedCount = Number(preview.count || args.targets.length || 0);
  const affectedDojos = Array.isArray(preview.dojos)
    ? preview.dojos.filter((dojo): dojo is string => typeof dojo === "string")
    : [];
  const highImpact =
    confirmable && (affectedCount >= 10 || affectedDojos.length > 1);
  // A website, newsletter or gallery proposal carries its own sentence because
  // the student wording ("recheck every Student ID") would not describe it.
  const previewWarning =
    confirmable &&
    typeof preview.warningEn === "string" &&
    typeof preview.warningTh === "string"
      ? localized(locale, preview.warningEn, preview.warningTh)
      : "";
  return {
    id: row.id,
    toolName: row.tool_name,
    executable: confirmable,
    status: row.status,
    expiresAt: row.expires_at,
    confirmationPhrase: phrase,
    secondaryConfirmationPhrase: secondaryPhrase,
    requiresSecondaryConfirmation: Boolean(secondaryPhrase),
    undoable: rankRevert
      ? false
      : endpointOwned
        ? (endpointOwned as DelegatedArgs).undoable === true
        : true,
    highImpact,
    preview,
    path: endpointOwned ? endpointOwned.requiredPath : "/admin/students",
    warning:
      row.status === "undone"
        ? localized(
            locale,
            "This was put back safely.",
            "รายการนี้ถูกย้อนกลับอย่างปลอดภัยแล้ว",
          )
        : row.status === "succeeded"
          ? localized(
              locale,
              "This is already saved, so it cannot be confirmed a second time.",
              "บันทึกเรียบร้อยแล้ว จึงไม่สามารถยืนยันซ้ำได้",
            )
          : row.status === "expired"
            ? localized(
                locale,
                "This has been waiting too long, so it has lapsed. Please ask me again.",
                "รายการนี้รอนานเกินไปจึงหมดอายุ โปรดสอบถามอีกครั้ง",
              )
            : row.status === "failed"
              ? localized(
                  locale,
                  "This did not go through. Nothing at all was saved, not even part of it.",
                  "รายการนี้ไม่สำเร็จ ไม่มีการบันทึกใด ๆ แม้เพียงบางส่วน",
                )
              : previewWarning
                ? previewWarning
                : highImpact
                ? localized(
                    locale,
                    `High-impact change: ${affectedCount} records across ${affectedDojos.length || 1} dojo(s). No change has been made. Recheck every Student ID and dojo before typing the exact confirmation phrase.`,
                    `การเปลี่ยนแปลงที่มีผลกระทบสูง: ${affectedCount} ระเบียนใน ${affectedDojos.length || 1} โดโจ ยังไม่มีการเปลี่ยนแปลง โปรดตรวจรหัสนักเรียนและโดโจทุกรายการก่อนพิมพ์ข้อความยืนยันให้ตรง`,
                  )
                : secondaryPhrase
                  ? localized(
                      locale,
                      `No change has been made. This is a money or payslip decision for ${affectedCount} record(s), so it needs two exact confirmations. Open the reviewed page and inspect the evidence yourself before confirming. Auggie cannot be undone here.`,
                      `ยังไม่มีการเปลี่ยนแปลง นี่เป็นการเปลี่ยนแปลงทางการเงินหรือการตัดสินหลักฐานการชำระเงินจำนวน ${affectedCount} รายการ จึงต้องยืนยันสองครั้งให้ตรงทุกตัวอักษร โปรดเปิดหน้าที่มีการตรวจสอบและตรวจหลักฐานด้วยตนเองก่อนยืนยัน Auggie ไม่สามารถย้อนกลับรายการนี้ได้`,
                    )
                  : row.execution_mode === "direct"
                    ? localized(
                        locale,
                        "Nothing has changed yet. When you are happy with it, type the exact phrase below and press confirm.",
                        "ยังไม่มีการเปลี่ยนแปลง เมื่อคุณตรวจสอบเรียบร้อยแล้ว พิมพ์ข้อความด้านล่างให้ตรงและกดยืนยัน",
                      )
                    : localized(
                        locale,
                        "This is a preview only. Please open Student records and finish it there.",
                        "นี่เป็นเพียงตัวอย่าง โปรดเปิดระเบียนนักเรียนและดำเนินการต่อที่นั่น",
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

// --- Examination and payment reads -----------------------------------------
// Every statement below is parameter-bound and repeats the same dojo and
// permission predicates the reviewed endpoint uses. Nothing here writes.

const ACTIVE_ROSTER_PREDICATE = LIVE_ROSTER_STUDENT_SQL;

async function activeExaminationCycle(ctx: AdminAuggieContext) {
  return ctx.db
    .prepare(
      `SELECT id, name FROM examination_cycles WHERE status = 'active'
      ORDER BY created_at DESC LIMIT 1`,
    )
    .first<{ id: string; name: string }>();
}

function dojoScope(ctx: AdminAuggieContext, column = "s.dojo_id") {
  const superAdmin = isRenShinKanSuperAdmin(ctx.session);
  return {
    clause: superAdmin ? "" : ` AND ${column} = ?`,
    bindings: superAdmin ? [] : [ctx.session.selectedDojoId!],
  };
}

async function examinationSummary(ctx: AdminAuggieContext) {
  requirePathPermission(ctx, EXAM_PATH);
  const cycle = await activeExaminationCycle(ctx);
  const scope = dojoScope(ctx);
  const row = cycle
    ? await ctx.db
        .prepare(
          `SELECT COUNT(*) AS total,
        SUM(CASE WHEN COALESCE(ecs.status, 'not_signed_up') = 'not_signed_up' THEN 1 ELSE 0 END) AS not_signed_up,
        SUM(CASE WHEN COALESCE(ecs.status, 'not_signed_up') = 'unpaid' THEN 1 ELSE 0 END) AS unpaid,
        SUM(CASE WHEN COALESCE(ecs.status, 'not_signed_up') = 'paid' THEN 1 ELSE 0 END) AS paid
      FROM students s
      LEFT JOIN exam_cycle_student_status ecs ON ecs.student_id = s.id AND ecs.cycle_id = ?
      WHERE ${ACTIVE_ROSTER_PREDICATE}${scope.clause}`,
        )
        .bind(cycle.id, ...scope.bindings)
        .first<Record<string, number>>()
    : null;
  const counts = {
    total: Number(row?.total || 0),
    notSignedUp: Number(row?.not_signed_up || 0),
    unpaid: Number(row?.unpaid || 0),
    paid: Number(row?.paid || 0),
  };
  await auditAi(
    ctx,
    "admin_ai_examination_read",
    "get_examination_summary",
    "success",
    { counts, cycleId: cycle?.id || null },
  );
  return {
    kind: "dashboard" as const,
    heading: localized(
      ctx.locale,
      cycle ? `Examination cycle: ${cycle.name}` : "Examinations",
      cycle ? `รอบสอบ: ${cycle.name}` : "การสอบ",
    ),
    message: cycle
      ? localized(
          ctx.locale,
          "These counts are limited to your current administrator scope.",
          "จำนวนเหล่านี้จำกัดตามขอบเขตผู้ดูแลปัจจุบันของคุณ",
        )
      : localized(
          ctx.locale,
          "There is no active examination cycle.",
          "ยังไม่มีรอบสอบที่เปิดใช้งาน",
        ),
    counts,
    path: EXAM_PATH,
  };
}

async function listExaminationApplications(
  ctx: AdminAuggieContext,
  args: Record<string, unknown>,
) {
  requirePathPermission(ctx, EXAM_PATH);
  if (!exactKeys(args, ["query", "status", "limit"]))
    throw new AdminAuggieError(
      "The examination list contains unsupported fields.",
    );
  const query = cleanText(args.query, 120);
  const status =
    args.status === undefined ? "" : cleanText(args.status, 30);
  const limit = args.limit === undefined ? 10 : Number(args.limit);
  if (
    query.length > 120 ||
    (status && !["not_signed_up", "unpaid", "paid"].includes(status)) ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 20
  )
    throw new AdminAuggieError(
      "Enter an optional search of up to 120 characters, a valid status, and a limit from 1-20.",
    );
  const cycle = await activeExaminationCycle(ctx);
  if (!cycle)
    throw new AdminAuggieError(
      "There is no active examination cycle.",
      409,
      "ADMIN_AUGGIE_TARGET_MISSING",
    );
  const scope = dojoScope(ctx);
  const bindings: unknown[] = [cycle.id, ...scope.bindings];
  let filters = "";
  if (status) {
    filters += " AND COALESCE(ecs.status, 'not_signed_up') = ?";
    bindings.push(status);
  }
  if (query) {
    const like = `%${escapeLike(query)}%`;
    filters +=
      " AND (s.display_name LIKE ? ESCAPE '\\' COLLATE NOCASE OR s.public_student_id LIKE ? ESCAPE '\\' COLLATE NOCASE)";
    bindings.push(like, like);
  }
  bindings.push(limit);
  const rows =
    (
      await ctx.db
        .prepare(
          `SELECT s.public_student_id, s.display_name, d.official_name AS dojo_name,
        COALESCE(ecs.current_rank_snapshot, s.current_belt) AS current_rank,
        ecs.requested_rank_snapshot AS requested_rank,
        COALESCE(ecs.status, 'not_signed_up') AS status
      FROM students s JOIN dojos d ON d.id = s.dojo_id
      LEFT JOIN exam_cycle_student_status ecs ON ecs.student_id = s.id AND ecs.cycle_id = ?
      WHERE ${ACTIVE_ROSTER_PREDICATE}${scope.clause}${filters}
      ORDER BY s.display_name COLLATE NOCASE, s.public_student_id LIMIT ?`,
        )
        .bind(...bindings)
        .all<Record<string, unknown>>()
    ).results || [];
  const students = rows.map((row) => ({
    studentId: String(row.public_student_id || ""),
    name: String(row.display_name || ""),
    dojo: String(row.dojo_name || ""),
    rank: String(row.current_rank || ""),
    status: `${String(row.status || "")}${
      row.requested_rank ? ` → ${String(row.requested_rank)}` : ""
    }`,
  }));
  await auditAi(
    ctx,
    "admin_ai_examination_read",
    "list_examination_applications",
    "success",
    { resultCount: students.length, cycleId: cycle.id },
  );
  return {
    kind: "students" as const,
    heading: localized(
      ctx.locale,
      `Examination roster: ${cycle.name}`,
      `รายชื่อผู้สอบ: ${cycle.name}`,
    ),
    message: students.length
      ? localized(
          ctx.locale,
          "Minimal fields are shown. Private questionnaire answers stay in the reviewed interface.",
          "แสดงเฉพาะข้อมูลขั้นต่ำ คำตอบแบบสอบถามส่วนตัวยังคงอยู่ในหน้าจอเดิม",
        )
      : localized(
          ctx.locale,
          "No examination record matched in your current scope.",
          "ไม่พบระเบียนการสอบในขอบเขตปัจจุบันของคุณ",
        ),
    students,
    path: EXAM_PATH,
  };
}

async function contributionSummary(
  ctx: AdminAuggieContext,
  args: Record<string, unknown>,
) {
  requirePathPermission(ctx, CONTRIBUTION_PATH);
  if (!exactKeys(args, ["month"]))
    throw new AdminAuggieError(
      "The contribution summary contains unsupported fields.",
    );
  const month =
    args.month === undefined
      ? currentBangkokMonthKey()
      : cleanText(args.month, 7);
  if (!isMonthKey(month))
    throw new AdminAuggieError("Choose a month in YYYY-MM form.");
  const row = await ctx.db
    .prepare(
      `SELECT COUNT(*) AS total,
      SUM(CASE WHEN COALESCE(c.status, 'no_submission') = 'no_submission' THEN 1 ELSE 0 END) AS no_submission,
      SUM(CASE WHEN COALESCE(c.status, 'no_submission') = 'awaiting_payment' THEN 1 ELSE 0 END) AS awaiting,
      SUM(CASE WHEN COALESCE(c.status, 'no_submission') = 'paid' THEN 1 ELSE 0 END) AS paid
    FROM contribution_period_students r
    JOIN students s ON s.id = r.student_id AND s.dojo_id = 'dojo-rsk'
    LEFT JOIN monthly_contributions c ON c.student_id = r.student_id AND c.month_key = r.month_key
    WHERE r.month_key = ? AND r.active_at_period_start = 1`,
    )
    .bind(month)
    .first<Record<string, number>>();
  const counts = {
    total: Number(row?.total || 0),
    noSubmission: Number(row?.no_submission || 0),
    awaitingPayment: Number(row?.awaiting || 0),
    paid: Number(row?.paid || 0),
  };
  await auditAi(
    ctx,
    "admin_ai_contribution_read",
    "get_contribution_summary",
    "success",
    { counts, month },
  );
  return {
    kind: "dashboard" as const,
    heading: localized(
      ctx.locale,
      `Monthly contributions: ${month}`,
      `เงินสมทบรายเดือน: ${month}`,
    ),
    message: counts.total
      ? localized(
          ctx.locale,
          "These counts cover the RenShinKan roster snapshot for that month.",
          "จำนวนเหล่านี้ครอบคลุมรายชื่อ RenShinKan ของเดือนนั้น",
        )
      : localized(
          ctx.locale,
          "That month has no roster snapshot yet. Open monthly contributions once to create it.",
          "เดือนนั้นยังไม่มีรายชื่อ โปรดเปิดหน้าเงินสมทบรายเดือนหนึ่งครั้งเพื่อสร้าง",
        ),
    counts,
    path: CONTRIBUTION_PATH,
  };
}

// Repeats the reviewed payslip endpoint's own scope: a dojo administrator
// never sees RenShinKan monthly payslips, nor an AAT group payslip that
// includes any student from another dojo.
function proofScopeSql(ctx: AdminAuggieContext) {
  if (isRenShinKanSuperAdmin(ctx.session)) return { clause: "", bindings: [] };
  const dojoId = ctx.session.selectedDojoId!;
  return {
    clause: ` AND s.dojo_id = ? AND p.payment_type <> 'renshinkan_monthly'
      AND (p.payment_type <> 'aat_annual' OR NOT EXISTS (
        SELECT 1 FROM payment_request_items scoped_item
        WHERE scoped_item.payment_request_id = p.payment_reference_id AND scoped_item.dojo_id <> ?
      ))`,
    bindings: [dojoId, dojoId] as unknown[],
  };
}

function proofTypeSql(scope: "exam" | "contributions") {
  return scope === "exam"
    ? " AND p.payment_type = 'exam'"
    : " AND p.payment_type IN ('aat_annual', 'renshinkan_monthly')";
}

async function listPaymentProofs(
  ctx: AdminAuggieContext,
  args: Record<string, unknown>,
) {
  if (!exactKeys(args, ["scope", "status", "limit"]))
    throw new AdminAuggieError(
      "The payslip list contains unsupported fields.",
    );
  const scope = args.scope === "exam" ? "exam" : "contributions";
  if (!permittedProofScopes(ctx).includes(scope))
    throw new AdminAuggieError(
      "That administration area is not available in your current permission scope.",
      403,
      "ADMIN_AUGGIE_ROUTE_FORBIDDEN",
    );
  requirePathPermission(ctx, proofScopePath(scope));
  const status =
    args.status === undefined ? "pending_review" : cleanText(args.status, 30);
  const limit = args.limit === undefined ? 10 : Number(args.limit);
  if (
    !["pending_review", "approved", "denied"].includes(status) ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 20
  )
    throw new AdminAuggieError(
      "Choose a valid payslip status and a limit from 1-20.",
    );
  const dojo = proofScopeSql(ctx);
  const rows =
    (
      await ctx.db
        .prepare(
          `SELECT p.payment_type, p.status, p.submitted_at,
        s.public_student_id, s.display_name, d.official_name AS dojo_name,
        CASE WHEN p.payment_type IN ('renshinkan_monthly', 'aat_annual')
          THEN MAX(1, (SELECT COUNT(*) FROM payment_request_items pri
            WHERE pri.payment_request_id = p.payment_reference_id)) ELSE 1 END AS covered_student_count
      FROM payment_proofs p JOIN students s ON s.id = p.student_id JOIN dojos d ON d.id = s.dojo_id
      WHERE p.object_key IS NOT NULL AND p.submitted_at IS NOT NULL AND p.status = ?
        ${proofTypeSql(scope)}${dojo.clause}
      ORDER BY p.submitted_at DESC, p.id DESC LIMIT ?`,
        )
        .bind(status, ...dojo.bindings, limit)
        .all<Record<string, unknown>>()
    ).results || [];
  const students = rows.map((row) => ({
    studentId: String(row.public_student_id || ""),
    name: String(row.display_name || ""),
    dojo: String(row.dojo_name || ""),
    rank: String(row.payment_type || "").replace(/_/g, " "),
    status: `${String(row.status || "").replace(/_/g, " ")} · ${Number(
      row.covered_student_count || 1,
    )} student(s)`,
  }));
  await auditAi(ctx, "admin_ai_payslip_read", "list_payment_proofs", "success", {
    resultCount: students.length,
    scope,
    status,
  });
  return {
    kind: "students" as const,
    heading: localized(ctx.locale, "Submitted payslips", "หลักฐานที่ส่งแล้ว"),
    message: students.length
      ? localized(
          ctx.locale,
          "Auggie cannot open or inspect payslip evidence. Open the reviewed page to look at any file before deciding.",
          "Auggie ไม่สามารถเปิดหรือตรวจไฟล์หลักฐานได้ โปรดเปิดหน้าที่มีการตรวจสอบเพื่อดูไฟล์ก่อนตัดสินใจ",
        )
      : localized(
          ctx.locale,
          "No payslip matched in your current scope.",
          "ไม่พบหลักฐานการชำระเงินในขอบเขตปัจจุบันของคุณ",
        ),
    students,
    path: proofScopePath(scope),
    manualOnly: true,
  };
}

// --- Examination and payment proposals -------------------------------------

type DelegatedGuard = { targetId: string; id: string; expectedState: string };

// The exact hour total the reviewed student page shows, rebuilt in SQL so the
// guard compares the same number the preview card displayed. Hours can be
// quarters, so both sides are fixed to two decimals and never compared as a
// database-formatted number.
const TOTAL_HOURS_SQL = `printf('%.2f', COALESCE((SELECT SUM(h.verified_hours)
  FROM training_hours h WHERE h.student_id = s.id), 0) + s.training_hours_adjustment)`;

const PENDING_HOURS_SQL = `CAST((SELECT COUNT(*) FROM training_hour_requests r
    WHERE r.student_id = s.id AND r.status = 'pending') AS TEXT) || '|' ||
  printf('%.2f', COALESCE((SELECT SUM(r.submitted_hours) FROM training_hour_requests r
    WHERE r.student_id = s.id AND r.status = 'pending'), 0))`;

function hoursText(value: number) {
  return Number(value || 0).toFixed(2);
}

function studentStateSql(sql: string) {
  return {
    sql,
    bindings: (guard: DelegatedGuard) => [guard.id] as unknown[],
  };
}

// Each bulk action is proved against exactly the values its preview card
// showed, so a student whose hours, pending requests or rank moved after the
// preview makes the whole batch roll back instead of half-applying.
function bulkStateSql(action: BulkStudentAction) {
  if (action === "add_hours")
    return studentStateSql(
      `SELECT CAST(s.active AS TEXT) || '|' || ${TOTAL_HOURS_SQL} AS state
      FROM students s WHERE s.id = ?`,
    );
  if (action === "approve_pending_hours")
    return studentStateSql(
      `SELECT CAST(s.active AS TEXT) || '|' || ${TOTAL_HOURS_SQL} || '|' ||
        ${PENDING_HOURS_SQL} AS state FROM students s WHERE s.id = ?`,
    );
  return studentStateSql(
    `SELECT s.current_belt || '|' || CAST(s.active AS TEXT) AS state
    FROM students s WHERE s.id = ?`,
  );
}

function delegatedStateSql(args: DelegatedArgs) {
  // A new record has no row of its own to prove, so the guard proves the two
  // things that must still hold when the administrator confirms: the chosen
  // dojo is still active, and nobody else has since created a student with the
  // same English name in it.
  if (args.kind === "student_create")
    return {
      sql: `SELECT CAST(d.active AS TEXT) || '|' || CAST((SELECT COUNT(*) FROM students s
        WHERE s.dojo_id = d.id AND s.deleted_at IS NULL
          AND s.display_name = ? COLLATE NOCASE) AS TEXT) AS state
      FROM dojos d WHERE d.id = ?`,
      bindings: (guard: DelegatedGuard) => [args.englishName || "", guard.id],
    };
  if (args.kind === "student_record_update")
    return studentStateSql(
      `SELECT s.current_belt || '|' || CAST(s.public_visible AS TEXT) || '|' ||
        COALESCE(s.dojo_joined_date, '') || '|' || CAST(s.active AS TEXT) || '|' ||
        COALESCE(s.archived_at, '') || '|' || COALESCE(s.profile_status, '') AS state
      FROM students s WHERE s.id = ?`,
    );
  if (args.kind === "student_hours")
    return studentStateSql(
      `SELECT CAST(s.active AS TEXT) || '|' || ${TOTAL_HOURS_SQL} AS state
      FROM students s WHERE s.id = ?`,
    );
  if (args.kind === "student_examination")
    return studentStateSql(
      `SELECT s.current_belt || '|' || CAST(s.active AS TEXT) AS state
      FROM students s WHERE s.id = ?`,
    );
  if (args.kind === "student_profile_decision")
    return studentStateSql(
      `SELECT s.profile_status AS state FROM students s WHERE s.id = ?`,
    );
  if (args.kind === "bulk_student_action")
    return bulkStateSql(args.bulkAction || "mass_rank_change");
  if (args.kind === "exam_status")
    return {
      sql: `SELECT COALESCE(ecs.status, 'not_signed_up') || '|' ||
        COALESCE((SELECT ea.payment_status FROM examination_applications ea
          WHERE ea.student_id = s.id AND ea.cycle_id = ? AND ea.status <> 'archived' LIMIT 1), '') || '|' ||
        COALESCE((SELECT ea.status FROM examination_applications ea
          WHERE ea.student_id = s.id AND ea.cycle_id = ? AND ea.status <> 'archived' LIMIT 1), '') || '|' ||
        CAST(s.active AS TEXT) AS state
      FROM students s
      LEFT JOIN exam_cycle_student_status ecs ON ecs.student_id = s.id AND ecs.cycle_id = ?
      WHERE s.id = ?`,
      bindings: (guard: DelegatedGuard) => [
        args.cycleId,
        args.cycleId,
        args.cycleId,
        guard.id,
      ],
    };
  if (args.kind === "exam_rejection")
    return {
      sql: `SELECT status || '|' || payment_status AS state
      FROM examination_applications WHERE id = ?`,
      bindings: (guard: DelegatedGuard) => [guard.id],
    };
  if (args.kind === "contribution_status")
    return {
      sql: `SELECT COALESCE(c.status, 'no_submission') AS state
      FROM contribution_period_students r
      LEFT JOIN monthly_contributions c ON c.student_id = r.student_id AND c.month_key = r.month_key
      WHERE r.month_key = ? AND r.student_id = ? AND r.active_at_period_start = 1`,
      bindings: (guard: DelegatedGuard) => [args.monthKey, guard.id],
    };
  return {
    sql: `SELECT status AS state FROM payment_proofs WHERE id = ?`,
    bindings: (guard: DelegatedGuard) => [guard.id],
  };
}

function delegatedGuardStatements(
  db: D1Database,
  operationId: string,
  args: DelegatedArgs,
  guards: DelegatedGuard[],
) {
  const state = delegatedStateSql(args);
  return guards.map((guard) =>
    db
      .prepare(
        `INSERT INTO admin_ai_execution_guards
      (operation_id, target_id, expected_state, observed_state)
      VALUES (?, ?, ?, COALESCE((${state.sql}), 'missing'))`,
      )
      .bind(
        operationId,
        guard.targetId,
        guard.expectedState,
        ...state.bindings(guard),
      ),
  );
}

function monthGuardStatement(
  db: D1Database,
  operationId: string,
  monthKey: string,
) {
  return db
    .prepare(
      `INSERT INTO admin_ai_operation_state_guards
    (operation_id, guard_name, expected_state, observed_state)
    VALUES (?, 'contribution_month', ?, strftime('%Y-%m', 'now', '+7 hours'))`,
    )
    .bind(operationId, monthKey);
}

const DELEGATED_GUARD_PREFIX: Record<DelegatedKind, string> = {
  exam_status: "__exam__",
  exam_rejection: "__exam_application__",
  contribution_status: "__contribution__",
  payment_proof_decision: "__payslip__",
  student_record_update: "__student_record__",
  student_hours: "__student_hours__",
  student_examination: "__student_exam__",
  student_profile_decision: "__student_profile__",
  bulk_student_action: "__bulk_student__",
  student_create: "__student_create__",
};

function delegatedGuards(args: DelegatedArgs): DelegatedGuard[] {
  return args.targets.map((target, index) => {
    const id =
      args.kind === "exam_rejection"
        ? args.applicationId!
        : args.kind === "payment_proof_decision"
          ? args.proofIds![index]
          : target.id;
    return {
      targetId: `${DELEGATED_GUARD_PREFIX[args.kind]}:${id}`,
      id,
      expectedState: target.expectedState,
    };
  });
}

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "S"}`;
}

async function insertDelegatedOperation(
  ctx: AdminAuggieContext,
  input: {
    toolName: string;
    args: DelegatedArgs;
    primaryPhrase: string;
    secondaryPhrase?: string;
    records: Array<Record<string, unknown>>;
    extraPreview?: Record<string, unknown>;
    expiresAtCap?: string | null;
    undoOf?: string | null;
    heading?: { en: string; th: string };
  },
) {
  const preview = {
    action: input.args.action,
    count: input.args.targets.length,
    dojos: Array.from(
      new Set(input.args.targets.map((target) => target.dojoName)),
    ),
    records: input.records,
    path: input.args.requiredPath,
    confirmationPhrase: input.primaryPhrase,
    secondaryConfirmationPhrase: input.secondaryPhrase || null,
    ...input.extraPreview,
  };
  const row = await insertOperation(ctx, {
    toolName: input.toolName,
    mode: "direct",
    status: "prepared",
    args: input.args,
    preview,
    fingerprints: Object.fromEntries(
      delegatedGuards(input.args).map((guard) => [
        guard.targetId,
        guard.expectedState,
      ]),
    ),
    phrase: input.primaryPhrase,
    secondaryPhrase: input.secondaryPhrase,
    expiresAtCap: input.expiresAtCap ?? null,
    undoOf: input.undoOf ?? null,
  });
  return {
    kind: "proposal" as const,
    heading: localized(
      ctx.locale,
      input.heading?.en || "Ready when you are",
      input.heading?.th || "พร้อมเมื่อคุณพร้อม",
    ),
    message: localized(
      ctx.locale,
      "I have checked every record against your own dojo. Nothing has changed yet. Please look it over below.",
      "ตรวจสอบทุกระเบียนกับโดโจของคุณแล้ว ยังไม่มีการเปลี่ยนแปลงใด ๆ โปรดตรวจดูด้านล่าง",
    ),
    operation: operationProposal(row, ctx.locale),
  };
}

async function proposeExaminationStatus(
  ctx: AdminAuggieContext,
  args: Record<string, unknown>,
) {
  requirePathPermission(ctx, EXAM_PATH);
  if (!exactKeys(args, ["status", "studentIds"]))
    throw new AdminAuggieError(
      "The examination proposal contains unsupported fields.",
    );
  const status = cleanText(args.status, 30);
  if (!["not_signed_up", "unpaid", "paid"].includes(status))
    throw new AdminAuggieError("Choose a valid examination status.");
  const cycle = await activeExaminationCycle(ctx);
  if (!cycle)
    throw new AdminAuggieError(
      "There is no active examination cycle.",
      409,
      "ADMIN_AUGGIE_TARGET_MISSING",
    );
  const targets = await resolveStudentTargets(
    ctx,
    parseStudentIds(args.studentIds, MAX_EXAM_TARGETS),
  );
  const placeholders = targets.map(() => "?").join(",");
  const rows =
    (
      await ctx.db
        .prepare(
          `SELECT s.id,
        COALESCE(ecs.status, 'not_signed_up') AS status,
        COALESCE(ea.payment_status, '') AS payment_status,
        COALESCE(ea.status, '') AS application_status,
        s.active
      FROM students s
      LEFT JOIN exam_cycle_student_status ecs ON ecs.student_id = s.id AND ecs.cycle_id = ?
      LEFT JOIN examination_applications ea ON ea.student_id = s.id AND ea.cycle_id = ? AND ea.status <> 'archived'
      WHERE s.id IN (${placeholders})`,
        )
        .bind(cycle.id, cycle.id, ...targets.map((target) => target.id))
        .all<Record<string, unknown>>()
    ).results || [];
  const byId = new Map(rows.map((row) => [String(row.id), row]));
  const stored: StoredTarget[] = [];
  const records: Array<Record<string, unknown>> = [];
  let touchesMoney = status === "paid";
  for (const target of targets) {
    const row = byId.get(target.id);
    if (!row || Number(row.active) !== 1)
      throw new AdminAuggieError(
        `${target.publicId} is not an active examination roster record.`,
        409,
        "ADMIN_AUGGIE_TARGET_STATE",
      );
    const current = String(row.status || "not_signed_up");
    if (current === status)
      throw new AdminAuggieError(
        `${target.publicId} is already ${current.replace(/_/g, " ")}.`,
        409,
        "ADMIN_AUGGIE_TARGET_STATE",
      );
    if (current === "paid") touchesMoney = true;
    stored.push({
      ...target,
      expectedState: `${current}|${String(row.payment_status || "")}|${String(
        row.application_status || "",
      )}|1`,
    });
    records.push({
      studentId: target.publicId,
      name: target.name,
      dojo: target.dojoName,
      before: current.replace(/_/g, " "),
      after: status.replace(/_/g, " "),
    });
  }
  const label = status.replace(/_/g, " ").toLocaleUpperCase("en-US");
  const primaryPhrase = `EXAM ${label} ${plural(stored.length, "STUDENT")}`;
  return insertDelegatedOperation(ctx, {
    toolName: `exam_status_${status}`,
    args: {
      kind: "exam_status",
      action: `exam_${status}`,
      targets: stored,
      route: "admin/examinations",
      requiresSecondaryConfirmation: touchesMoney,
      requiredPath: EXAM_PATH,
      cycleId: cycle.id,
      cycleName: cycle.name,
    },
    primaryPhrase,
    secondaryPhrase: touchesMoney
      ? `CONFIRM PAYMENT CHANGE ${plural(stored.length, "STUDENT")}`
      : undefined,
    records,
    extraPreview: { cycle: cycle.name, touchesMoney },
  });
}

async function proposeExaminationRejection(
  ctx: AdminAuggieContext,
  args: Record<string, unknown>,
) {
  requirePathPermission(ctx, EXAM_PATH);
  if (!exactKeys(args, ["studentId"]))
    throw new AdminAuggieError(
      "The rejection proposal contains unsupported fields.",
    );
  const [target] = await resolveStudentTargets(
    ctx,
    parseStudentIds([args.studentId], 1),
  );
  const cycle = await activeExaminationCycle(ctx);
  if (!cycle)
    throw new AdminAuggieError(
      "There is no active examination cycle.",
      409,
      "ADMIN_AUGGIE_TARGET_MISSING",
    );
  const applications =
    (
      await ctx.db
        .prepare(
          `SELECT id, status, payment_status, attempted_rank
      FROM examination_applications
      WHERE student_id = ? AND cycle_id = ? AND status = 'application_submitted'`,
        )
        .bind(target.id, cycle.id)
        .all<Record<string, unknown>>()
    ).results || [];
  if (applications.length !== 1)
    throw new AdminAuggieError(
      applications.length
        ? `${target.publicId} has more than one submitted application. Use the reviewed examination page.`
        : `${target.publicId} has no submitted examination application to reject.`,
      409,
      "ADMIN_AUGGIE_TARGET_STATE",
    );
  const application = applications[0];
  const paymentStatus = String(application.payment_status || "");
  if (paymentStatus === "paid")
    throw new AdminAuggieError(
      `${target.publicId} has already paid. Reverse the payment in the reviewed examination page before rejecting.`,
      409,
      "ADMIN_AUGGIE_TARGET_STATE",
    );
  const stored: StoredTarget = {
    ...target,
    expectedState: `application_submitted|${paymentStatus}`,
  };
  return insertDelegatedOperation(ctx, {
    toolName: "exam_application_rejection",
    args: {
      kind: "exam_rejection",
      action: "reject_examination_application",
      targets: [stored],
      route: "admin/examination-application",
      requiresSecondaryConfirmation: false,
      requiredPath: EXAM_PATH,
      cycleId: cycle.id,
      cycleName: cycle.name,
      applicationId: String(application.id),
    },
    primaryPhrase: "REJECT 1 EXAM APPLICATION",
    records: [
      {
        studentId: target.publicId,
        name: target.name,
        dojo: target.dojoName,
        before: "application submitted",
        after: "rejected",
      },
    ],
    extraPreview: {
      cycle: cycle.name,
      attemptedRank: String(application.attempted_rank || ""),
    },
  });
}

async function proposeContributionStatus(
  ctx: AdminAuggieContext,
  args: Record<string, unknown>,
) {
  requirePathPermission(ctx, CONTRIBUTION_PATH);
  if (!exactKeys(args, ["status", "month", "studentIds"]))
    throw new AdminAuggieError(
      "The contribution proposal contains unsupported fields.",
    );
  const status = cleanText(args.status, 30);
  if (!["no_submission", "awaiting_payment", "paid"].includes(status))
    throw new AdminAuggieError("Choose a valid contribution status.");
  const month =
    args.month === undefined
      ? currentBangkokMonthKey()
      : cleanText(args.month, 7);
  if (!isMonthKey(month))
    throw new AdminAuggieError("Choose a month in YYYY-MM form.");
  // The amount always comes from server configuration. A money value is never
  // taken from model output or from the browser.
  const amount =
    status === "paid" ? configuredMonthlyContributionAmount(ctx.env) : null;
  if (status === "paid" && amount === null)
    throw new AdminAuggieError(
      "The monthly contribution amount is not configured on the server. Set it before marking contributions paid.",
      409,
      "ADMIN_AUGGIE_CONFIGURATION",
    );
  const targets = await resolveStudentTargets(
    ctx,
    parseStudentIds(args.studentIds, MAX_CONTRIBUTION_TARGETS),
  );
  if (targets.some((target) => target.dojoId !== "dojo-rsk"))
    throw new AdminAuggieError(
      "Monthly RenShinKan contributions cover RenShinKan students only.",
      409,
      "ADMIN_AUGGIE_TARGET_STATE",
    );
  const placeholders = targets.map(() => "?").join(",");
  const rows =
    (
      await ctx.db
        .prepare(
          `SELECT r.student_id, COALESCE(c.status, 'no_submission') AS status
      FROM contribution_period_students r
      JOIN students s ON s.id = r.student_id AND s.dojo_id = 'dojo-rsk'
      LEFT JOIN monthly_contributions c ON c.student_id = r.student_id AND c.month_key = r.month_key
      WHERE r.month_key = ? AND r.active_at_period_start = 1
        AND r.student_id IN (${placeholders})`,
        )
        .bind(month, ...targets.map((target) => target.id))
        .all<Record<string, unknown>>()
    ).results || [];
  const byId = new Map(rows.map((row) => [String(row.student_id), row]));
  const stored: StoredTarget[] = [];
  const records: Array<Record<string, unknown>> = [];
  for (const target of targets) {
    const row = byId.get(target.id);
    if (!row)
      throw new AdminAuggieError(
        `${target.publicId} is not in the ${month} contribution roster. Open monthly contributions once to create it.`,
        409,
        "ADMIN_AUGGIE_TARGET_STATE",
      );
    const current = String(row.status || "no_submission");
    if (current === status)
      throw new AdminAuggieError(
        `${target.publicId} is already ${current.replace(/_/g, " ")} for ${month}.`,
        409,
        "ADMIN_AUGGIE_TARGET_STATE",
      );
    stored.push({ ...target, expectedState: current });
    records.push({
      studentId: target.publicId,
      name: target.name,
      dojo: target.dojoName,
      before: current.replace(/_/g, " "),
      after: status.replace(/_/g, " "),
    });
  }
  const label = status.replace(/_/g, " ").toLocaleUpperCase("en-US");
  return insertDelegatedOperation(ctx, {
    toolName: `contribution_status_${status}`,
    args: {
      kind: "contribution_status",
      action: `contribution_${status}`,
      targets: stored,
      route: "admin/contributions",
      requiresSecondaryConfirmation: true,
      requiredPath: CONTRIBUTION_PATH,
      monthKey: month,
      amount,
    },
    primaryPhrase: `CONTRIBUTION ${label} ${plural(stored.length, "STUDENT")} ${month}`,
    secondaryPhrase: `CONFIRM PAYMENT CHANGE ${plural(stored.length, "STUDENT")} ${month}`,
    records,
    extraPreview: { month, amount },
    expiresAtCap: bangkokMonthBoundary(month),
  });
}

async function proposePaymentProofDecision(
  ctx: AdminAuggieContext,
  args: Record<string, unknown>,
) {
  if (!exactKeys(args, ["decision", "scope", "studentIds"]))
    throw new AdminAuggieError(
      "The payslip proposal contains unsupported fields.",
    );
  const decision = args.decision === "approve" ? "approve" : "deny";
  if (args.decision !== "approve" && args.decision !== "deny")
    throw new AdminAuggieError("Choose approve or deny.");
  const scope = args.scope === "exam" ? "exam" : "contributions";
  if (!permittedProofScopes(ctx).includes(scope))
    throw new AdminAuggieError(
      "That administration area is not available in your current permission scope.",
      403,
      "ADMIN_AUGGIE_ROUTE_FORBIDDEN",
    );
  requirePathPermission(ctx, proofScopePath(scope));
  const targets = await resolveStudentTargets(
    ctx,
    parseStudentIds(args.studentIds, MAX_PAYSLIP_TARGETS),
  );
  const dojo = proofScopeSql(ctx);
  const stored: StoredTarget[] = [];
  const records: Array<Record<string, unknown>> = [];
  const proofIds: string[] = [];
  let coveredStudentCount = 0;
  let paymentType: "exam" | "aat_annual" | "renshinkan_monthly" | undefined;
  for (const target of targets) {
    const rows =
      (
        await ctx.db
          .prepare(
            `SELECT p.id, p.status, p.payment_type,
          CASE WHEN p.payment_type IN ('renshinkan_monthly', 'aat_annual')
            THEN MAX(1, (SELECT COUNT(*) FROM payment_request_items pri
              WHERE pri.payment_request_id = p.payment_reference_id)) ELSE 1 END AS covered_student_count
        FROM payment_proofs p JOIN students s ON s.id = p.student_id
        WHERE p.student_id = ? AND p.status = 'pending_review'
          AND p.object_key IS NOT NULL AND p.submitted_at IS NOT NULL
          ${proofTypeSql(scope)}${dojo.clause}`,
          )
          .bind(target.id, ...dojo.bindings)
          .all<Record<string, unknown>>()
      ).results || [];
    if (rows.length !== 1)
      throw new AdminAuggieError(
        rows.length
          ? `${target.publicId} has more than one payslip awaiting review. Use the reviewed payslip page.`
          : `${target.publicId} has no payslip awaiting review in your current scope.`,
        409,
        "ADMIN_AUGGIE_TARGET_STATE",
      );
    const row = rows[0];
    const covered = Number(row.covered_student_count || 1);
    coveredStudentCount += covered;
    paymentType = String(row.payment_type) as typeof paymentType;
    proofIds.push(String(row.id));
    stored.push({ ...target, expectedState: "pending_review" });
    records.push({
      studentId: target.publicId,
      name: target.name,
      dojo: target.dojoName,
      before: "pending review",
      after: decision === "approve" ? "approved" : "denied",
      pendingRequests: covered,
      pendingHours: 0,
    });
  }
  const label = decision === "approve" ? "APPROVE" : "DENY";
  return insertDelegatedOperation(ctx, {
    toolName: `payment_proof_${decision}`,
    args: {
      kind: "payment_proof_decision",
      action: `payslip_${decision}`,
      targets: stored,
      route: "admin/payment-proofs",
      requiresSecondaryConfirmation: true,
      requiredPath: proofScopePath(scope),
      paymentType,
      proofIds,
      coveredStudentCount,
    },
    primaryPhrase: `${label} ${plural(stored.length, "PAYSLIP")}`,
    secondaryPhrase: `CONFIRM REVIEWED EVIDENCE ${plural(stored.length, "PAYSLIP")}`,
    records,
    extraPreview: { scope, coveredStudentCount, manualEvidenceReview: true },
  });
}

// --- Student record, hour, examination and bulk proposals -------------------
// Admin Auggie never writes a student row for these tools. It resolves exact
// public Student IDs inside the administrator's own dojo scope, proves the
// previewed values are still unchanged, and lets the reviewed student endpoint
// perform the write inside its own transaction, dojo check and audit trail.

async function requireEditableStudent(
  ctx: AdminAuggieContext,
  value: unknown,
) {
  const [target] = await resolveStudentTargets(
    ctx,
    parseStudentIds([value], 1),
  );
  if (
    target.deletedAt ||
    target.archivedAt ||
    target.active !== 1 ||
    target.profileStatus !== "approved"
  )
    throw new AdminAuggieError(
      `${target.publicId} is not an active, approved student record.`,
      409,
      "ADMIN_AUGGIE_TARGET_STATE",
    );
  return target;
}

function optionalBoolean(value: unknown, message: string) {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new AdminAuggieError(message);
  return value;
}

async function proposeStudentRecordUpdate(
  ctx: AdminAuggieContext,
  args: Record<string, unknown>,
) {
  requirePathPermission(ctx, STUDENT_PATH);
  if (
    !exactKeys(args, [
      "studentId",
      "currentRank",
      "publicVisible",
      "dojoJoinedDate",
    ])
  )
    throw new AdminAuggieError(
      "The student record proposal contains unsupported fields.",
    );
  const target = await requireEditableStudent(ctx, args.studentId);
  const newRank =
    args.currentRank === undefined ? undefined : normalizeRank(args.currentRank);
  if (args.currentRank !== undefined && !newRank)
    throw new AdminAuggieError(
      "Choose a valid rank from the official progression.",
    );
  const publicVisible = optionalBoolean(
    args.publicVisible,
    "Choose true or false for the public website setting.",
  );
  const dojoJoinedDate =
    args.dojoJoinedDate === undefined
      ? undefined
      : cleanText(args.dojoJoinedDate, 10);
  if (dojoJoinedDate !== undefined && !isCanonicalDate(dojoJoinedDate))
    throw new AdminAuggieError("Choose a dojo-joined date in YYYY-MM-DD form.");
  const row = await ctx.db
    .prepare(
      `SELECT s.current_belt, s.public_visible,
        COALESCE(s.dojo_joined_date, '') AS dojo_joined_date, s.active,
        COALESCE(s.archived_at, '') AS archived_at,
        COALESCE(s.profile_status, '') AS profile_status
      FROM students s WHERE s.id = ?`,
    )
    .bind(target.id)
    .first<Record<string, unknown>>();
  if (!row)
    throw new AdminAuggieError(
      "That student record is no longer available.",
      409,
      "ADMIN_AUGGIE_TARGET_MISSING",
    );
  const previousRank = String(row.current_belt || "");
  const previousPublicVisible = Number(row.public_visible || 0) === 1;
  const previousDojoJoinedDate = String(row.dojo_joined_date || "");
  const changes: Array<{ field: string; before: string; after: string }> = [];
  if (newRank && newRank !== previousRank)
    changes.push({ field: "rank", before: previousRank, after: newRank });
  if (publicVisible !== undefined && publicVisible !== previousPublicVisible)
    changes.push({
      field: "public website",
      before: previousPublicVisible ? "shown" : "hidden",
      after: publicVisible ? "shown" : "hidden",
    });
  if (dojoJoinedDate !== undefined && dojoJoinedDate !== previousDojoJoinedDate)
    changes.push({
      field: "dojo joined",
      before: previousDojoJoinedDate || "not set",
      after: dojoJoinedDate,
    });
  if (!changes.length)
    throw new AdminAuggieError(
      `${target.publicId} already holds those values. Nothing would change.`,
      409,
      "ADMIN_AUGGIE_TARGET_STATE",
    );
  const stored: StoredTarget = {
    ...target,
    expectedState: [
      previousRank,
      Number(row.public_visible || 0),
      previousDojoJoinedDate,
      Number(row.active || 0),
      String(row.archived_at || ""),
      String(row.profile_status || ""),
    ].join("|"),
  };
  // Putting a value back is only offered when every previous value can be sent
  // to the reviewed endpoint exactly as it was. A record with no dojo-joined
  // date on file cannot be restored to "no date", so it is not undoable.
  const undoable =
    dojoJoinedDate === undefined || previousDojoJoinedDate.length > 0;
  return insertDelegatedOperation(ctx, {
    toolName: "student_record_update",
    args: {
      kind: "student_record_update",
      action: "update_student_record",
      targets: [stored],
      route: "admin/student-record",
      requiresSecondaryConfirmation: false,
      requiredPath: STUDENT_PATH,
      newRank: newRank && newRank !== previousRank ? newRank : undefined,
      previousRank,
      publicVisible:
        publicVisible !== undefined && publicVisible !== previousPublicVisible
          ? publicVisible
          : undefined,
      previousPublicVisible,
      dojoJoinedDate:
        dojoJoinedDate !== undefined &&
        dojoJoinedDate !== previousDojoJoinedDate
          ? dojoJoinedDate
          : undefined,
      previousDojoJoinedDate,
      undoable,
    },
    primaryPhrase: `EDIT ${target.publicId}`,
    records: [
      {
        studentId: target.publicId,
        name: target.name,
        dojo: target.dojoName,
        before: changes.map((change) => change.before).join(" · "),
        after: changes.map((change) => change.after).join(" · "),
      },
    ],
    extraPreview: {
      fields: changes.map((change) => change.field),
      undoable,
    },
  });
}

async function proposeStudentHours(
  ctx: AdminAuggieContext,
  args: Record<string, unknown>,
) {
  requirePathPermission(ctx, STUDENT_PATH);
  if (!exactKeys(args, ["studentId", "hours", "location"]))
    throw new AdminAuggieError(
      "The training-hour proposal contains unsupported fields.",
    );
  const target = await requireEditableStudent(ctx, args.studentId);
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
  const stored: StoredTarget = {
    ...target,
    expectedState: `${target.active}|${hoursText(target.totalHours)}`,
  };
  return insertDelegatedOperation(ctx, {
    toolName: "student_hours_added",
    args: {
      kind: "student_hours",
      action: "add_student_hours",
      targets: [stored],
      route: "admin/student-hours",
      requiresSecondaryConfirmation: false,
      requiredPath: STUDENT_PATH,
      hours,
      location,
      undoable: false,
    },
    primaryPhrase: `ADD ${hours} HOURS ${target.publicId}`,
    records: [
      {
        studentId: target.publicId,
        name: target.name,
        dojo: target.dojoName,
        before: `${target.totalHours} hours`,
        after: `${target.totalHours + hours} hours`,
      },
    ],
    extraPreview: { hours, location, permanentRecord: true },
  });
}

async function proposeStudentExamination(
  ctx: AdminAuggieContext,
  args: Record<string, unknown>,
) {
  requirePathPermission(ctx, STUDENT_PATH);
  if (
    !exactKeys(args, [
      "studentId",
      "attemptedRank",
      "passed",
      "location",
      "examinationDate",
    ])
  )
    throw new AdminAuggieError(
      "The examination proposal contains unsupported fields.",
    );
  const target = await requireEditableStudent(ctx, args.studentId);
  const attemptedRank = normalizeRank(args.attemptedRank);
  if (!attemptedRank)
    throw new AdminAuggieError(
      "Choose a valid attempted rank from the official progression.",
    );
  if (rankIndex(attemptedRank) <= rankIndex(target.currentRank))
    throw new AdminAuggieError(
      `The attempted rank must be higher than ${target.publicId}'s current rank.`,
    );
  const passed = optionalBoolean(
    args.passed,
    "Choose whether the examination was passed.",
  );
  if (passed === undefined)
    throw new AdminAuggieError(
      "Choose whether the examination was passed.",
    );
  const location = cleanText(args.location, 200);
  const examinationDate = cleanText(args.examinationDate, 10);
  if (!location || cleanText(args.location, 201).length > 200)
    throw new AdminAuggieError(
      "Enter an examination location no longer than 200 characters.",
    );
  if (!isCanonicalDate(examinationDate))
    throw new AdminAuggieError(
      "Choose an examination date in YYYY-MM-DD form.",
    );
  const stored: StoredTarget = {
    ...target,
    expectedState: `${target.currentRank}|${target.active}`,
  };
  return insertDelegatedOperation(ctx, {
    toolName: passed ? "student_examination_passed" : "student_examination_failed",
    args: {
      kind: "student_examination",
      action: passed ? "record_passed_examination" : "record_failed_examination",
      targets: [stored],
      route: "admin/student-exam",
      requiresSecondaryConfirmation: false,
      requiredPath: STUDENT_PATH,
      currentRank: target.currentRank,
      newRank: attemptedRank,
      passed,
      location,
      examinationDate,
      undoable: false,
    },
    primaryPhrase: `RECORD ${passed ? "PASSED" : "FAILED"} EXAM ${target.publicId}`,
    records: [
      {
        studentId: target.publicId,
        name: target.name,
        dojo: target.dojoName,
        before: target.currentRank,
        after: passed ? attemptedRank : target.currentRank,
      },
    ],
    extraPreview: {
      attemptedRank,
      passed,
      location,
      examinationDate,
      permanentRecord: true,
      warningEn: `No change has been made. Recording an examination writes permanent examination history for ${target.publicId} that Admin Auggie can never undo. Check the rank, result, date and location, then type the exact confirmation phrase.`,
      warningTh: `ยังไม่มีการเปลี่ยนแปลง การบันทึกผลสอบจะสร้างประวัติการสอบถาวรของ ${target.publicId} ซึ่ง Admin Auggie ย้อนกลับไม่ได้ โปรดตรวจสอบระดับ ผลสอบ วันที่ และสถานที่ แล้วพิมพ์ข้อความยืนยันให้ตรง`,
    },
  });
}

// The dojos this administrator may actually put a student into. A dojo account
// only ever sees its own dojo, so the dojo question answers itself.
async function permittedDojos(ctx: AdminAuggieContext) {
  const rows =
    (
      await ctx.db
        .prepare(
          `SELECT id, official_name FROM dojos WHERE active = 1
        ORDER BY sort_order, official_name COLLATE NOCASE`,
        )
        .all<{ id: string; official_name: string }>()
    ).results || [];
  return rows
    .filter((row) => canAccessDojo(ctx.session, row.id))
    .map((row) => ({ id: row.id, name: row.official_name }));
}

async function proposeStudentCreate(
  ctx: AdminAuggieContext,
  args: Record<string, unknown>,
) {
  requirePathPermission(ctx, STUDENT_PATH);
  if (
    !exactKeys(args, [
      "englishName",
      "thaiName",
      "currentRank",
      "dojoId",
      "dojoJoinedDate",
      "currentTrainingHours",
    ])
  )
    throw new AdminAuggieError(
      "The new student proposal contains unsupported fields.",
    );
  const englishName = cleanText(args.englishName, 120);
  if (!englishName || cleanText(args.englishName, 121).length > 120)
    throw new AdminAuggieError(
      "Enter an English name of 120 characters or fewer.",
    );
  const thaiName =
    args.thaiName === undefined ? "" : cleanText(args.thaiName, 120);
  const currentRank =
    args.currentRank === undefined
      ? "Unranked"
      : normalizeRank(args.currentRank);
  if (!currentRank)
    throw new AdminAuggieError(
      "Choose a valid rank from the official progression.",
    );
  const dojos = await permittedDojos(ctx);
  if (!dojos.length)
    throw new AdminAuggieError(
      "No active dojo is available in your current scope.",
      409,
      "ADMIN_AUGGIE_TARGET_MISSING",
    );
  const requestedDojoId =
    args.dojoId === undefined ? "" : cleanText(args.dojoId, 80);
  const dojo = requestedDojoId
    ? dojos.find((entry) => entry.id === requestedDojoId)
    : dojos.length === 1
      ? dojos[0]
      : undefined;
  if (!dojo)
    throw new AdminAuggieError(
      requestedDojoId
        ? "That dojo is not an active dojo in your current scope."
        : "Name the dojo the student is joining.",
      requestedDojoId ? 403 : 400,
      requestedDojoId ? "ADMIN_AUGGIE_CROSS_DOJO" : "ADMIN_AUGGIE_REQUEST_INVALID",
    );
  const dojoJoinedDate =
    args.dojoJoinedDate === undefined
      ? undefined
      : cleanText(args.dojoJoinedDate, 10);
  if (dojoJoinedDate !== undefined && !isCanonicalDate(dojoJoinedDate))
    throw new AdminAuggieError("Choose a dojo-joined date in YYYY-MM-DD form.");
  const startingHours =
    args.currentTrainingHours === undefined
      ? undefined
      : Number(args.currentTrainingHours);
  if (
    startingHours !== undefined &&
    (!Number.isFinite(startingHours) || startingHours < 0 || startingHours > 1_000)
  )
    throw new AdminAuggieError(
      "Starting training hours must be between zero and 1,000.",
    );
  const duplicates = await ctx.db
    .prepare(
      `SELECT COUNT(*) AS matches FROM students
      WHERE dojo_id = ? AND deleted_at IS NULL AND display_name = ? COLLATE NOCASE`,
    )
    .bind(dojo.id, englishName)
    .first<{ matches: number }>();
  const duplicateCount = Number(duplicates?.matches || 0);
  const stored: StoredTarget = {
    id: dojo.id,
    publicId: "",
    name: englishName,
    dojoId: dojo.id,
    dojoName: dojo.name,
    currentRank,
    active: 1,
    profileStatus: "approved",
    publicVisible: 1,
    publicVisibleBeforeArchive: null,
    archivedAt: null,
    deletedAt: null,
    updatedAt: "",
    totalHours: startingHours || 0,
    expectedState: `1|${duplicateCount}`,
  };
  return insertDelegatedOperation(ctx, {
    toolName: "student_created",
    args: {
      kind: "student_create",
      action: "create_student",
      targets: [stored],
      route: "admin/students-create",
      requiresSecondaryConfirmation: false,
      requiredPath: STUDENT_PATH,
      englishName,
      thaiName,
      currentRank,
      dojoIdForCreate: dojo.id,
      dojoJoinedDate,
      hours: startingHours,
      undoable: false,
    },
    primaryPhrase: "CREATE STUDENT",
    heading: { en: "New student profile", th: "ประวัตินักเรียนใหม่" },
    records: [
      {
        studentId: localized(ctx.locale, "New record", "ระเบียนใหม่"),
        name: thaiName ? `${englishName} (${thaiName})` : englishName,
        dojo: dojo.name,
        rank: currentRank,
        status: localized(ctx.locale, "will be created", "จะถูกสร้าง"),
      },
    ],
    extraPreview: {
      englishName,
      thaiName,
      currentRank,
      dojoJoinedDate: dojoJoinedDate || "",
      startingHours: startingHours || 0,
      duplicateNameCount: duplicateCount,
      warningEn: duplicateCount
        ? `Nothing has been created yet. Please note that ${duplicateCount} student with this exact English name is already in ${dojo.name}. Check that this is a different person, then type the exact phrase below.`
        : "Nothing has been created yet. Please check the name, rank and dojo, then type the exact phrase below. The Student ID is allocated by the server, not by Auggie.",
      warningTh: duplicateCount
        ? `ยังไม่มีการสร้างระเบียน โปรดทราบว่ามีนักเรียนชื่อภาษาอังกฤษนี้อยู่แล้ว ${duplicateCount} คนใน ${dojo.name} โปรดตรวจสอบว่าเป็นคนละคน แล้วพิมพ์ข้อความยืนยันด้านล่างให้ตรง`
        : "ยังไม่มีการสร้างระเบียน โปรดตรวจสอบชื่อ ระดับ และโดโจ แล้วพิมพ์ข้อความยืนยันด้านล่างให้ตรง รหัสนักเรียนจะถูกกำหนดโดยเซิร์ฟเวอร์ ไม่ใช่โดย Auggie",
    },
  });
}

async function proposeStudentProfileDecision(
  ctx: AdminAuggieContext,
  args: Record<string, unknown>,
) {
  requirePathPermission(ctx, PROFILE_REQUEST_PATH);
  if (!exactKeys(args, ["studentId", "decision"]))
    throw new AdminAuggieError(
      "The profile decision contains unsupported fields.",
    );
  if (args.decision !== "approve" && args.decision !== "reject")
    throw new AdminAuggieError("Choose approve or reject.");
  const decision = args.decision;
  const [target] = await resolveStudentTargets(
    ctx,
    parseStudentIds([args.studentId], 1),
  );
  if (target.deletedAt || target.profileStatus !== "pending_admin_approval")
    throw new AdminAuggieError(
      `${target.publicId} has no profile request waiting for review.`,
      409,
      "ADMIN_AUGGIE_TARGET_STATE",
    );
  const stored: StoredTarget = {
    ...target,
    expectedState: "pending_admin_approval",
  };
  const label = decision === "approve" ? "APPROVE" : "REJECT";
  return insertDelegatedOperation(ctx, {
    toolName: `student_profile_${decision}`,
    args: {
      kind: "student_profile_decision",
      action: `profile_${decision}`,
      targets: [stored],
      route: "admin/student-profile-status",
      requiresSecondaryConfirmation: true,
      requiredPath: PROFILE_REQUEST_PATH,
      profileDecision: decision,
      undoable: false,
    },
    primaryPhrase: `${label} PROFILE ${target.publicId}`,
    secondaryPhrase: `CONFIRM REVIEWED PROFILE ${target.publicId}`,
    records: [
      {
        studentId: target.publicId,
        name: target.name,
        dojo: target.dojoName,
        before: "waiting for review",
        after: decision === "approve" ? "approved" : "rejected",
      },
    ],
    extraPreview: {
      manualEvidenceReview: true,
      warningEn: `No change has been made. Admin Auggie can never open the submitted picture or the private details in this request. Open profile requests, look at ${target.publicId} yourself, then type both exact confirmation phrases. This decision cannot be undone here.`,
      warningTh: `ยังไม่มีการเปลี่ยนแปลง Admin Auggie ไม่สามารถเปิดรูปภาพหรือข้อมูลส่วนตัวในคำขอนี้ได้ โปรดเปิดหน้าคำขอโปรไฟล์ ตรวจ ${target.publicId} ด้วยตนเอง แล้วพิมพ์ข้อความยืนยันทั้งสองให้ตรง การตัดสินใจนี้ย้อนกลับที่นี่ไม่ได้`,
    },
  });
}

const BULK_LABELS: Record<BulkStudentAction, string> = {
  add_hours: "BULK ADD HOURS",
  approve_pending_hours: "BULK APPROVE HOURS",
  mass_rank_change: "BULK RANK CHANGE",
  mass_promotion: "BULK PROMOTION",
};

async function proposeBulkStudentAction(
  ctx: AdminAuggieContext,
  args: Record<string, unknown>,
) {
  requirePathPermission(ctx, STUDENT_PATH);
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
    parseStudentIds(args.studentIds, MAX_BULK_TARGETS),
  );
  if (
    targets.some(
      (target) =>
        target.active !== 1 ||
        target.archivedAt ||
        target.deletedAt ||
        target.profileStatus !== "approved",
    )
  )
    throw new AdminAuggieError(
      "Bulk actions require active, approved, unarchived students.",
      409,
      "ADMIN_AUGGIE_TARGET_STATE",
    );
  const stored: StoredTarget[] = [];
  const records: Array<Record<string, unknown>> = [];
  const extra: Partial<DelegatedArgs> = {};
  let detail = "";
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
    extra.hours = hours;
    extra.location = location;
    detail = `${hours} hours`;
    for (const target of targets) {
      stored.push({
        ...target,
        expectedState: `${target.active}|${hoursText(target.totalHours)}`,
      });
      records.push({
        studentId: target.publicId,
        name: target.name,
        dojo: target.dojoName,
        before: `${target.totalHours} hours`,
        after: `${target.totalHours + hours} hours`,
      });
    }
  } else if (action === "approve_pending_hours") {
    const placeholders = targets.map(() => "?").join(",");
    const pending =
      (
        await ctx.db
          .prepare(
            `SELECT student_id, COUNT(*) AS request_count,
          COALESCE(SUM(submitted_hours), 0) AS pending_hours
        FROM training_hour_requests
        WHERE status = 'pending' AND student_id IN (${placeholders})
        GROUP BY student_id`,
          )
          .bind(...targets.map((target) => target.id))
          .all<{
            student_id: string;
            request_count: number;
            pending_hours: number;
          }>()
      ).results || [];
    const byStudent = new Map(pending.map((row) => [row.student_id, row]));
    if (targets.some((target) => !byStudent.has(target.id)))
      throw new AdminAuggieError(
        "Every selected student must still have a pending training-hour request.",
        409,
        "ADMIN_AUGGIE_TARGET_STATE",
      );
    extra.pendingRequestCount = pending.reduce(
      (sum, row) => sum + Number(row.request_count),
      0,
    );
    extra.pendingHours = pending.reduce(
      (sum, row) => sum + Number(row.pending_hours),
      0,
    );
    detail = `${extra.pendingRequestCount} request(s), ${extra.pendingHours} hours`;
    for (const target of targets) {
      const row = byStudent.get(target.id)!;
      stored.push({
        ...target,
        expectedState: `${target.active}|${hoursText(target.totalHours)}|${Number(
          row.request_count,
        )}|${hoursText(Number(row.pending_hours))}`,
      });
      records.push({
        studentId: target.publicId,
        name: target.name,
        dojo: target.dojoName,
        before: `${target.totalHours} hours`,
        after: `${target.totalHours + Number(row.pending_hours)} hours`,
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
    extra.levels = levels;
    detail = `${levels} level(s)`;
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
      extra.location = location;
      extra.examinationDate = examinationDate;
      detail = `${levels} level(s) on ${examinationDate}`;
    }
    for (const target of targets) {
      const next = promoteRank(target.currentRank, levels);
      if (!next)
        throw new AdminAuggieError(
          `${target.publicId} cannot move ${levels} level(s) from ${target.currentRank}.`,
        );
      stored.push({
        ...target,
        expectedState: `${target.currentRank}|${target.active}`,
      });
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
  const dojos = Array.from(new Set(stored.map((target) => target.dojoName)));
  const count = stored.length;
  const permanent = action !== "mass_rank_change";
  return insertDelegatedOperation(ctx, {
    toolName: `bulk_${action}`,
    args: {
      kind: "bulk_student_action",
      action: `bulk_${action}`,
      targets: stored,
      route: "admin/students-bulk",
      requiresSecondaryConfirmation: true,
      requiredPath: STUDENT_PATH,
      bulkAction: action,
      ...extra,
      // A rank is a plain, reversible value. Added hours, approved requests and
      // recorded examinations become permanent history, so they are never
      // offered an undo here.
      undoable: action === "mass_rank_change",
    },
    primaryPhrase: `${BULK_LABELS[action]} ${plural(count, "STUDENT")}`,
    secondaryPhrase: `CONFIRM BULK CHANGE ${plural(count, "STUDENT")}`,
    records,
    extraPreview: {
      bulkAction: action,
      detail,
      transactional: true,
      undoable: action === "mass_rank_change",
      warningEn: `No change has been made. This changes ${count} student record(s) in ${dojos.join(", ") || "your dojo"} at once (${detail}). The whole batch is saved in one transaction: either every student changes or none does. Read every record above, then type both exact confirmation phrases.${permanent ? " This bulk change writes permanent records and cannot be undone by Auggie." : " A rank change can be undone safely for a short time after it is saved."}`,
      warningTh: `ยังไม่มีการเปลี่ยนแปลง รายการนี้จะเปลี่ยนระเบียนนักเรียน ${count} รายการใน ${dojos.join(", ") || "โดโจของคุณ"} พร้อมกัน (${detail}) ทั้งชุดจะบันทึกในธุรกรรมเดียว คือเปลี่ยนทุกคนหรือไม่เปลี่ยนเลย โปรดอ่านทุกระเบียนด้านบน แล้วพิมพ์ข้อความยืนยันทั้งสองให้ตรง${permanent ? " การเปลี่ยนแปลงนี้สร้างระเบียนถาวรและ Auggie ย้อนกลับไม่ได้" : " การเปลี่ยนระดับสามารถย้อนกลับได้อย่างปลอดภัยในช่วงเวลาสั้น ๆ หลังบันทึก"}`,
    },
  });
}

// --- Newsletter, gallery, website and dojo tools ----------------------------
// Every read below either calls the reviewed administration endpoint itself or
// uses the same published-content reader those endpoints use. Every write is
// prepared here and performed by the reviewed endpoint, which keeps its own
// transaction, permission check, conflict check and domain audit rows. Admin
// Auggie never writes a newsletter, gallery, website or dojo row directly, and
// it can never upload a file: photo uploads and the gallery trash stay in the
// reviewed page.

type GallerySnapshot = {
  albums: GalleryAlbum[];
  draftAlbums: Record<string, GalleryAlbum[]>;
  publishedAlbums: Record<string, GalleryAlbum[]>;
  draftUpdatedAt: string | null;
};

type SiteSnapshot = {
  pages: SitePage[];
  siteSettings: SiteSettings | undefined;
  draftUpdatedAt: string | null;
};

type ContentObservation = {
  state: string;
  newsletter?: RecentEvent;
  gallery?: GallerySnapshot;
  site?: SiteSnapshot;
  dojo?: DojoRecord;
};

function contentUnavailable(message: string, status = 409): never {
  throw new AdminAuggieError(
    message,
    status,
    status === 403
      ? "ADMIN_AUGGIE_ROUTE_FORBIDDEN"
      : "ADMIN_AUGGIE_CONTENT_UNAVAILABLE",
  );
}

async function readDelegatedJson(
  ctx: AdminAuggieContext,
  route: AdminApiRoute,
  query?: Record<string, string>,
) {
  const call = await callAdminApi({
    source: ctx.request,
    env: ctx.env,
    route,
    method: "GET",
    requestId: ctx.requestId,
    query,
  });
  if (call.status >= 400)
    contentUnavailable(
      typeof call.body.error === "string" && call.body.error
        ? call.body.error
        : "That administration area could not be read.",
      call.status === 401 || call.status === 403 ? 403 : 409,
    );
  return call.body;
}

async function readNewsletters(ctx: AdminAuggieContext) {
  try {
    const content = await readEditableContentFromStorage(ctx.env);
    return Array.isArray(content.recentEvents) ? content.recentEvents : [];
  } catch {
    return contentUnavailable(
      "The saved website content could not be read. Nothing was changed.",
      503,
    );
  }
}

function parseWebAddress(value: unknown) {
  const slug = cleanText(value, 100).toLocaleLowerCase("en-US");
  if (!slug || slug.length > 100 || !NEWSLETTER_SLUG.test(slug))
    throw new AdminAuggieError(
      "Use the exact web address shown in the website editor.",
    );
  return slug;
}

function requireNewsletter(events: RecentEvent[], slug: string) {
  const matches = events.filter((event) => event.slug === slug);
  if (matches.length !== 1)
    throw new AdminAuggieError(
      matches.length
        ? `More than one newsletter uses the web address ${slug}. Use the reviewed website editor.`
        : `No saved newsletter or event uses the web address ${slug}.`,
      409,
      "ADMIN_AUGGIE_TARGET_MISSING",
    );
  return matches[0];
}

function parseGalleryId(ctx: AdminAuggieContext, value: unknown): GalleryId {
  const galleryId = cleanText(value, 40);
  if (!GALLERY_IDS.includes(galleryId as GalleryId))
    throw new AdminAuggieError("Choose one of the existing galleries.");
  requirePathPermission(ctx, galleryPath(galleryId as GalleryId));
  return galleryId as GalleryId;
}

function parseGalleryItemId(value: unknown, label: string) {
  const id = cleanText(value, 140);
  if (!GALLERY_ITEM_ID.test(id))
    throw new AdminAuggieError(
      `Use the exact ${label} shown in the gallery page.`,
    );
  return id;
}

function albumsByGallery(value: unknown) {
  const record = objectValue(value) || {};
  return Object.fromEntries(
    GALLERY_IDS.map((galleryId) => [
      galleryId,
      Array.isArray(record[galleryId])
        ? (record[galleryId] as GalleryAlbum[])
        : [],
    ]),
  ) as Record<string, GalleryAlbum[]>;
}

async function readGallery(
  ctx: AdminAuggieContext,
  galleryId?: GalleryId,
): Promise<GallerySnapshot> {
  const body = await readDelegatedJson(
    ctx,
    "admin/galleries",
    galleryId ? { galleryId } : undefined,
  );
  const draftAlbums = albumsByGallery(body.albums);
  const draft = objectValue(body.draftMeta);
  return {
    albums: galleryId ? draftAlbums[galleryId] : [],
    draftAlbums,
    publishedAlbums: albumsByGallery(body.publishedAlbums),
    draftUpdatedAt:
      typeof draft?.updatedAt === "string" ? draft.updatedAt : null,
  };
}

function requireAlbum(snapshot: GallerySnapshot, albumId: string) {
  const album = snapshot.albums.find((entry) => entry.id === albumId);
  if (!album)
    throw new AdminAuggieError(
      `No album with the id ${albumId} is in that gallery.`,
      409,
      "ADMIN_AUGGIE_TARGET_MISSING",
    );
  return album;
}

async function readSiteContent(
  ctx: AdminAuggieContext,
): Promise<SiteSnapshot> {
  const body = await readDelegatedJson(ctx, "admin/site-content");
  const content = objectValue(body.content) || {};
  const draft = objectValue(body.draftMeta);
  return {
    pages: Array.isArray(content.sitePages)
      ? (content.sitePages as SitePage[])
      : [],
    siteSettings: (content.siteSettings as SiteSettings) || undefined,
    draftUpdatedAt:
      typeof draft?.updatedAt === "string" ? draft.updatedAt : null,
  };
}

async function readDojos(ctx: AdminAuggieContext) {
  const body = await readDelegatedJson(ctx, "admin/dojos");
  return Array.isArray(body.dojos) ? (body.dojos as DojoRecord[]) : [];
}

function galleryDraftState(snapshot: GallerySnapshot, albums: GalleryAlbum[]) {
  return `${snapshot.draftUpdatedAt || ""}|${albumsState(albums)}`;
}

function siteDraftState(snapshot: SiteSnapshot) {
  return `${snapshot.draftUpdatedAt || ""}|${sitePagesState(snapshot.pages)}`;
}

// The same state string is built when the proposal is prepared and again when
// it is confirmed. A record touched by anyone in between changes the string, so
// the confirmation is refused before anything is sent to the reviewed endpoint.
async function observeContent(
  ctx: AdminAuggieContext,
  args: Pick<
    ContentArgs,
    "kind" | "newsletterSlug" | "galleryId" | "albumId" | "pageRoute" | "dojoId"
  >,
): Promise<ContentObservation> {
  if (args.kind.startsWith("newsletter_")) {
    const events = await readNewsletters(ctx);
    const matches = events.filter((event) => event.slug === args.newsletterSlug);
    const newsletter = matches.length === 1 ? matches[0] : undefined;
    return {
      state: newsletter ? await sha256Hex(newsletterState(newsletter)) : "missing",
      newsletter,
    };
  }
  if (args.kind === "gallery_publish") {
    const gallery = await readGallery(ctx);
    return {
      state: await sha256Hex(
        `${gallery.draftUpdatedAt || ""}|${GALLERY_IDS.map((galleryId) =>
          albumsState(gallery.draftAlbums[galleryId]),
        ).join("|")}`,
      ),
      gallery,
    };
  }
  if (args.kind.startsWith("gallery_")) {
    const gallery = await readGallery(ctx, args.galleryId);
    return {
      state: await sha256Hex(galleryDraftState(gallery, gallery.albums)),
      gallery,
    };
  }
  if (args.kind === "site_page_visibility" || args.kind === "site_publish") {
    const site = await readSiteContent(ctx);
    return { state: await sha256Hex(siteDraftState(site)), site };
  }
  const dojos = await readDojos(ctx);
  const dojo = dojos.find((entry) => entry.id === args.dojoId);
  return {
    state: dojo ? await sha256Hex(dojoState(dojo)) : "missing",
    dojo,
  };
}

function contentSubjectKey(args: ContentArgs) {
  if (args.kind.startsWith("newsletter_")) return args.newsletterSlug || "";
  if (args.kind === "site_page_visibility") return args.pageRoute || "";
  if (args.kind === "site_publish") return "website";
  if (args.kind === "dojo_settings") return args.dojoId || "";
  return `${args.galleryId || "all"}${args.albumId ? `:${args.albumId}` : ""}`;
}

function contentGuardTarget(args: ContentArgs) {
  return `__content__:${args.kind}:${contentSubjectKey(args)}`.slice(0, 200);
}

function contentGuardStatement(
  db: D1Database,
  operationId: string,
  args: ContentArgs,
  observed: string,
) {
  return db
    .prepare(
      `INSERT INTO admin_ai_execution_guards
    (operation_id, target_id, expected_state, observed_state) VALUES (?, ?, ?, ?)`,
    )
    .bind(operationId, contentGuardTarget(args), args.expectedState, observed);
}

async function insertContentOperation(
  ctx: AdminAuggieContext,
  input: {
    toolName: string;
    affectedLabel: string;
    args: ContentArgs;
    primaryPhrase: string;
    secondaryPhrase?: string;
    records: ContentRecord[];
    heading: string;
    headingTh: string;
    warningEn: string;
    warningTh: string;
    extraPreview?: Record<string, unknown>;
  },
) {
  const preview = {
    action: input.args.action,
    count: input.args.affectedCount,
    dojos: input.args.dojoId ? [input.args.dojoId] : [],
    records: input.records,
    path: input.args.requiredPath,
    confirmationPhrase: input.primaryPhrase,
    secondaryConfirmationPhrase: input.secondaryPhrase || null,
    warningEn: input.warningEn,
    warningTh: input.warningTh,
    ...input.extraPreview,
  };
  const row = await insertOperation(ctx, {
    toolName: input.toolName,
    mode: "direct",
    status: "prepared",
    args: input.args,
    preview,
    fingerprints: {
      [contentGuardTarget(input.args)]: input.args.expectedState,
    },
    phrase: input.primaryPhrase,
    secondaryPhrase: input.secondaryPhrase,
    affectedCount: input.args.affectedCount,
    affectedLabel: input.affectedLabel,
    dojoIds: input.args.dojoId ? [input.args.dojoId] : [],
  });
  return {
    kind: "proposal" as const,
    heading: localized(ctx.locale, input.heading, input.headingTh),
    message: localized(
      ctx.locale,
      "I have read the saved record again and checked your access. Nothing has changed yet. Please look it over below.",
      "อ่านระเบียนที่บันทึกไว้อีกครั้งและตรวจสิทธิ์ของคุณแล้ว ยังไม่มีการเปลี่ยนแปลงใด ๆ โปรดตรวจดูด้านล่าง",
    ),
    operation: operationProposal(row, ctx.locale),
  };
}

function contentList(
  ctx: AdminAuggieContext,
  heading: string,
  headingTh: string,
  records: ContentRecord[],
  path: string,
) {
  return {
    kind: "students" as const,
    heading: localized(ctx.locale, heading, headingTh),
    message: records.length
      ? localized(
          ctx.locale,
          "Here is what I found. Uploading files and permanent deletion are still done on the normal page.",
          "นี่คือผลการค้นหา การอัปโหลดไฟล์และการลบถาวรยังคงทำในหน้าปกติ",
        )
      : localized(
          ctx.locale,
          "Sorry, I could not find anything matching that.",
          "ขออภัย ไม่พบรายการที่ตรงกัน",
        ),
    students: records,
    path,
  };
}

async function listNewsletters(
  ctx: AdminAuggieContext,
  args: Record<string, unknown>,
) {
  requirePathPermission(ctx, WEBSITE_PATH);
  if (!exactKeys(args, ["query", "contentType", "state", "limit"]))
    throw new AdminAuggieError(
      "The newsletter list contains unsupported fields.",
    );
  const query = cleanText(args.query, 120).toLocaleLowerCase("en-US");
  const contentType =
    args.contentType === undefined ? "" : cleanText(args.contentType, 20);
  const state = args.state === undefined ? "" : cleanText(args.state, 20);
  const limit = args.limit === undefined ? 10 : Number(args.limit);
  if (
    query.length > 120 ||
    (contentType && contentType !== "newsletter" && contentType !== "event") ||
    (state &&
      !["draft", "published", "sent", "archived", "trash"].includes(state)) ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 20
  )
    throw new AdminAuggieError(
      "Enter an optional search, a valid kind and state, and a limit from 1-20.",
    );
  const events = await readNewsletters(ctx);
  const records = events
    .filter((event) => {
      const lifecycle = newsletterLifecycle(event);
      const sent = newsletterSendStatus(event) === "sent";
      if (contentType && (event.contentType || "newsletter") !== contentType)
        return false;
      if (state === "trash" && lifecycle !== "trash") return false;
      if (state === "archived" && lifecycle !== "archived") return false;
      if (state === "sent" && !sent) return false;
      if (state === "published" && (lifecycle !== "active" || !event.published))
        return false;
      if (state === "draft" && (lifecycle !== "active" || event.published))
        return false;
      if (
        query &&
        !`${event.title} ${event.slug}`.toLocaleLowerCase("en-US").includes(query)
      )
        return false;
      return true;
    })
    .slice(0, limit)
    .map(newsletterRecord);
  await auditAi(ctx, "admin_ai_website_read", "list_newsletters", "success", {
    resultCount: records.length,
  });
  return contentList(
    ctx,
    "Newsletters and events",
    "จดหมายข่าวและกิจกรรม",
    records,
    WEBSITE_PATH,
  );
}

function slugFromTitle(title: string, date: string) {
  const slug = title
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100)
    .replace(/-+$/g, "");
  return NEWSLETTER_SLUG.test(slug) ? slug : `newsletter-${date}`;
}

async function proposeNewsletterCreate(
  ctx: AdminAuggieContext,
  args: Record<string, unknown>,
) {
  requirePathPermission(ctx, WEBSITE_PATH);
  if (
    !exactKeys(args, [
      "title",
      "summary",
      "body",
      "category",
      "date",
      "webAddress",
    ])
  )
    throw new AdminAuggieError(
      "The new newsletter proposal contains unsupported fields.",
    );
  const title = cleanText(args.title, 160);
  const summary = cleanText(args.summary, 500);
  const body = cleanText(args.body, 5_000);
  const date = cleanText(args.date, 10);
  if (!title || !summary || !body)
    throw new AdminAuggieError(
      "A newsletter needs a title, a short summary and its text.",
    );
  if (!isCanonicalDate(date))
    throw new AdminAuggieError("Choose a date in YYYY-MM-DD form.");
  const category = NEWSLETTER_CATEGORIES.find(
    (entry) => entry === cleanText(args.category, 60),
  );
  if (!category)
    throw new AdminAuggieError(
      `Choose one of these categories: ${NEWSLETTER_CATEGORIES.join(", ")}.`,
    );
  const slug =
    args.webAddress === undefined || args.webAddress === ""
      ? slugFromTitle(title, date)
      : parseWebAddress(args.webAddress);
  const events = await readNewsletters(ctx);
  if (
    events.some(
      (event) => event.slug === slug || event.slugHistory?.includes(slug),
    )
  )
    throw new AdminAuggieError(
      `The web address ${slug} is already used by another newsletter. Choose a different one.`,
      409,
      "ADMIN_AUGGIE_TARGET_STATE",
    );
  const observed = await observeContent(ctx, {
    kind: "newsletter_create",
    newsletterSlug: slug,
  });
  return insertContentOperation(ctx, {
    toolName: "newsletter_created",
    affectedLabel: "newsletter",
    args: {
      kind: "newsletter_create",
      action: "create_newsletter",
      targets: [],
      route: "admin/newsletter-save",
      requiresSecondaryConfirmation: false,
      requiredPath: WEBSITE_PATH,
      expectedState: observed.state,
      affectedCount: 1,
      newsletterSlug: slug,
      newsletterTitle: title,
      newsletterSummary: summary,
      newsletterBody: body,
      newsletterCategory: category,
      newsletterDate: date,
      published: false,
    },
    primaryPhrase: "CREATE NEWSLETTER",
    records: [
      {
        studentId: slug,
        name: title,
        dojo: category,
        rank: date,
        status: localized(ctx.locale, "draft", "ฉบับร่าง"),
      },
    ],
    heading: "New newsletter",
    headingTh: "จดหมายข่าวใหม่",
    warningEn:
      "Nothing has been saved yet. This creates an unpublished draft only: it does not go on the website and it does not email anybody. Publishing and sending stay separate steps that each need their own confirmation.",
    warningTh:
      "ยังไม่มีการบันทึก ขั้นตอนนี้สร้างเฉพาะฉบับร่างที่ยังไม่เผยแพร่ จะไม่ขึ้นเว็บไซต์และไม่ส่งอีเมลถึงใคร การเผยแพร่และการส่งเป็นขั้นตอนแยกที่ต้องยืนยันของตนเอง",
    extraPreview: { title, summary, category, date, webAddress: slug },
  });
}

async function proposeNewsletterWebsiteState(
  ctx: AdminAuggieContext,
  args: Record<string, unknown>,
) {
  requirePathPermission(ctx, WEBSITE_PATH);
  if (!exactKeys(args, ["webAddress", "published"]))
    throw new AdminAuggieError(
      "The newsletter proposal contains unsupported fields.",
    );
  if (typeof args.published !== "boolean")
    throw new AdminAuggieError("Choose whether to publish or unpublish.");
  const slug = parseWebAddress(args.webAddress);
  const published = args.published;
  const event = requireNewsletter(await readNewsletters(ctx), slug);
  if (newsletterLifecycle(event) !== "active")
    throw new AdminAuggieError(
      `${slug} is ${newsletterStatusLabel(event)}. Restore it before changing the website.`,
      409,
      "ADMIN_AUGGIE_TARGET_STATE",
    );
  if (event.published === published)
    throw new AdminAuggieError(
      `${slug} is already ${published ? "published on the website" : "unpublished"}.`,
      409,
      "ADMIN_AUGGIE_TARGET_STATE",
    );
  const issues = published ? newsletterPublicationIssues(event) : [];
  if (issues.length)
    throw new AdminAuggieError(
      `${slug} is not ready to publish: ${issues.join(" ")}`,
      409,
      "ADMIN_AUGGIE_TARGET_STATE",
    );
  return insertContentOperation(ctx, {
    toolName: `newsletter_${published ? "publish" : "unpublish"}`,
    affectedLabel: "newsletter",
    args: {
      kind: "newsletter_website_state",
      action: published ? "newsletter_published" : "newsletter_unpublished",
      targets: [],
      route: "admin/newsletter-save",
      requiresSecondaryConfirmation: false,
      requiredPath: WEBSITE_PATH,
      expectedState: await sha256Hex(newsletterState(event)),
      affectedCount: 1,
      newsletterSlug: slug,
      published,
    },
    primaryPhrase: `${published ? "PUBLISH" : "UNPUBLISH"} 1 NEWSLETTER`,
    records: [
      {
        ...newsletterRecord(event),
        before: newsletterStatusLabel(event),
        after: published ? "published on website" : "draft",
      },
    ],
    heading: published ? "Publish proposal" : "Unpublish proposal",
    headingTh: published ? "ข้อเสนอเผยแพร่" : "ข้อเสนอเลิกเผยแพร่",
    warningEn: published
      ? "No change has been made. Confirming puts this newsletter on the public website straight away. It does not send any email. You can unpublish it again afterwards."
      : "No change has been made. Confirming removes this newsletter from the public website. Any email already sent cannot be recalled.",
    warningTh: published
      ? "ยังไม่มีการเปลี่ยนแปลง เมื่อยืนยันจะนำจดหมายข่าวนี้ขึ้นเว็บไซต์สาธารณะทันที และจะไม่มีการส่งอีเมล คุณสามารถเลิกเผยแพร่ได้ภายหลัง"
      : "ยังไม่มีการเปลี่ยนแปลง เมื่อยืนยันจะนำจดหมายข่าวนี้ออกจากเว็บไซต์สาธารณะ อีเมลที่ส่งไปแล้วไม่สามารถเรียกคืนได้",
    extraPreview: { webAddress: slug },
  });
}

async function proposeNewsletterLifecycle(
  ctx: AdminAuggieContext,
  args: Record<string, unknown>,
) {
  requirePathPermission(ctx, WEBSITE_PATH);
  if (!exactKeys(args, ["webAddress", "lifecycle"]))
    throw new AdminAuggieError(
      "The newsletter proposal contains unsupported fields.",
    );
  const lifecycle = cleanText(args.lifecycle, 20) as NewsletterLifecycle;
  if (!["active", "archived", "trash"].includes(lifecycle))
    throw new AdminAuggieError("Choose restore, archive, or trash.");
  const slug = parseWebAddress(args.webAddress);
  const event = requireNewsletter(await readNewsletters(ctx), slug);
  if (newsletterLifecycle(event) === lifecycle)
    throw new AdminAuggieError(
      `${slug} is already ${newsletterStatusLabel(event)}.`,
      409,
      "ADMIN_AUGGIE_TARGET_STATE",
    );
  const label =
    lifecycle === "active"
      ? "RESTORE"
      : lifecycle === "archived"
        ? "ARCHIVE"
        : "TRASH";
  return insertContentOperation(ctx, {
    toolName: `newsletter_lifecycle_${lifecycle}`,
    affectedLabel: "newsletter",
    args: {
      kind: "newsletter_lifecycle",
      action: `newsletter_${lifecycle}`,
      targets: [],
      route: "admin/newsletter-save",
      requiresSecondaryConfirmation: false,
      requiredPath: WEBSITE_PATH,
      expectedState: await sha256Hex(newsletterState(event)),
      affectedCount: 1,
      newsletterSlug: slug,
      lifecycle,
    },
    primaryPhrase: `${label} 1 NEWSLETTER`,
    records: [
      {
        ...newsletterRecord(event),
        before: newsletterStatusLabel(event),
        after:
          lifecycle === "active"
            ? "restored"
            : lifecycle === "archived"
              ? "archived"
              : "in trash",
      },
    ],
    heading: "Newsletter state proposal",
    headingTh: "ข้อเสนอเปลี่ยนสถานะจดหมายข่าว",
    warningEn:
      lifecycle === "active"
        ? "No change has been made. Confirming brings this newsletter back into the active list. It is not published on the website by this action."
        : "No change has been made. Confirming takes this newsletter off the public website and moves it out of the active list. Nothing is deleted, and you can restore it.",
    warningTh:
      lifecycle === "active"
        ? "ยังไม่มีการเปลี่ยนแปลง เมื่อยืนยันจะนำจดหมายข่าวกลับสู่รายการที่ใช้งาน และจะไม่เผยแพร่บนเว็บไซต์จากการทำงานนี้"
        : "ยังไม่มีการเปลี่ยนแปลง เมื่อยืนยันจะนำจดหมายข่าวออกจากเว็บไซต์สาธารณะและออกจากรายการที่ใช้งาน ไม่มีการลบข้อมูล และคุณกู้คืนได้",
    extraPreview: { webAddress: slug, lifecycle },
  });
}

// Sending reaches real people and can never be recalled. The live subscriber
// count is read from the delivery provider before the proposal is written, is
// bound into both confirmation phrases, and is sent to the reviewed endpoint,
// which refuses the delivery if the count moved in the meantime.
async function proposeNewsletterSend(
  ctx: AdminAuggieContext,
  args: Record<string, unknown>,
) {
  requirePathPermission(ctx, WEBSITE_PATH);
  if (!exactKeys(args, ["webAddress"]))
    throw new AdminAuggieError("The send proposal contains unsupported fields.");
  if (!newsletterPublishingEnabled(ctx.env))
    throw new AdminAuggieError(
      "Newsletter delivery is paused on the server. Nothing was sent.",
      503,
      "ADMIN_AUGGIE_CONFIGURATION",
    );
  if (missingBrevoEnv(ctx.env).length)
    throw new AdminAuggieError(
      "Subscriber email is not configured on the server. Nothing was sent.",
      503,
      "ADMIN_AUGGIE_CONFIGURATION",
    );
  const slug = parseWebAddress(args.webAddress);
  const event = requireNewsletter(await readNewsletters(ctx), slug);
  if (newsletterLifecycle(event) !== "active")
    throw new AdminAuggieError(
      `${slug} is ${newsletterStatusLabel(event)} and cannot be sent.`,
      409,
      "ADMIN_AUGGIE_TARGET_STATE",
    );
  if (newsletterSendStatus(event) !== "not_sent")
    throw new AdminAuggieError(
      `${slug} already has a delivery recorded. Use the reviewed website editor.`,
      409,
      "ADMIN_AUGGIE_TARGET_STATE",
    );
  const issues = newsletterPublicationIssues(event);
  if (issues.length)
    throw new AdminAuggieError(
      `${slug} is not ready to send: ${issues.join(" ")}`,
      409,
      "ADMIN_AUGGIE_TARGET_STATE",
    );
  const recipientCount = await getBrevoSubscriberCount(ctx.env).catch(
    () => null,
  );
  if (recipientCount == null || !Number.isInteger(recipientCount))
    throw new AdminAuggieError(
      "The live subscriber count could not be read, so no send was prepared.",
      503,
      "ADMIN_AUGGIE_CONTENT_UNAVAILABLE",
    );
  const people = plural(recipientCount, "SUBSCRIBER");
  return insertContentOperation(ctx, {
    toolName: "newsletter_send",
    affectedLabel: "newsletter",
    args: {
      kind: "newsletter_send",
      action: "newsletter_sent",
      targets: [],
      route: "admin/newsletter-send",
      requiresSecondaryConfirmation: true,
      requiredPath: WEBSITE_PATH,
      expectedState: await sha256Hex(newsletterState(event)),
      affectedCount: 1,
      newsletterSlug: slug,
      recipientCount,
    },
    primaryPhrase: `SEND 1 NEWSLETTER TO ${people}`,
    secondaryPhrase: `CONFIRM REAL EMAIL SEND ${people}`,
    records: [
      {
        ...newsletterRecord(event),
        before: "not sent",
        after: `email to ${recipientCount} subscriber(s)`,
      },
    ],
    heading: "Email send proposal",
    headingTh: "ข้อเสนอส่งอีเมล",
    warningEn: `No email has been sent. Confirming sends this newsletter as real email to ${recipientCount} real subscriber(s). It cannot be recalled, undone, or sent again. Read the newsletter yourself in the reviewed website editor first, then type both exact phrases.`,
    warningTh: `ยังไม่มีการส่งอีเมล เมื่อยืนยันจะส่งจดหมายข่าวนี้เป็นอีเมลจริงถึงผู้รับจริง ${recipientCount} ราย ไม่สามารถเรียกคืน ย้อนกลับ หรือส่งซ้ำได้ โปรดอ่านจดหมายข่าวด้วยตนเองในหน้าจอที่มีการตรวจสอบก่อน แล้วจึงพิมพ์ข้อความยืนยันทั้งสองให้ตรงทุกตัวอักษร`,
    extraPreview: { webAddress: slug, recipientCount, sendsRealEmail: true },
  });
}

async function proposeNewsletterDelete(
  ctx: AdminAuggieContext,
  args: Record<string, unknown>,
) {
  requirePathPermission(ctx, WEBSITE_PATH);
  if (!exactKeys(args, ["webAddress"]))
    throw new AdminAuggieError(
      "The delete proposal contains unsupported fields.",
    );
  const slug = parseWebAddress(args.webAddress);
  const event = requireNewsletter(await readNewsletters(ctx), slug);
  if (newsletterLifecycle(event) !== "trash")
    throw new AdminAuggieError(
      `${slug} is ${newsletterStatusLabel(event)}. Only a newsletter already in the trash can be deleted permanently.`,
      409,
      "ADMIN_AUGGIE_TARGET_STATE",
    );
  return insertContentOperation(ctx, {
    toolName: "newsletter_permanent_delete",
    affectedLabel: "newsletter",
    args: {
      kind: "newsletter_delete",
      action: "newsletter_permanently_deleted",
      targets: [],
      route: "admin/newsletter-actions",
      requiresSecondaryConfirmation: true,
      requiredPath: WEBSITE_PATH,
      expectedState: await sha256Hex(newsletterState(event)),
      affectedCount: 1,
      newsletterSlug: slug,
    },
    primaryPhrase: "DELETE 1 NEWSLETTER FOREVER",
    secondaryPhrase: "CONFIRM PERMANENT DELETE 1 NEWSLETTER",
    records: [
      { ...newsletterRecord(event), before: "in trash", after: "deleted" },
    ],
    heading: "Permanent delete proposal",
    headingTh: "ข้อเสนอลบถาวร",
    warningEn:
      "Nothing has been deleted. Confirming removes this newsletter and its text for good. It cannot be undone or recovered, so it needs two exact confirmations.",
    warningTh:
      "ยังไม่มีการลบใด ๆ เมื่อยืนยันจะลบจดหมายข่าวนี้และเนื้อหาอย่างถาวร ไม่สามารถย้อนกลับหรือกู้คืนได้ จึงต้องยืนยันสองครั้งให้ตรงทุกตัวอักษร",
    extraPreview: { webAddress: slug, permanent: true },
  });
}

async function listGalleryAlbums(
  ctx: AdminAuggieContext,
  args: Record<string, unknown>,
) {
  if (!exactKeys(args, ["galleryId", "albumId", "limit"]))
    throw new AdminAuggieError("The gallery list contains unsupported fields.");
  const galleryId = parseGalleryId(ctx, args.galleryId);
  const limit = args.limit === undefined ? 20 : Number(args.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 20)
    throw new AdminAuggieError("Choose a limit from 1-20.");
  const snapshot = await readGallery(ctx, galleryId);
  const albumId =
    args.albumId === undefined
      ? ""
      : parseGalleryItemId(args.albumId, "album id");
  const records = albumId
    ? livePhotos(requireAlbum(snapshot, albumId)).slice(0, limit).map(photoRecord)
    : snapshot.albums
        .slice(0, limit)
        .map((album) => albumRecord(album, galleryId));
  await auditAi(ctx, "admin_ai_gallery_read", "list_gallery_albums", "success", {
    galleryId,
    resultCount: records.length,
  });
  return contentList(
    ctx,
    albumId ? "Album photos" : "Gallery albums",
    albumId ? "รูปในอัลบั้ม" : "อัลบั้มในแกลเลอรี",
    records,
    galleryPath(galleryId),
  );
}

function galleryDraftWarning(action: string, actionTh: string) {
  return {
    warningEn: `No change has been made. Confirming ${action} in the saved gallery draft only. The public website does not change until the galleries are published separately.`,
    warningTh: `ยังไม่มีการเปลี่ยนแปลง เมื่อยืนยันจะ${actionTh}เฉพาะในฉบับร่างของแกลเลอรีที่บันทึกไว้ เว็บไซต์สาธารณะจะยังไม่เปลี่ยนจนกว่าจะเผยแพร่แกลเลอรีแยกต่างหาก`,
  };
}

async function proposeGalleryAlbumUpdate(
  ctx: AdminAuggieContext,
  args: Record<string, unknown>,
) {
  if (
    !exactKeys(args, [
      "galleryId",
      "albumId",
      "title",
      "description",
      "date",
      "visibility",
      "coverPhotoId",
    ])
  )
    throw new AdminAuggieError("The album proposal contains unsupported fields.");
  const galleryId = parseGalleryId(ctx, args.galleryId);
  const albumId = parseGalleryItemId(args.albumId, "album id");
  const snapshot = await readGallery(ctx, galleryId);
  const album = requireAlbum(snapshot, albumId);
  const title = args.title === undefined ? undefined : cleanText(args.title, 160);
  const description =
    args.description === undefined ? undefined : cleanText(args.description, 2_000);
  const date = args.date === undefined ? undefined : cleanText(args.date, 40);
  const visibility =
    args.visibility === undefined ? undefined : cleanText(args.visibility, 20);
  const coverPhotoId =
    args.coverPhotoId === undefined
      ? undefined
      : parseGalleryItemId(args.coverPhotoId, "photo id");
  if (title !== undefined && !title)
    throw new AdminAuggieError("An album title cannot be empty.");
  if (date !== undefined && date && !isCanonicalDate(date))
    throw new AdminAuggieError("Use an album date in YYYY-MM-DD form.");
  if (
    visibility !== undefined &&
    !["published", "draft", "hidden"].includes(visibility)
  )
    throw new AdminAuggieError("Choose a valid album visibility.");
  if (
    coverPhotoId !== undefined &&
    !livePhotos(album).some((photo) => photo.id === coverPhotoId)
  )
    throw new AdminAuggieError(
      `${coverPhotoId} is not a photo in that album.`,
      409,
      "ADMIN_AUGGIE_TARGET_MISSING",
    );
  const changes: string[] = [];
  if (title !== undefined && title !== album.title) changes.push("title");
  if (description !== undefined && description !== (album.description || ""))
    changes.push("description");
  if (date !== undefined && date !== (album.date || "")) changes.push("date");
  if (visibility !== undefined && visibility !== album.visibility)
    changes.push("visibility");
  if (coverPhotoId !== undefined && coverPhotoId !== (album.coverPhotoId || ""))
    changes.push("cover photo");
  if (!changes.length)
    throw new AdminAuggieError(
      "That album already has those details.",
      409,
      "ADMIN_AUGGIE_TARGET_STATE",
    );
  const draftWarning = galleryDraftWarning(
    "saves these album details",
    "บันทึกรายละเอียดอัลบั้มนี้",
  );
  return insertContentOperation(ctx, {
    toolName: "gallery_album_update",
    affectedLabel: "album",
    args: {
      kind: "gallery_album_update",
      action: "gallery_album_updated",
      targets: [],
      route: "admin/galleries",
      requiresSecondaryConfirmation: false,
      requiredPath: galleryPath(galleryId),
      expectedState: await sha256Hex(
        galleryDraftState(snapshot, snapshot.albums),
      ),
      affectedCount: 1,
      galleryId,
      albumId,
      albumTitle: title,
      albumDescription: description,
      albumDate: date,
      albumVisibility: visibility as GalleryAlbum["visibility"] | undefined,
      coverPhotoId,
    },
    primaryPhrase: "UPDATE 1 ALBUM",
    records: [
      {
        ...albumRecord(album, galleryId),
        before: `${album.title} · ${album.visibility}`,
        after: `${title ?? album.title} · ${visibility ?? album.visibility}`,
      },
    ],
    heading: "Album change proposal",
    headingTh: "ข้อเสนอแก้ไขอัลบั้ม",
    ...draftWarning,
    extraPreview: { galleryId, albumId, changedFields: changes },
  });
}

async function proposeGalleryAlbumOrder(
  ctx: AdminAuggieContext,
  args: Record<string, unknown>,
) {
  if (!exactKeys(args, ["galleryId", "albumIds"]))
    throw new AdminAuggieError("The album order contains unsupported fields.");
  const galleryId = parseGalleryId(ctx, args.galleryId);
  if (
    !Array.isArray(args.albumIds) ||
    args.albumIds.length < 1 ||
    args.albumIds.length > MAX_GALLERY_ITEMS
  )
    throw new AdminAuggieError(
      `List between 1 and ${MAX_GALLERY_ITEMS} exact album ids in the wanted order.`,
    );
  const albumIds = args.albumIds.map((value) =>
    parseGalleryItemId(value, "album id"),
  );
  const snapshot = await readGallery(ctx, galleryId);
  const reordered = albumsWithOrder(snapshot.albums, albumIds);
  if (!reordered)
    throw new AdminAuggieError(
      "List every album of that gallery exactly once, in the wanted order.",
      409,
      "ADMIN_AUGGIE_TARGET_STATE",
    );
  const draftWarning = galleryDraftWarning(
    "saves this album order",
    "บันทึกลำดับอัลบั้มนี้",
  );
  return insertContentOperation(ctx, {
    toolName: "gallery_album_order",
    affectedLabel: "album",
    args: {
      kind: "gallery_album_order",
      action: "gallery_albums_reordered",
      targets: [],
      route: "admin/galleries",
      requiresSecondaryConfirmation: false,
      requiredPath: galleryPath(galleryId),
      expectedState: await sha256Hex(
        galleryDraftState(snapshot, snapshot.albums),
      ),
      affectedCount: albumIds.length,
      galleryId,
      albumIds,
    },
    primaryPhrase: `REORDER ${plural(albumIds.length, "ALBUM")}`,
    records: reordered.map((album, index) => ({
      ...albumRecord(album, galleryId),
      before: `position ${snapshot.albums.findIndex((entry) => entry.id === album.id) + 1}`,
      after: `position ${index + 1}`,
    })),
    heading: "Album order proposal",
    headingTh: "ข้อเสนอจัดลำดับอัลบั้ม",
    ...draftWarning,
    extraPreview: { galleryId },
  });
}

async function proposeGalleryPhotoCaptions(
  ctx: AdminAuggieContext,
  args: Record<string, unknown>,
) {
  if (!exactKeys(args, ["galleryId", "albumId", "photos"]))
    throw new AdminAuggieError("The caption proposal contains unsupported fields.");
  const galleryId = parseGalleryId(ctx, args.galleryId);
  const albumId = parseGalleryItemId(args.albumId, "album id");
  if (
    !Array.isArray(args.photos) ||
    args.photos.length < 1 ||
    args.photos.length > MAX_GALLERY_ITEMS
  )
    throw new AdminAuggieError(
      `Name between 1 and ${MAX_GALLERY_ITEMS} exact photo ids.`,
    );
  const captions: ContentCaption[] = args.photos.map((value) => {
    const entry = objectValue(value);
    if (!entry || !exactKeys(entry, ["photoId", "caption", "alt"]))
      throw new AdminAuggieError("Each photo needs a photo id.");
    if (entry.caption === undefined && entry.alt === undefined)
      throw new AdminAuggieError("Each photo needs a caption or a description.");
    return {
      photoId: parseGalleryItemId(entry.photoId, "photo id"),
      ...(entry.caption === undefined
        ? {}
        : { caption: cleanText(entry.caption, 1_000) }),
      ...(entry.alt === undefined ? {} : { alt: cleanText(entry.alt, 300) }),
    };
  });
  const snapshot = await readGallery(ctx, galleryId);
  const album = requireAlbum(snapshot, albumId);
  const next = albumWithPhotoCaptions(album, captions, new Date().toISOString());
  if (!next)
    throw new AdminAuggieError(
      "Name each photo of that album at most once, using the exact photo ids.",
      409,
      "ADMIN_AUGGIE_TARGET_STATE",
    );
  const byId = new Map(album.photos.map((photo) => [photo.id, photo]));
  const draftWarning = galleryDraftWarning(
    "saves these captions",
    "บันทึกคำบรรยายเหล่านี้",
  );
  return insertContentOperation(ctx, {
    toolName: "gallery_photo_captions",
    affectedLabel: "photo",
    args: {
      kind: "gallery_photo_captions",
      action: "gallery_photo_captions_updated",
      targets: [],
      route: "admin/galleries",
      requiresSecondaryConfirmation: false,
      requiredPath: galleryPath(galleryId),
      expectedState: await sha256Hex(
        galleryDraftState(snapshot, snapshot.albums),
      ),
      affectedCount: captions.length,
      galleryId,
      albumId,
      captions,
    },
    primaryPhrase: `CAPTION ${plural(captions.length, "PHOTO")}`,
    records: captions.map((entry) => {
      const photo = byId.get(entry.photoId)!;
      return {
        ...photoRecord(photo),
        before: photo.caption || photo.alt || "(no caption)",
        after: entry.caption ?? entry.alt ?? "(unchanged)",
      };
    }),
    heading: "Caption proposal",
    headingTh: "ข้อเสนอคำบรรยายภาพ",
    ...draftWarning,
    extraPreview: { galleryId, albumId },
  });
}

async function proposeGalleryPhotoOrder(
  ctx: AdminAuggieContext,
  args: Record<string, unknown>,
) {
  if (!exactKeys(args, ["galleryId", "albumId", "photoIds"]))
    throw new AdminAuggieError("The photo order contains unsupported fields.");
  const galleryId = parseGalleryId(ctx, args.galleryId);
  const albumId = parseGalleryItemId(args.albumId, "album id");
  if (
    !Array.isArray(args.photoIds) ||
    args.photoIds.length < 1 ||
    args.photoIds.length > MAX_GALLERY_ITEMS
  )
    throw new AdminAuggieError(
      `List between 1 and ${MAX_GALLERY_ITEMS} exact photo ids in the wanted order.`,
    );
  const photoIds = args.photoIds.map((value) =>
    parseGalleryItemId(value, "photo id"),
  );
  const snapshot = await readGallery(ctx, galleryId);
  const album = requireAlbum(snapshot, albumId);
  const next = albumWithPhotoOrder(album, photoIds, new Date().toISOString());
  if (!next)
    throw new AdminAuggieError(
      "List every photo of that album exactly once, in the wanted order.",
      409,
      "ADMIN_AUGGIE_TARGET_STATE",
    );
  const draftWarning = galleryDraftWarning(
    "saves this photo order",
    "บันทึกลำดับรูปภาพนี้",
  );
  return insertContentOperation(ctx, {
    toolName: "gallery_photo_order",
    affectedLabel: "photo",
    args: {
      kind: "gallery_photo_order",
      action: "gallery_photos_reordered",
      targets: [],
      route: "admin/galleries",
      requiresSecondaryConfirmation: false,
      requiredPath: galleryPath(galleryId),
      expectedState: await sha256Hex(
        galleryDraftState(snapshot, snapshot.albums),
      ),
      affectedCount: photoIds.length,
      galleryId,
      albumId,
      photoIds,
    },
    primaryPhrase: `REORDER ${plural(photoIds.length, "PHOTO")}`,
    records: next.photos.map((photo, index) => ({
      ...photoRecord(photo),
      before: `position ${album.photos.findIndex((entry) => entry.id === photo.id) + 1}`,
      after: `position ${index + 1}`,
    })),
    heading: "Photo order proposal",
    headingTh: "ข้อเสนอจัดลำดับรูปภาพ",
    ...draftWarning,
    extraPreview: { galleryId, albumId },
  });
}

async function proposeGalleryPublish(
  ctx: AdminAuggieContext,
  args: Record<string, unknown>,
) {
  if (!exactKeys(args, ["galleryId"]))
    throw new AdminAuggieError(
      "The gallery publish contains unsupported fields.",
    );
  // Publishing pushes the whole saved draft live, so permission for every
  // gallery is required even when one gallery is named.
  for (const id of GALLERY_IDS) requirePathPermission(ctx, galleryPath(id));
  const galleryId =
    args.galleryId === undefined ? undefined : parseGalleryId(ctx, args.galleryId);
  const snapshot = await readGallery(ctx);
  if (!snapshot.draftUpdatedAt)
    throw new AdminAuggieError(
      "Save a gallery draft in the reviewed gallery page before publishing.",
      409,
      "ADMIN_AUGGIE_TARGET_STATE",
    );
  const changed = GALLERY_IDS.filter(
    (id) =>
      albumsState(snapshot.draftAlbums[id]) !==
      albumsState(snapshot.publishedAlbums[id]),
  );
  if (!changed.length)
    throw new AdminAuggieError(
      "The gallery draft already matches the live website.",
      409,
      "ADMIN_AUGGIE_TARGET_STATE",
    );
  return insertContentOperation(ctx, {
    toolName: "gallery_publish",
    affectedLabel: "gallery",
    args: {
      kind: "gallery_publish",
      action: "galleries_published",
      targets: [],
      route: "admin/galleries",
      requiresSecondaryConfirmation: true,
      requiredPath: galleryPath(galleryId || changed[0]),
      expectedState: await sha256Hex(
        `${snapshot.draftUpdatedAt || ""}|${GALLERY_IDS.map((id) =>
          albumsState(snapshot.draftAlbums[id]),
        ).join("|")}`,
      ),
      affectedCount: changed.length,
      galleryId,
    },
    primaryPhrase: "PUBLISH GALLERIES TO THE WEBSITE",
    secondaryPhrase: "CONFIRM PUBLIC WEBSITE CHANGE",
    records: GALLERY_IDS.map((id) => ({
      studentId: id,
      name: `${snapshot.draftAlbums[id].length} album(s)`,
      dojo: "Gallery",
      rank: "",
      status: changed.includes(id) ? "will change" : "unchanged",
      before: `${snapshot.publishedAlbums[id].length} album(s) live`,
      after: `${snapshot.draftAlbums[id].length} album(s) live`,
    })),
    heading: "Gallery publish proposal",
    headingTh: "ข้อเสนอเผยแพร่แกลเลอรี",
    warningEn:
      "Nothing is public yet. Confirming puts the whole saved gallery draft on the public website, including any change another administrator saved into that draft. Open the reviewed gallery page and look at the draft yourself before confirming.",
    warningTh:
      "ยังไม่มีสิ่งใดขึ้นสู่สาธารณะ เมื่อยืนยันจะนำฉบับร่างแกลเลอรีทั้งหมดขึ้นเว็บไซต์สาธารณะ รวมถึงการแก้ไขที่ผู้ดูแลคนอื่นบันทึกไว้ในฉบับร่างนั้น โปรดเปิดหน้าแกลเลอรีที่มีการตรวจสอบและดูฉบับร่างด้วยตนเองก่อนยืนยัน",
    extraPreview: { changedGalleries: changed, publishesWholeDraft: true },
  });
}

async function listSitePages(
  ctx: AdminAuggieContext,
  args: Record<string, unknown>,
) {
  requirePathPermission(ctx, WEBSITE_PATH);
  if (!exactKeys(args, ["limit"]))
    throw new AdminAuggieError("The page list contains unsupported fields.");
  const limit = args.limit === undefined ? 20 : Number(args.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 20)
    throw new AdminAuggieError("Choose a limit from 1-20.");
  const snapshot = await readSiteContent(ctx);
  const records = snapshot.pages.slice(0, limit).map(sitePageRecord);
  await auditAi(ctx, "admin_ai_website_read", "list_site_pages", "success", {
    resultCount: records.length,
  });
  return contentList(
    ctx,
    "Website pages",
    "หน้าเว็บไซต์",
    records,
    WEBSITE_PATH,
  );
}

async function proposeSitePageVisibility(
  ctx: AdminAuggieContext,
  args: Record<string, unknown>,
) {
  requirePathPermission(ctx, WEBSITE_PATH);
  if (!exactKeys(args, ["route", "status"]))
    throw new AdminAuggieError("The page proposal contains unsupported fields.");
  const route = cleanText(args.route, 200);
  const status = cleanText(args.status, 20);
  if (!SITE_ROUTE.test(route))
    throw new AdminAuggieError(
      "Use the exact page web address shown in the website editor.",
    );
  if (status !== "draft" && status !== "published")
    throw new AdminAuggieError("Choose draft or published.");
  const snapshot = await readSiteContent(ctx);
  const page = snapshot.pages.find((entry) => entry.route === route);
  if (!page)
    throw new AdminAuggieError(
      `No website page uses the web address ${route}.`,
      409,
      "ADMIN_AUGGIE_TARGET_MISSING",
    );
  if (page.status === status)
    throw new AdminAuggieError(
      `${route} is already ${status}.`,
      409,
      "ADMIN_AUGGIE_TARGET_STATE",
    );
  return insertContentOperation(ctx, {
    toolName: `site_page_${status}`,
    affectedLabel: "website page",
    args: {
      kind: "site_page_visibility",
      action: `site_page_${status}`,
      targets: [],
      route: "admin/site-content",
      requiresSecondaryConfirmation: false,
      requiredPath: WEBSITE_PATH,
      expectedState: await sha256Hex(siteDraftState(snapshot)),
      affectedCount: 1,
      pageRoute: route,
      pageStatus: status,
    },
    primaryPhrase: `SET 1 WEBSITE PAGE ${status.toLocaleUpperCase("en-US")}`,
    records: [
      { ...sitePageRecord(page), before: page.status, after: status },
    ],
    heading: "Website page proposal",
    headingTh: "ข้อเสนอหน้าเว็บไซต์",
    warningEn:
      "No change has been made. Confirming saves this into the website draft only. The public website does not change until the website draft is published separately.",
    warningTh:
      "ยังไม่มีการเปลี่ยนแปลง เมื่อยืนยันจะบันทึกเฉพาะในฉบับร่างของเว็บไซต์ เว็บไซต์สาธารณะจะยังไม่เปลี่ยนจนกว่าจะเผยแพร่ฉบับร่างแยกต่างหาก",
    extraPreview: { route, status },
  });
}

async function proposeSitePublish(
  ctx: AdminAuggieContext,
  args: Record<string, unknown>,
) {
  requirePathPermission(ctx, WEBSITE_PATH);
  if (Object.keys(args).length)
    throw new AdminAuggieError("The website publish takes no arguments.");
  const snapshot = await readSiteContent(ctx);
  if (!snapshot.draftUpdatedAt)
    throw new AdminAuggieError(
      "Save a website draft in the reviewed website editor before publishing.",
      409,
      "ADMIN_AUGGIE_TARGET_STATE",
    );
  const publishedPages = snapshot.pages.filter(
    (page) => page.status === "published",
  );
  return insertContentOperation(ctx, {
    toolName: "site_publish",
    affectedLabel: "website page",
    args: {
      kind: "site_publish",
      action: "site_content_published",
      targets: [],
      route: "admin/site-content",
      requiresSecondaryConfirmation: true,
      requiredPath: WEBSITE_PATH,
      expectedState: await sha256Hex(siteDraftState(snapshot)),
      affectedCount: snapshot.pages.length,
    },
    primaryPhrase: "PUBLISH WEBSITE CONTENT",
    secondaryPhrase: "CONFIRM PUBLIC WEBSITE CHANGE",
    records: snapshot.pages.map(sitePageRecord),
    heading: "Website publish proposal",
    headingTh: "ข้อเสนอเผยแพร่เว็บไซต์",
    warningEn: `Nothing is public yet. Confirming puts the whole saved website draft on the public website, including any change another administrator saved into that draft. ${publishedPages.length} page(s) will be live. Open the reviewed website editor and read the draft yourself before confirming.`,
    warningTh: `ยังไม่มีสิ่งใดขึ้นสู่สาธารณะ เมื่อยืนยันจะนำฉบับร่างเว็บไซต์ทั้งหมดขึ้นเว็บไซต์สาธารณะ รวมถึงการแก้ไขที่ผู้ดูแลคนอื่นบันทึกไว้ในฉบับร่างนั้น จะมี ${publishedPages.length} หน้าเผยแพร่ โปรดเปิดหน้าแก้ไขเว็บไซต์ที่มีการตรวจสอบและอ่านฉบับร่างด้วยตนเองก่อนยืนยัน`,
    extraPreview: {
      publishedPageCount: publishedPages.length,
      publishesWholeDraft: true,
    },
  });
}

async function listDojos(ctx: AdminAuggieContext, args: Record<string, unknown>) {
  requirePathPermission(ctx, DOJO_SETTINGS_PATH);
  if (Object.keys(args).length)
    throw new AdminAuggieError("The dojo list takes no arguments.");
  const dojos = (await readDojos(ctx)).filter((dojo) =>
    canAccessDojo(ctx.session, dojo.id),
  );
  await auditAi(ctx, "admin_ai_dojo_read", "list_dojos", "success", {
    resultCount: dojos.length,
  });
  return contentList(
    ctx,
    "Dojo settings",
    "การตั้งค่าโดโจ",
    dojos.map(dojoRecord),
    DOJO_SETTINGS_PATH,
  );
}

async function proposeDojoSettings(
  ctx: AdminAuggieContext,
  args: Record<string, unknown>,
) {
  requirePathPermission(ctx, DOJO_SETTINGS_PATH);
  if (
    !exactKeys(args, [
      "dojoId",
      "officialName",
      "shortName",
      "active",
      "sortOrder",
    ])
  )
    throw new AdminAuggieError("The dojo proposal contains unsupported fields.");
  const dojoId = cleanText(args.dojoId, 80).toLocaleLowerCase("en-US");
  if (!DOJO_ID.test(dojoId))
    throw new AdminAuggieError(
      "Use the exact dojo id shown in the dojo settings page.",
    );
  if (!canAccessDojo(ctx.session, dojoId))
    throw new AdminAuggieError(
      "That dojo is outside your current scope.",
      403,
      "ADMIN_AUGGIE_CROSS_DOJO",
    );
  const officialName =
    args.officialName === undefined ? undefined : cleanText(args.officialName, 160);
  const shortName =
    args.shortName === undefined ? undefined : cleanText(args.shortName, 100);
  const active = args.active === undefined ? undefined : args.active;
  const sortOrder =
    args.sortOrder === undefined ? undefined : Number(args.sortOrder);
  if (officialName !== undefined && !officialName)
    throw new AdminAuggieError("The official dojo name cannot be empty.");
  if (shortName !== undefined && !shortName)
    throw new AdminAuggieError("The short dojo name cannot be empty.");
  if (active !== undefined && typeof active !== "boolean")
    throw new AdminAuggieError("Choose whether the dojo is active.");
  if (
    sortOrder !== undefined &&
    (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 10_000)
  )
    throw new AdminAuggieError("The display order must be a whole number 0-10,000.");
  const dojo = (await readDojos(ctx)).find((entry) => entry.id === dojoId);
  if (!dojo)
    throw new AdminAuggieError(
      `No dojo uses the id ${dojoId}.`,
      409,
      "ADMIN_AUGGIE_TARGET_MISSING",
    );
  const changes: string[] = [];
  if (officialName !== undefined && officialName !== dojo.official_name)
    changes.push("official name");
  if (shortName !== undefined && shortName !== dojo.short_name)
    changes.push("short name");
  if (active !== undefined && active !== (Number(dojo.active) === 1))
    changes.push("active state");
  if (sortOrder !== undefined && sortOrder !== Number(dojo.sort_order))
    changes.push("display order");
  if (!changes.length)
    throw new AdminAuggieError(
      "That dojo already has those settings.",
      409,
      "ADMIN_AUGGIE_TARGET_STATE",
    );
  return insertContentOperation(ctx, {
    toolName: "dojo_settings_update",
    affectedLabel: "dojo",
    args: {
      kind: "dojo_settings",
      action: "dojo_updated",
      targets: [],
      route: "admin/dojos",
      requiresSecondaryConfirmation: false,
      requiredPath: DOJO_SETTINGS_PATH,
      expectedState: await sha256Hex(dojoState(dojo)),
      affectedCount: 1,
      dojoId,
      officialName,
      shortName,
      dojoActive: active as boolean | undefined,
      sortOrder,
    },
    primaryPhrase: "UPDATE 1 DOJO",
    records: [
      {
        ...dojoRecord(dojo),
        before: `${dojo.official_name} · ${Number(dojo.active) === 1 ? "active" : "inactive"}`,
        after: `${officialName ?? dojo.official_name} · ${
          (active ?? Number(dojo.active) === 1) ? "active" : "inactive"
        }`,
      },
    ],
    heading: "Dojo settings proposal",
    headingTh: "ข้อเสนอตั้งค่าโดโจ",
    warningEn:
      "No change has been made. Confirming saves the dojo name, active state, or display order straight away, and the public dojo pages follow it. The dojo code, web address, logo, and contact details are not touched.",
    warningTh:
      "ยังไม่มีการเปลี่ยนแปลง เมื่อยืนยันจะบันทึกชื่อโดโจ สถานะการใช้งาน หรือลำดับการแสดงผลทันที และหน้าโดโจสาธารณะจะเปลี่ยนตาม รหัสโดโจ ที่อยู่เว็บ โลโก้ และข้อมูลติดต่อจะไม่ถูกแก้ไข",
    extraPreview: { dojoId, changedFields: changes },
  });
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

// A deliberately small, deterministic conversation reply. It is chosen for a
// greeting, a thank you, small talk or an unclear request, and is also the
// safe landing place when the model returns nothing usable. The wording is
// fixed here in English and Thai: no opinion, no invented fact, no personal
// detail and no long essay. It always steers back to administration work, and
// it is recorded in the audit log as an ordinary conversation, never a
// failure.
async function converse(ctx: AdminAuggieContext) {
  await auditAi(ctx, "admin_ai_conversation", "converse", "success").catch(
    () => undefined,
  );
  return {
    kind: "conversation" as const,
    heading: localized(ctx.locale, "Here to help", "ยินดีช่วยเหลือ"),
    message: localized(
      ctx.locale,
      "Hello. I help with dojo administration. You could ask me to find a student, show the dashboard counts, add training hours, or start a new student profile. Nothing is changed until you confirm it yourself. What would you like to do?",
      "สวัสดี ยินดีช่วยงานผู้ดูแลโดโจ เช่น ค้นหานักเรียน ดูสรุปแดชบอร์ด เพิ่มชั่วโมงฝึก หรือเริ่มสร้างประวัตินักเรียนใหม่ จะยังไม่มีการเปลี่ยนแปลงใดจนกว่าคุณจะยืนยันด้วยตนเอง ต้องการให้ช่วยเรื่องใด",
    ),
  };
}

// --- Approved outside lookups ----------------------------------------------
// The model never browses. It can only ask the site to look a fact up, and the
// site performs the request itself against a short, named allowlist. Only the
// place or term the administrator typed ever leaves the site: nothing from the
// dojo database is ever sent to an outside service. Every lookup is read-only —
// it prepares no operation and can never change a dojo record — and each result
// is cached briefly so a repeated question does not go out twice.

const LOOKUP_TIMEOUT_MS = 7_000;
const WEATHER_CACHE_TTL_MS = 10 * 60 * 1_000;
// The one approved topic today. A message routed here for anything else is
// declined plainly rather than answered with a guess.
const WEATHER_INTENT =
  /weather|forecast|temperature|rain|climate|humid|wind|sun|snow|hot|cold|degree|อากาศ|พยากรณ|อุณหภูม|ฝน|ลม|ร้อน|หนาว/i;

type LookupAnswer = { heading: string; message: string };

const weatherCache = new Map<string, { at: number; value: LookupAnswer }>();

function sanitizePlaceName(raw: string) {
  return raw
    .normalize("NFKC")
    .replace(/[^\p{L}\p{M}0-9 ,.'-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("lookup-timeout"), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    return (await response.json()) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function weatherWords(code: number, locale: AdminAuggieLocale) {
  const table: Array<[number[], string, string]> = [
    [[0], "clear sky", "ท้องฟ้าแจ่มใส"],
    [[1, 2], "partly cloudy", "มีเมฆบางส่วน"],
    [[3], "overcast", "เมฆมาก"],
    [[45, 48], "fog", "หมอก"],
    [[51, 53, 55, 56, 57], "drizzle", "ฝนปรอย"],
    [[61, 63, 65, 66, 67, 80, 81, 82], "rain", "ฝนตก"],
    [[71, 73, 75, 77, 85, 86], "snow", "หิมะ"],
    [[95, 96, 99], "thunderstorm", "พายุฝนฟ้าคะนอง"],
  ];
  for (const [codes, en, th] of table)
    if (codes.includes(code)) return localized(locale, en, th);
  return localized(locale, "changeable weather", "อากาศแปรปรวน");
}

async function weatherFor(
  ctx: AdminAuggieContext,
  place: string,
): Promise<LookupAnswer> {
  const key = `${ctx.locale}|${place.toLocaleLowerCase("en-US")}`;
  const cached = weatherCache.get(key);
  if (cached && Date.now() - cached.at < WEATHER_CACHE_TTL_MS)
    return cached.value;

  const notFound: LookupAnswer = {
    heading: localized(ctx.locale, "Place not found", "ไม่พบสถานที่"),
    message: localized(
      ctx.locale,
      `I could not find a place called "${place}". Please check the spelling and try again.`,
      `ไม่พบสถานที่ชื่อ "${place}" โปรดตรวจสอบการสะกดแล้วลองอีกครั้ง`,
    ),
  };
  const unavailable: LookupAnswer = {
    heading: localized(ctx.locale, "Weather unavailable", "ดูสภาพอากาศไม่ได้"),
    message: localized(
      ctx.locale,
      "The weather service did not answer in time. Please try again in a moment. Nothing about the dojo was sent anywhere.",
      "บริการสภาพอากาศไม่ตอบกลับในเวลาที่กำหนด โปรดลองอีกครั้งในอีกสักครู่ ไม่มีการส่งข้อมูลของโดโจออกไปที่ใด",
    ),
  };

  const geo = objectValue(
    await fetchJsonWithTimeout(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=${ctx.locale}&format=json`,
      LOOKUP_TIMEOUT_MS,
    ),
  );
  const results = geo && Array.isArray(geo.results) ? geo.results : [];
  const first = objectValue(results[0]);
  const lat = typeof first?.latitude === "number" ? first.latitude : null;
  const lon = typeof first?.longitude === "number" ? first.longitude : null;
  if (!first || lat === null || lon === null) return notFound;

  const name = cleanText(first.name, 80) || place;
  const country = cleanText(first.country, 80);
  const forecast = objectValue(
    await fetchJsonWithTimeout(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m`,
      LOOKUP_TIMEOUT_MS,
    ),
  );
  const current = objectValue(forecast?.current);
  const temp = Number(current?.temperature_2m);
  if (!current || !Number.isFinite(temp)) return unavailable;
  const hum = Number(current.relative_humidity_2m);
  const wind = Number(current.wind_speed_10m);
  const code = Number(current.weather_code);
  const desc = weatherWords(Number.isFinite(code) ? code : -1, ctx.locale);
  const where = country ? `${name}, ${country}` : name;
  const humEn = Number.isFinite(hum) ? `, humidity ${Math.round(hum)}%` : "";
  const humTh = Number.isFinite(hum) ? ` ความชื้น ${Math.round(hum)}%` : "";
  const windEn = Number.isFinite(wind) ? `, wind ${Math.round(wind)} km/h` : "";
  const windTh = Number.isFinite(wind) ? ` ลม ${Math.round(wind)} กม./ชม.` : "";
  const value: LookupAnswer = {
    heading: localized(ctx.locale, `Weather in ${name}`, `สภาพอากาศใน ${name}`),
    message: localized(
      ctx.locale,
      `Right now in ${where}: ${desc}, about ${Math.round(temp)}°C${humEn}${windEn}. Source: open-meteo.com. Nothing about the dojo was sent.`,
      `ขณะนี้ที่ ${where}: ${desc} อุณหภูมิประมาณ ${Math.round(temp)}°C${humTh}${windTh} ที่มา open-meteo.com ไม่มีการส่งข้อมูลของโดโจออกไป`,
    ),
  };
  weatherCache.set(key, { at: Date.now(), value });
  return value;
}

// A lookup only ever asks an approved outside source for a plain fact. It reads
// nothing from the dojo, prepares no operation, and writes no dojo record. The
// interaction is recorded in the audit log exactly like every other read.
async function lookUpInformation(
  ctx: AdminAuggieContext,
  args: Record<string, unknown>,
) {
  const topic = cleanText(args.topic, 40).toLocaleLowerCase("en-US");
  const place = sanitizePlaceName(
    typeof args.place === "string" ? args.place : "",
  );

  if (!WEATHER_INTENT.test(topic)) {
    await auditAi(ctx, "admin_ai_lookup", "look_up_information", "success", {
      source: "unsupported",
    }).catch(() => undefined);
    return {
      kind: "conversation" as const,
      heading: localized(ctx.locale, "Not connected to that", "ยังไม่รองรับ"),
      message: localized(
        ctx.locale,
        "I can only look up the current weather for a place right now. I am not connected to the wider internet for anything else, so I will not guess. Nothing about the dojo was sent anywhere.",
        "ขณะนี้ค้นหาได้เฉพาะสภาพอากาศปัจจุบันของสถานที่เท่านั้น ยังไม่ได้เชื่อมต่ออินเทอร์เน็ตสำหรับเรื่องอื่น จึงจะไม่คาดเดา ไม่มีการส่งข้อมูลของโดโจออกไปที่ใด",
      ),
    };
  }

  if (!place) {
    return {
      kind: "conversation" as const,
      heading: localized(ctx.locale, "Which place?", "สถานที่ใด"),
      message: localized(
        ctx.locale,
        "Which place should I check the current weather for?",
        "ต้องการให้ตรวจสอบสภาพอากาศปัจจุบันของสถานที่ใด",
      ),
    };
  }

  const answer = await weatherFor(ctx, place);
  await auditAi(ctx, "admin_ai_lookup", "look_up_information", "success", {
    source: "weather",
    // Only the place the administrator typed is recorded, never any dojo data.
    place,
  }).catch(() => undefined);
  return {
    kind: "conversation" as const,
    heading: answer.heading,
    message: answer.message,
  };
}

async function executeSelectedTool(ctx: AdminAuggieContext, call: ToolCall) {
  if (call.name === "converse") return converse(ctx);
  const args = objectValue(call.arguments);
  if (!args)
    throw new AdminAuggieError(
      "Tool arguments are invalid.",
      502,
      "ADMIN_AUGGIE_MALFORMED_TOOL",
    );
  if (call.name === "navigate_admin") return navigate(ctx, args);
  if (call.name === "look_up_information") return lookUpInformation(ctx, args);
  if (call.name === "get_dashboard_summary") {
    if (Object.keys(args).length)
      throw new AdminAuggieError("Dashboard summary takes no arguments.");
    return dashboardSummary(ctx);
  }
  if (call.name === "search_students") return searchStudents(ctx, args);
  if (call.name === "propose_student_status")
    return proposeStudentStatus(ctx, args);
  if (call.name === "propose_bulk_student_action")
    return proposeBulkStudentAction(ctx, args);
  if (call.name === "propose_student_record_update")
    return proposeStudentRecordUpdate(ctx, args);
  if (call.name === "propose_student_hours")
    return proposeStudentHours(ctx, args);
  if (call.name === "propose_student_examination")
    return proposeStudentExamination(ctx, args);
  if (call.name === "propose_student_create")
    return proposeStudentCreate(ctx, args);
  if (call.name === "propose_newsletter_create")
    return proposeNewsletterCreate(ctx, args);
  if (call.name === "propose_student_profile_decision")
    return proposeStudentProfileDecision(ctx, args);
  if (call.name === "get_examination_summary") {
    if (Object.keys(args).length)
      throw new AdminAuggieError("Examination summary takes no arguments.");
    return examinationSummary(ctx);
  }
  if (call.name === "list_examination_applications")
    return listExaminationApplications(ctx, args);
  if (call.name === "propose_examination_status")
    return proposeExaminationStatus(ctx, args);
  if (call.name === "propose_examination_rejection")
    return proposeExaminationRejection(ctx, args);
  if (call.name === "get_contribution_summary")
    return contributionSummary(ctx, args);
  if (call.name === "propose_contribution_status")
    return proposeContributionStatus(ctx, args);
  if (call.name === "list_payment_proofs") return listPaymentProofs(ctx, args);
  if (call.name === "propose_payment_proof_decision")
    return proposePaymentProofDecision(ctx, args);
  if (call.name === "list_newsletters") return listNewsletters(ctx, args);
  if (call.name === "propose_newsletter_website_state")
    return proposeNewsletterWebsiteState(ctx, args);
  if (call.name === "propose_newsletter_lifecycle")
    return proposeNewsletterLifecycle(ctx, args);
  if (call.name === "propose_newsletter_send")
    return proposeNewsletterSend(ctx, args);
  if (call.name === "propose_newsletter_delete")
    return proposeNewsletterDelete(ctx, args);
  if (call.name === "list_gallery_albums") return listGalleryAlbums(ctx, args);
  if (call.name === "propose_gallery_album_update")
    return proposeGalleryAlbumUpdate(ctx, args);
  if (call.name === "propose_gallery_album_order")
    return proposeGalleryAlbumOrder(ctx, args);
  if (call.name === "propose_gallery_photo_captions")
    return proposeGalleryPhotoCaptions(ctx, args);
  if (call.name === "propose_gallery_photo_order")
    return proposeGalleryPhotoOrder(ctx, args);
  if (call.name === "propose_gallery_publish")
    return proposeGalleryPublish(ctx, args);
  if (call.name === "list_site_pages") return listSitePages(ctx, args);
  if (call.name === "propose_site_page_visibility")
    return proposeSitePageVisibility(ctx, args);
  if (call.name === "propose_site_publish") return proposeSitePublish(ctx, args);
  if (call.name === "list_dojos") return listDojos(ctx, args);
  if (call.name === "propose_dojo_settings")
    return proposeDojoSettings(ctx, args);
  throw new AdminAuggieError(
    localized(
      ctx.locale,
      "Sorry, I could not work out what you needed. Nothing was changed.",
      "ขออภัย ไม่สามารถเข้าใจสิ่งที่คุณต้องการได้ ไม่มีการเปลี่ยนแปลงใด ๆ",
    ),
    502,
    "ADMIN_AUGGIE_UNKNOWN_TOOL",
  );
}

// --- Guided conversations ---------------------------------------------------
// From here down, nothing calls the model. Once a guided conversation has been
// started, every question, acknowledgement, correction and summary is the
// wording in adminAuggieFlows.ts, and the administrator's answers are checked
// and kept by this server only. The conversation always ends by preparing an
// ordinary proposal, so the existing permission checks, dojo limits, re-reads
// and exact typed confirmation still decide whether anything is written.

const FLOW_PATHS: Record<FlowId, string> = {
  create_student: STUDENT_PATH,
  add_training_hours: STUDENT_PATH,
  record_exam_result: STUDENT_PATH,
  create_newsletter: WEBSITE_PATH,
};

async function flowOwner(ctx: AdminAuggieContext): Promise<FlowSessionOwner> {
  return {
    accountId: ctx.session.accountId,
    sessionHash: await sessionHash(ctx.env, ctx.session),
    selectedDojoId: ctx.session.selectedDojoId!,
    permission: ctx.permission,
  };
}

async function flowRuntimeFor(
  ctx: AdminAuggieContext,
  flowId: FlowId,
): Promise<FlowRuntime> {
  if (flowId !== "create_student") return { dojos: [] };
  return { dojos: await permittedDojos(ctx) };
}

function flowGuidedResponse(
  ctx: AdminAuggieContext,
  state: FlowState,
  runtime: FlowRuntime,
  lead: string,
) {
  const flow = flowDefinition(state.flowId);
  const fields = activeFields(flow, runtime);
  const field = currentField(flow, runtime, state);
  const answered = fields.filter((entry) => entry.key in state.answers).length;
  const step = Math.min(answered + 1, fields.length);
  const choices =
    field?.autoResolve === "dojo"
      ? runtime.dojos.map((dojo) => dojo.name)
      : field?.choices
        ? [...field.choices]
        : [];
  return {
    kind: "flow" as const,
    heading: flowText(ctx.locale, flow.title),
    message: lead,
    flow: {
      id: state.flowId,
      title: flowText(ctx.locale, flow.title),
      question: field ? flowText(ctx.locale, field.ask) : "",
      hint: field?.hint ? flowText(ctx.locale, field.hint) : "",
      optional: Boolean(field?.optional),
      optionalNote: field?.optional
        ? flowText(ctx.locale, FLOW_WORDING.optional)
        : "",
      choices,
      step,
      total: fields.length,
      progressLabel: flowText(ctx.locale, FLOW_WORDING.progress(step, fields.length)),
      guide: flowText(ctx.locale, FLOW_WORDING.guide),
      answers: flowSummaryRows(flow, runtime, state, ctx.locale).filter(
        (row, index) => index < answered,
      ),
      canGoBack: state.order.length > 0,
      startedAt: state.startedAt,
    },
  };
}

// The collected answers become the arguments of an ordinary propose tool. Only
// keys the administrator actually answered are passed, so the existing strict
// field checks in each propose function still apply.
// Some answers can only be judged against the records themselves: whether a
// Student ID really exists in this administrator's scope, whether an attempted
// rank is above the rank the student holds now, whether a web address is free.
// Those are checked as the answer is given, so the administrator is told at
// once rather than at the very end.
async function guidedRecordCheck(
  ctx: AdminAuggieContext,
  state: FlowState,
  key: string,
): Promise<FlowText | null> {
  const answers = state.answers;
  const missingStudent: FlowText = {
    en: "I could not find that Student ID in your dojo, or the record is not an active, approved student. Please check it and tell me again.",
    th: "ไม่พบรหัสนักเรียนนี้ในโดโจของคุณ หรือระเบียนไม่ได้เป็นนักเรียนที่ใช้งานอยู่และผ่านการอนุมัติ โปรดตรวจสอบแล้วแจ้งอีกครั้ง",
  };
  if (
    key === "studentId" &&
    (state.flowId === "add_training_hours" ||
      state.flowId === "record_exam_result")
  ) {
    try {
      await requireEditableStudent(ctx, answers.studentId);
      return null;
    } catch {
      return missingStudent;
    }
  }
  if (key === "attemptedRank" && state.flowId === "record_exam_result") {
    let target;
    try {
      target = await requireEditableStudent(ctx, answers.studentId);
    } catch {
      return missingStudent;
    }
    if (rankIndex(answers.attemptedRank) <= rankIndex(target.currentRank))
      return {
        en: `${target.publicId} is already at ${target.currentRank}, so the rank attempted has to be above that one. Which rank did the student go for?`,
        th: `${target.publicId} อยู่ที่ระดับ ${target.currentRank} แล้ว ระดับที่สอบจึงต้องสูงกว่านั้น นักเรียนสอบเพื่อเลื่อนไประดับใด`,
      };
    return null;
  }
  if (key === "webAddress" && state.flowId === "create_newsletter") {
    // When the administrator skips the web address the server makes one from
    // the title, so that one is checked here too rather than failing later.
    const slug =
      answers.webAddress || slugFromTitle(answers.title || "", answers.date || "");
    if (!slug) return null;
    const events = await readNewsletters(ctx);
    if (
      events.some(
        (event) => event.slug === slug || event.slugHistory?.includes(slug),
      )
    )
      return {
        en: `Another newsletter already uses the web address ${slug}. Please choose a different one.`,
        th: `มีจดหมายข่าวอื่นใช้ที่อยู่เว็บ ${slug} อยู่แล้ว โปรดเลือกที่อยู่อื่น`,
      };
    return null;
  }
  return null;
}

// Runs the record checks for every answer the administrator just gave, in the
// order they gave them, and stops at the first one the records reject.
async function firstRejectedAnswer(
  ctx: AdminAuggieContext,
  before: FlowState,
  after: FlowState,
) {
  for (const key of after.order.slice(before.order.length)) {
    const upTo = rewindTo(after, key);
    const problem = await guidedRecordCheck(
      ctx,
      { ...upTo, answers: { ...upTo.answers, [key]: after.answers[key] } },
      key,
    );
    if (problem) return { key, problem };
  }
  return null;
}

async function completeGuidedFlow(
  ctx: AdminAuggieContext,
  state: FlowState,
  runtime: FlowRuntime,
) {
  const flow = flowDefinition(state.flowId);
  const answers = resolvedAnswers(flow, runtime, state);
  const optional = (key: string) =>
    answers[key] ? { [key]: answers[key] } : {};
  if (state.flowId === "create_student")
    return proposeStudentCreate(ctx, {
      englishName: answers.englishName,
      ...optional("thaiName"),
      currentRank: answers.currentRank,
      ...optional("dojoId"),
      ...optional("dojoJoinedDate"),
      ...(answers.currentTrainingHours
        ? { currentTrainingHours: Number(answers.currentTrainingHours) }
        : {}),
    });
  if (state.flowId === "add_training_hours")
    return proposeStudentHours(ctx, {
      studentId: answers.studentId,
      hours: Number(answers.hours),
      ...optional("location"),
    });
  if (state.flowId === "record_exam_result")
    return proposeStudentExamination(ctx, {
      studentId: answers.studentId,
      attemptedRank: answers.attemptedRank,
      passed: answers.passed === "yes",
      location: answers.location,
      examinationDate: answers.examinationDate,
    });
  return proposeNewsletterCreate(ctx, {
    title: answers.title,
    summary: answers.summary,
    body: answers.body,
    category: answers.category,
    date: answers.date,
    ...optional("webAddress"),
  });
}

async function finishGuidedFlow(
  ctx: AdminAuggieContext,
  state: FlowState,
  runtime: FlowRuntime,
  owner: FlowSessionOwner,
) {
  const proposal = await completeGuidedFlow(ctx, state, runtime);
  // The answers are dropped as soon as the proposal exists. From here the
  // operation row carries the change, under the ordinary expiry and scrubbing.
  await clearFlowSession(ctx.db, owner);
  const flow = flowDefinition(state.flowId);
  const phrase = proposal.operation.confirmationPhrase || "";
  return {
    ...proposal,
    heading: flowText(ctx.locale, FLOW_WORDING.summaryHeading),
    message: flowText(ctx.locale, FLOW_WORDING.summaryLead(phrase)),
    summary: flowSummaryRows(flow, runtime, state, ctx.locale),
  };
}

async function startGuidedFlow(
  ctx: AdminAuggieContext,
  flowId: FlowId,
  owner: FlowSessionOwner,
) {
  requirePathPermission(ctx, FLOW_PATHS[flowId]);
  const runtime = await flowRuntimeFor(ctx, flowId);
  const flow = flowDefinition(flowId);
  const state: FlowState = {
    flowId,
    answers: {},
    order: [],
    startedAt: new Date().toISOString(),
  };
  await writeFlowSession(ctx.db, owner, state);
  await auditAi(ctx, "admin_ai_guided_flow_started", "start_guided_flow", "success", {
    flowId,
    questionCount: flowQuestionCount(flow, runtime),
  });
  const lead = `${flowText(ctx.locale, flow.opening)} ${flowText(
    ctx.locale,
    FLOW_WORDING.opening(flowQuestionCount(flow, runtime)),
  )}`;
  return flowGuidedResponse(ctx, state, runtime, lead);
}

async function continueGuidedFlow(
  ctx: AdminAuggieContext,
  state: FlowState,
  message: string,
  owner: FlowSessionOwner,
) {
  // A guided conversation may only continue inside the access it was started
  // in. A permission or dojo change ends it rather than carrying answers over.
  requirePathPermission(ctx, FLOW_PATHS[state.flowId]);
  const runtime = await flowRuntimeFor(ctx, state.flowId);
  const flow = flowDefinition(state.flowId);
  const command = flowCommand(message);

  if (command === "cancel") {
    await clearFlowSession(ctx.db, owner);
    await auditAi(ctx, "admin_ai_guided_flow_cancelled", "guided_flow", "success", {
      flowId: state.flowId,
      answeredCount: state.order.length,
    });
    return {
      kind: "result" as const,
      heading: flowText(ctx.locale, FLOW_WORDING.cancelHeading),
      message: flowText(ctx.locale, FLOW_WORDING.cancelled),
    };
  }

  if (command === "back") {
    const previous = stepBack(state);
    if (!previous)
      return flowGuidedResponse(
        ctx,
        state,
        runtime,
        flowText(ctx.locale, FLOW_WORDING.backAtStart),
      );
    await writeFlowSession(ctx.db, owner, previous);
    return flowGuidedResponse(
      ctx,
      previous,
      runtime,
      flowText(ctx.locale, FLOW_WORDING.backDone),
    );
  }

  // Every question is answered but the summary could not be prepared last time,
  // for example because a record moved. The next message tries again rather
  // than leaving the administrator with no way forward but cancelling.
  if (!currentField(flow, runtime, state))
    return finishGuidedFlow(ctx, state, runtime, owner);

  const applied = applyFlowMessage(flow, runtime, state, message, (value) =>
    Boolean(detectSensitiveAdminAuggieInput(value)),
  );

  if (applied.kind === "sensitive") {
    await auditAi(
      ctx,
      "admin_ai_sensitive_input_rejected",
      "guided_flow",
      "failure",
      { flowId: state.flowId, code: "ADMIN_AUGGIE_SENSITIVE_INPUT" },
    ).catch(() => undefined);
    return {
      ...flowGuidedResponse(
        ctx,
        state,
        runtime,
        flowText(ctx.locale, FLOW_WORDING.sensitive),
      ),
      path: FLOW_PATHS[state.flowId],
      manualOnly: true,
    };
  }

  if (applied.kind === "error")
    return flowGuidedResponse(
      ctx,
      state,
      runtime,
      flowText(ctx.locale, applied.error),
    );

  const rejected = await firstRejectedAnswer(ctx, state, applied.state);
  if (rejected) {
    const rewound = rewindTo(applied.state, rejected.key);
    await writeFlowSession(ctx.db, owner, rewound);
    return flowGuidedResponse(
      ctx,
      rewound,
      runtime,
      flowText(ctx.locale, rejected.problem),
    );
  }

  const next = applied.state;
  if (!currentField(flow, runtime, next))
    return finishGuidedFlow(ctx, next, runtime, owner);
  await writeFlowSession(ctx.db, owner, next);
  return flowGuidedResponse(
    ctx,
    next,
    runtime,
    flowText(ctx.locale, FLOW_WORDING.acknowledgement(next.order.length - 1)),
  );
}

// Reopening the panel or reloading the page picks the conversation back up from
// the server, so nothing the administrator already typed is lost.
export async function getAdminAuggieFlowSession(
  request: Request,
  env: AdminAuggieEnv,
  locale: AdminAuggieLocale,
  currentPath: string,
) {
  const ctx = await requireAdminAuggieContext(request, env, locale, currentPath);
  await deleteExpiredFlowSessions(ctx.db).catch(() => undefined);
  const owner = await flowOwner(ctx);
  const saved = await readFlowSession(ctx.db, owner);
  if (!saved) return { response: null };
  if (!canAccessAdminPath(FLOW_PATHS[saved.state.flowId], ctx.permission)) {
    await clearFlowSession(ctx.db, owner);
    return { response: null };
  }
  const runtime = await flowRuntimeFor(ctx, saved.state.flowId);
  return {
    response: flowGuidedResponse(
      ctx,
      saved.state,
      runtime,
      flowText(ctx.locale, FLOW_WORDING.resumed),
    ),
    expiresAt: saved.expiresAt,
  };
}

export async function resetAdminAuggieFlowSession(
  request: Request,
  env: AdminAuggieEnv,
  locale: AdminAuggieLocale,
  currentPath: string,
) {
  const ctx = await requireAdminAuggieContext(request, env, locale, currentPath);
  const owner = await flowOwner(ctx);
  const saved = await readFlowSession(ctx.db, owner);
  await clearFlowSession(ctx.db, owner);
  if (saved)
    await auditAi(ctx, "admin_ai_guided_flow_cleared", "guided_flow", "success", {
      flowId: saved.state.flowId,
      answeredCount: saved.state.order.length,
    }).catch(() => undefined);
  return {
    cleared: Boolean(saved),
    message: flowText(ctx.locale, FLOW_WORDING.startedOver),
  };
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
        "Please type your message. It can be up to 1,600 characters.",
        "โปรดพิมพ์ข้อความของคุณ ความยาวไม่เกิน 1,600 ตัวอักษร",
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
        "That is a lot of requests at once. Please wait a minute and try again.",
        "มีคำขอเข้ามาพร้อมกันจำนวนมาก โปรดรอสักหนึ่งนาทีแล้วลองอีกครั้ง",
      ),
      429,
      "ADMIN_AUGGIE_RATE_LIMIT",
    );
  // A guided conversation already in progress is answered entirely here. The
  // message is not sent to the model, so the promise that only a first request
  // ever reaches AI holds for every step of the conversation.
  const owner = await flowOwner(ctx);
  await deleteExpiredFlowSessions(ctx.db).catch(() => undefined);
  const active = await readFlowSession(ctx.db, owner);
  if (active) {
    try {
      return await continueGuidedFlow(
        ctx,
        active.state,
        cleanFlowText(input.message, MAX_MESSAGE_CHARS),
        owner,
      );
    } catch (error) {
      const known =
        error instanceof AdminAuggieError
          ? error
          : new AdminAuggieError(
              "That step could not be completed safely. Nothing was saved.",
              500,
              "ADMIN_AUGGIE_FLOW_FAILURE",
            );
      await auditAi(ctx, "admin_ai_guided_flow_failed", "guided_flow", "failure", {
        code: known.code,
        flowId: active.state.flowId,
      }).catch(() => undefined);
      throw known;
    }
  }
  if (flowCommand(message) === "cancel")
    return {
      kind: "result" as const,
      heading: flowText(locale, FLOW_WORDING.cancelHeading),
      message: flowText(locale, FLOW_WORDING.nothingToCancel),
    };

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
        "I would rather not handle private details such as identity documents, contact details, bank details, passwords, private links or personal notes. Please add those on the normal administration page. Nothing you typed was sent to AI.",
        "ขออนุญาตไม่รับข้อมูลส่วนตัว เช่น เอกสารยืนยันตัวตน ข้อมูลติดต่อ ข้อมูลธนาคาร รหัสผ่าน ลิงก์ส่วนตัว หรือหมายเหตุส่วนบุคคล โปรดกรอกข้อมูลเหล่านี้ในหน้าผู้ดูแลตามปกติ ข้อความที่คุณพิมพ์ไม่ได้ถูกส่งให้ AI",
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
            "Sorry, something went wrong. Nothing was changed.",
            502,
            "ADMIN_AUGGIE_AI_FAILURE",
          );
    await auditAi(ctx, "admin_ai_tool_rejected", "none", "failure", {
      code: known.code,
      inputCharacters: message.length,
    }).catch(() => undefined);
    throw known;
  }
  // The model may only name a guided conversation. It never supplies an answer,
  // and the flow it names is rechecked against this administrator's access.
  if (call.name === "start_guided_flow") {
    const wanted = objectValue(call.arguments)?.flow;
    if (!isFlowId(wanted))
      throw new AdminAuggieError(
        localized(
          locale,
          "I could not tell which step-by-step task you wanted. Could you say it again?",
          "ไม่สามารถระบุงานแบบทีละขั้นที่ต้องการได้ โปรดระบุอีกครั้ง",
        ),
        502,
        "ADMIN_AUGGIE_MALFORMED_TOOL",
      );
    try {
      return await startGuidedFlow(ctx, wanted, owner);
    } catch (error) {
      const known =
        error instanceof AdminAuggieError
          ? error
          : new AdminAuggieError(
              "That step-by-step task could not be started. Nothing was changed.",
              500,
              "ADMIN_AUGGIE_FLOW_FAILURE",
            );
      await auditAi(ctx, "admin_ai_tool_failed", call.name, "failure", {
        code: known.code,
      }).catch(() => undefined);
      throw known;
    }
  }
  try {
    return await executeSelectedTool(ctx, call);
  } catch (error) {
    const known =
      error instanceof AdminAuggieError
        ? error
        : new AdminAuggieError(
            "Sorry, that did not go through. Nothing was saved.",
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

async function recheckDelegatedTargets(
  ctx: AdminAuggieContext,
  args: DelegatedArgs,
  guards: DelegatedGuard[],
) {
  const state = delegatedStateSql(args);
  for (const guard of guards) {
    const row = await ctx.db
      .prepare(state.sql)
      .bind(...state.bindings(guard))
      .first<{ state: string }>();
    if ((row?.state ?? "missing") !== guard.expectedState)
      throw new AdminAuggieError(
        "A selected record changed after the preview. Prepare a new operation.",
        409,
        "ADMIN_AUGGIE_STALE",
      );
  }
}

function delegatedBody(args: DelegatedArgs): Record<string, unknown> {
  // Only the small instruction is sent. Every identity field the reviewed
  // student endpoint needs is carried over from the row it re-reads itself.
  if (args.kind === "student_create")
    return {
      // The Student ID is always allocated by the reviewed endpoint itself.
      manualStudentId: false,
      displayName: args.englishName,
      thaiName: args.thaiName || "",
      currentBelt: args.currentRank,
      dojoId: args.dojoIdForCreate,
      publicVisible: args.publicVisible !== false,
      ...(args.dojoJoinedDate ? { dojoJoinedDate: args.dojoJoinedDate } : {}),
      ...(args.hours === undefined ? {} : { currentTrainingHours: args.hours }),
    };
  if (args.kind === "student_record_update")
    return {
      ...(args.newRank ? { currentBelt: args.newRank } : {}),
      ...(args.publicVisible === undefined
        ? {}
        : { publicVisible: args.publicVisible }),
      ...(args.dojoJoinedDate ? { dojoJoinedDate: args.dojoJoinedDate } : {}),
    };
  if (args.kind === "student_hours")
    return { hours: args.hours, location: args.location || "" };
  if (args.kind === "student_examination")
    return {
      currentRank: args.currentRank,
      attemptedRank: args.newRank,
      passed: args.passed === true,
      location: args.location,
      examinationDate: args.examinationDate,
    };
  if (args.kind === "student_profile_decision")
    return { action: args.profileDecision };
  if (args.kind === "bulk_student_action")
    return {
      action: args.bulkAction,
      studentIds: args.targets.map((target) => target.id),
      ...(args.hours === undefined ? {} : { hours: args.hours }),
      ...(args.levels === undefined ? {} : { levels: args.levels }),
      ...(args.location === undefined ? {} : { location: args.location }),
      ...(args.examinationDate === undefined
        ? {}
        : { examinationDate: args.examinationDate }),
    };
  if (args.kind === "exam_status")
    return {
      action: "update_status",
      confirmed: true,
      cycleId: args.cycleId,
      status: args.action.replace(/^exam_/, ""),
      studentIds: args.targets.map((target) => target.id),
    };
  if (args.kind === "exam_rejection") return { action: "reject" };
  if (args.kind === "contribution_status")
    return {
      contributionType: "renshinkan_monthly",
      action: "update_status",
      confirmed: true,
      month: args.monthKey,
      status: args.action.replace(/^contribution_/, ""),
      studentIds: args.targets.map((target) => target.id),
      amount: args.amount ?? null,
      reference: "",
    };
  return {
    action: args.action === "payslip_approve" ? "approve" : "deny",
    proofIds: args.proofIds || [],
  };
}

// The reviewed endpoint owns the domain transaction. Admin Auggie only reserves
// the operation, proves the previewed rows are unchanged, delegates, and then
// records the AI-made outcome. Nothing here writes an examination or payment
// row directly.
async function executeDelegatedOperation(
  ctx: AdminAuggieContext,
  row: OperationRow,
  args: DelegatedArgs,
) {
  requirePathPermission(ctx, args.requiredPath);
  for (const target of args.targets)
    if (!canAccessDojo(ctx.session, target.dojoId))
      throw new AdminAuggieError(
        "One or more records belongs to another dojo.",
        403,
        "ADMIN_AUGGIE_CROSS_DOJO",
      );
  const guards = delegatedGuards(args);
  await recheckDelegatedTargets(ctx, args, guards);
  const now = new Date().toISOString();
  if (
    args.kind === "contribution_status" &&
    currentBangkokMonthKey(new Date(now)) !== args.monthKey
  )
    throw new AdminAuggieError(
      "The monthly contribution period changed after the preview. Use the reviewed monthly contributions page.",
      409,
      "ADMIN_AUGGIE_STALE",
    );
  const replayed = await reserveOperationExecution(ctx, row, [
    ctx.db
      .prepare(
        "INSERT INTO admin_ai_execution_claims (operation_id, claimed_at) VALUES (?, ?)",
      )
      .bind(row.id, now),
    operationGuardStatement(ctx.db, row.id),
    ...undoParentGuardStatement(ctx.db, row),
    ...(args.kind === "contribution_status"
      ? [monthGuardStatement(ctx.db, row.id, args.monthKey!)]
      : []),
    ...delegatedGuardStatements(ctx.db, row.id, args, guards),
  ]);
  if (replayed) return replayed;
  const delegatedRequestId = adminAuggieDelegatedRequestId(row.id);
  const call = await callAdminApi({
    source: ctx.request,
    env: ctx.env,
    route: args.route,
    method: args.kind === "student_record_update" ? "PUT" : "POST",
    body: delegatedBody(args),
    requestId: delegatedRequestId,
    applicationId: args.applicationId,
    studentId: SINGLE_STUDENT_KINDS.has(args.kind)
      ? args.targets[0]?.id
      : undefined,
  });
  requireDelegatedSuccess(call);
  const preview = safeJson<Record<string, unknown>>(row.preview_json, {});
  const previewRecords = Array.isArray(preview.records)
    ? (preview.records as Array<Record<string, unknown>>)
    : [];
  // The reviewed endpoint allocates the Student ID for a new record, so the
  // result card shows the identifier the database actually holds.
  const createdStudentId =
    args.kind === "student_create" && typeof call.body.studentId === "string"
      ? call.body.studentId
      : "";
  if (createdStudentId && previewRecords[0])
    previewRecords[0] = { ...previewRecords[0], studentId: createdStudentId };
  return completeEndpointOwnedOperation(ctx, row, {
    action: args.action,
    route: args.route,
    delegatedRequestId,
    now,
    count: args.targets.length,
    records: previewRecords.length
      ? previewRecords
      : args.targets.map((target) => ({
          studentId: target.publicId,
          name: target.name,
          dojo: target.dojoName,
          status: args.action.replace(/_/g, " "),
        })),
    dojoIds: Array.from(new Set(args.targets.map((target) => target.dojoId))),
    requiresSecondaryConfirmation: args.requiresSecondaryConfirmation,
    // The undo window is only opened for a change whose exact previous values
    // can be written back. The fingerprints are re-read from the database the
    // reviewed endpoint just wrote, so a later edit blocks the undo.
    ...(args.undoable
      ? {
          resultFingerprints: await readDelegatedStates(ctx, args, guards),
          undoUntil: new Date(Date.parse(now) + UNDO_TTL_MS).toISOString(),
        }
      : {}),
  });
}

const SINGLE_STUDENT_KINDS = new Set<string>([
  "student_record_update",
  "student_hours",
  "student_examination",
  "student_profile_decision",
]);

async function readDelegatedStates(
  ctx: AdminAuggieContext,
  args: DelegatedArgs,
  guards: DelegatedGuard[],
) {
  const state = delegatedStateSql(args);
  const observed: Record<string, string> = {};
  for (const guard of guards) {
    const row = await ctx.db
      .prepare(state.sql)
      .bind(...state.bindings(guard))
      .first<{ state: string }>();
    observed[guard.targetId] = row?.state ?? "missing";
  }
  return observed;
}

// Reserving is one D1 batch: the unique execution claim stops a second
// confirmation, the operation guard proves the row is still prepared and
// unexpired, and the state guards prove every previewed record is unchanged. A
// CHECK or UNIQUE failure rolls the whole batch back before anything is sent to
// the reviewed endpoint.
async function reserveOperationExecution(
  ctx: AdminAuggieContext,
  row: OperationRow,
  statements: D1PreparedStatement[],
) {
  try {
    await ctx.db.batch(statements);
    return null;
  } catch (error) {
    const replay = await ctx.db
      .prepare(`SELECT * FROM admin_ai_operations WHERE id = ? LIMIT 1`)
      .bind(row.id)
      .first<OperationRow>();
    if (replay?.status === "succeeded" && replay.result_json)
      return safeJson<Record<string, unknown>>(replay.result_json, {
        ok: true,
        operationId: row.id,
      });
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
          ? "A selected record changed during confirmation. No records were changed."
          : "The operation was not reserved safely. No records were changed.",
      409,
      code,
    );
  }
}

function requireDelegatedSuccess(call: {
  status: number;
  body: Record<string, unknown>;
}) {
  if (call.status < 400 && call.body.ok === true) return;
  throw new AdminAuggieError(
    typeof call.body.error === "string" && call.body.error
      ? call.body.error
      : "The reviewed administration endpoint refused this change. No records were changed.",
    call.status === 403 ? 403 : 409,
    call.status === 403
      ? "ADMIN_AUGGIE_ROUTE_FORBIDDEN"
      : "ADMIN_AUGGIE_DELEGATED_REJECTED",
  );
}

// The domain audit rows are written by the reviewed endpoint. This adds the
// Admin Auggie row that marks the same change as AI-made and links it to the
// delegated request identifier.
async function completeEndpointOwnedOperation(
  ctx: AdminAuggieContext,
  row: OperationRow,
  input: {
    action: string;
    route: AdminApiRoute;
    delegatedRequestId: string;
    now: string;
    count: number;
    records: Array<Record<string, unknown>>;
    dojoIds: string[];
    requiresSecondaryConfirmation: boolean;
    resultFingerprints?: Record<string, string>;
    undoUntil?: string;
  },
) {
  const result = {
    ok: true,
    operationId: row.id,
    action: input.action,
    count: input.count,
    records: input.records,
    completedAt: input.now,
    delegatedRequestId: input.delegatedRequestId,
    undoable: Boolean(input.undoUntil),
    ...(input.undoUntil ? { undoUntil: input.undoUntil } : {}),
  };
  await ctx.db.batch([
    auditStatement(ctx.db, {
      actorType: "administrator",
      ...adminAuditMetadata(ctx.session, ctx.request),
      action: "admin_ai_write_succeeded",
      entityType: "admin_ai_operation",
      entityId: row.id,
      newValues: {
        toolName: row.tool_name,
        affectedCount: input.count,
        action: input.action,
        aiGenerated: true,
        aiAssistant: "admin_auggie",
        delegatedRoute: input.route,
        delegatedRequestId: input.delegatedRequestId,
        secondConfirmationRequired: input.requiresSecondaryConfirmation,
        dojoIds: input.dojoIds,
      },
      source: "admin_ai",
      requestId: ctx.requestId,
      summary: `Admin Auggie ${input.action.replace(/_/g, " ")} succeeded for ${input.count} record(s) through ${input.route}`,
      createdAt: input.now,
    }),
    ctx.db
      .prepare(
        `UPDATE admin_ai_operations SET status = 'succeeded', confirmed_at = ?, completed_at = ?,
      result_json = ?, result_fingerprints_json = ?, undo_expires_at = ?,
      payload_expires_at = ?, error_code = NULL, updated_at = ?
      WHERE id = ? AND status = 'prepared'`,
      )
      .bind(
        input.now,
        input.now,
        JSON.stringify(result),
        JSON.stringify(input.resultFingerprints || {}),
        input.undoUntil || null,
        new Date(Date.parse(input.now) + UNDO_TTL_MS).toISOString(),
        input.now,
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
            .bind(row.id, input.now, input.now, row.undo_of_operation_id),
        ]
      : []),
  ]);
  return result;
}

// Builds the exact request the reviewed endpoint expects. The change is applied
// to the record the server just re-read, never to a copy stored at preview
// time, and every identity field the model may not set is carried over from
// that fresh record.
function contentCall(
  args: ContentArgs,
  observed: ContentObservation,
  operationId: string,
): {
  method: "POST" | "PUT";
  body?: Record<string, unknown>;
  form?: Record<string, string>;
} {
  const now = new Date().toISOString();
  if (args.kind === "newsletter_create")
    return {
      method: "POST",
      form: {
        event: JSON.stringify({
          id: `auggie-${operationId}`,
          title: args.newsletterTitle,
          date: args.newsletterDate,
          summary: args.newsletterSummary,
          body: args.newsletterBody,
          slug: args.newsletterSlug,
          contentType: "newsletter",
          category: args.newsletterCategory,
          newsletterFormat: "article",
          lifecycleStatus: "active",
          // A newsletter made by Auggie is always an unpublished draft that has
          // not been sent, so the website and the subscriber list are untouched
          // until the administrator takes those separate reviewed steps.
          published: false,
          websitePublishRequested: false,
          notifySubscribers: false,
          showInCommunityCalendar: false,
          media: [],
          tags: [],
          createdAt: now,
          updatedAt: now,
        }),
        expectedUpdatedAt: "",
        confirmSlugChange: "false",
      },
    };
  if (args.kind === "newsletter_website_state")
    return {
      method: "POST",
      form: {
        event: JSON.stringify(
          newsletterWithWebsiteState(
            observed.newsletter!,
            args.published === true,
            now,
          ),
        ),
        expectedUpdatedAt: observed.newsletter!.updatedAt,
        confirmSlugChange: "false",
      },
    };
  if (args.kind === "newsletter_lifecycle")
    return {
      method: "POST",
      form: {
        event: JSON.stringify(
          newsletterWithLifecycle(
            observed.newsletter!,
            args.lifecycle || "active",
            now,
          ),
        ),
        expectedUpdatedAt: observed.newsletter!.updatedAt,
        confirmSlugChange: "false",
      },
    };
  if (args.kind === "newsletter_send")
    return {
      method: "POST",
      body: {
        newsletterId: observed.newsletter!.id,
        idempotencyKey: `admin-auggie-send-${operationId}`,
        confirmed: true,
        confirmedRecipientCount: args.recipientCount,
      },
    };
  if (args.kind === "newsletter_delete")
    return {
      method: "POST",
      body: {
        action: "delete",
        confirmed: true,
        newsletterId: observed.newsletter!.id,
      },
    };
  if (args.kind === "gallery_publish")
    return {
      method: "POST",
      body: {
        action: "publish",
        confirmed: true,
        expectedUpdatedAt: observed.gallery!.draftUpdatedAt,
        ...(args.galleryId ? { galleryId: args.galleryId } : {}),
      },
    };
  if (args.kind.startsWith("gallery_")) {
    const gallery = observed.gallery!;
    const albums =
      args.kind === "gallery_album_order"
        ? albumsWithOrder(gallery.albums, args.albumIds || [])!
        : gallery.albums.map((album) => {
            if (album.id !== args.albumId) return album;
            if (args.kind === "gallery_album_update")
              return albumWithDetails(
                album,
                {
                  title: args.albumTitle,
                  description: args.albumDescription,
                  date: args.albumDate,
                  visibility: args.albumVisibility,
                  coverPhotoId: args.coverPhotoId,
                },
                now,
              );
            if (args.kind === "gallery_photo_captions")
              return albumWithPhotoCaptions(album, args.captions || [], now)!;
            return albumWithPhotoOrder(album, args.photoIds || [], now)!;
          });
    return {
      method: "PUT",
      body: {
        galleryId: args.galleryId,
        albums: {
          ...Object.fromEntries(GALLERY_IDS.map((id) => [id, []])),
          [args.galleryId!]: albums,
        },
        expectedUpdatedAt: gallery.draftUpdatedAt,
      },
    };
  }
  if (args.kind === "site_page_visibility")
    return {
      method: "PUT",
      body: {
        content: {
          sitePages: sitePagesWithStatus(
            observed.site!.pages,
            args.pageRoute || "",
            args.pageStatus || "draft",
          ),
          siteSettings: observed.site!.siteSettings,
        },
        expectedUpdatedAt: observed.site!.draftUpdatedAt,
      },
    };
  if (args.kind === "site_publish")
    return {
      method: "POST",
      body: {
        action: "publish",
        confirmed: true,
        note: "Published from Admin Auggie after two exact confirmations",
      },
    };
  return {
    method: "PUT",
    body: dojoUpdateBody(observed.dojo!, {
      officialName: args.officialName,
      shortName: args.shortName,
      active: args.dojoActive,
      sortOrder: args.sortOrder,
    }),
  };
}

function contentSubjectMissing(args: ContentArgs, observed: ContentObservation) {
  // A creation needs the opposite proof from every other newsletter tool: the
  // web address must still be free when the administrator confirms.
  if (args.kind === "newsletter_create") return Boolean(observed.newsletter);
  if (args.kind.startsWith("newsletter_")) return !observed.newsletter;
  if (args.kind === "dojo_settings") return !observed.dojo;
  if (args.kind === "site_page_visibility")
    return !observed.site?.pages.some((page) => page.route === args.pageRoute);
  if (args.kind === "site_publish") return !observed.site?.draftUpdatedAt;
  if (args.kind === "gallery_publish") return !observed.gallery?.draftUpdatedAt;
  if (!observed.gallery) return true;
  return Boolean(
    args.albumId &&
      !observed.gallery.albums.some((album) => album.id === args.albumId),
  );
}

async function executeContentOperation(
  ctx: AdminAuggieContext,
  row: OperationRow,
  args: ContentArgs,
) {
  requirePathPermission(ctx, args.requiredPath);
  if (args.dojoId && !canAccessDojo(ctx.session, args.dojoId))
    throw new AdminAuggieError(
      "That dojo is outside your current scope.",
      403,
      "ADMIN_AUGGIE_CROSS_DOJO",
    );
  const observed = await observeContent(ctx, args);
  if (observed.state !== args.expectedState || contentSubjectMissing(args, observed))
    throw new AdminAuggieError(
      "The saved record changed after the preview. Prepare a new proposal.",
      409,
      "ADMIN_AUGGIE_STALE",
    );
  const now = new Date().toISOString();
  const replayed = await reserveOperationExecution(ctx, row, [
    ctx.db
      .prepare(
        "INSERT INTO admin_ai_execution_claims (operation_id, claimed_at) VALUES (?, ?)",
      )
      .bind(row.id, now),
    operationGuardStatement(ctx.db, row.id),
    contentGuardStatement(ctx.db, row.id, args, observed.state),
  ]);
  if (replayed) return replayed;
  const delegatedRequestId = adminAuggieDelegatedRequestId(row.id);
  const request = contentCall(args, observed, row.id);
  const call = await callAdminApi({
    source: ctx.request,
    env: ctx.env,
    route: args.route,
    method: request.method,
    body: request.body,
    form: request.form,
    requestId: delegatedRequestId,
  });
  requireDelegatedSuccess(call);
  const preview = safeJson<Record<string, unknown>>(row.preview_json, {});
  const records = Array.isArray(preview.records)
    ? (preview.records as Array<Record<string, unknown>>)
    : [];
  return completeEndpointOwnedOperation(ctx, row, {
    action: args.action,
    route: args.route,
    delegatedRequestId,
    now,
    count: args.affectedCount,
    records,
    dojoIds: args.dojoId ? [args.dojoId] : [],
    requiresSecondaryConfirmation: args.requiresSecondaryConfirmation,
  });
}

// Undoing a bulk rank change must put every student back together or not at
// all, and the reviewed bulk endpoint can only move ranks forward. This is the
// one student write Admin Auggie performs itself: a single D1 batch that writes
// nothing but the rank the server recorded before the change, guarded row by
// row, with the same claim, expiry and audit rules as every other execution.
const RANK_STATE_SQL = `current_belt || '|' || CAST(active AS TEXT)`;

function rankGuardStatement(
  db: D1Database,
  operationId: string,
  target: StoredTarget,
) {
  return db
    .prepare(
      `INSERT INTO admin_ai_execution_guards
    (operation_id, target_id, expected_state, observed_state)
    VALUES (?, ?, ?, COALESCE((SELECT ${RANK_STATE_SQL} FROM students WHERE id = ?), 'missing'))`,
    )
    .bind(
      operationId,
      `__rank__:${target.id}`,
      target.expectedState,
      target.id,
    );
}

async function executeRankRevertOperation(
  ctx: AdminAuggieContext,
  row: OperationRow,
  args: RankRevertArgs,
) {
  requirePathPermission(ctx, args.requiredPath || STUDENT_PATH);
  const current = await resolveStudentTargets(
    ctx,
    args.targets.map((target) => target.publicId),
  );
  const byId = new Map(current.map((target) => [target.id, target]));
  for (const expected of args.targets) {
    const observed = byId.get(expected.id);
    if (!observed)
      throw new AdminAuggieError(
        "A selected student changed after the preview. Prepare a new operation.",
        409,
        "ADMIN_AUGGIE_STALE",
      );
    if (!canAccessDojo(ctx.session, observed.dojoId))
      throw new AdminAuggieError(
        "One or more students belongs to another dojo.",
        403,
        "ADMIN_AUGGIE_CROSS_DOJO",
      );
    if (`${observed.currentRank}|${observed.active}` !== expected.expectedState)
      throw new AdminAuggieError(
        "A selected student changed after the preview. Prepare a new operation.",
        409,
        "ADMIN_AUGGIE_STALE",
      );
  }
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [
    ctx.db
      .prepare(
        "INSERT INTO admin_ai_execution_claims (operation_id, claimed_at) VALUES (?, ?)",
      )
      .bind(row.id, now),
    operationGuardStatement(ctx.db, row.id),
    ...undoParentGuardStatement(ctx.db, row),
    ...args.targets.map((target) => rankGuardStatement(ctx.db, row.id, target)),
  ];
  const records: Array<Record<string, unknown>> = [];
  for (const target of args.targets) {
    const observed = byId.get(target.id)!;
    const rank = normalizeRank(args.ranks[target.id]);
    if (!rank)
      throw new AdminAuggieError(
        "The stored operation is invalid.",
        409,
        "ADMIN_AUGGIE_OPERATION_INVALID",
      );
    statements.push(
      ctx.db
        .prepare(
          `UPDATE students SET current_belt = ?, belt_color = ?, updated_at = ?
        WHERE id = ? AND current_belt = ?`,
        )
        .bind(rank, rankColor(rank), now, target.id, observed.currentRank),
      auditStatement(ctx.db, {
        actorType: "administrator",
        ...adminAuditMetadata(ctx.session, ctx.request),
        action: "student_rank_reverted",
        entityType: "student",
        entityId: target.id,
        studentId: target.id,
        studentPublicId: target.publicId,
        studentNameSnapshot: target.name,
        previousValues: { currentRank: observed.currentRank },
        newValues: {
          currentRank: rank,
          adminAiOperationId: row.id,
          undoOfOperationId: row.undo_of_operation_id,
          aiGenerated: true,
          aiAssistant: "admin_auggie",
        },
        source: "admin_ai",
        requestId: ctx.requestId,
        summary: `Admin Auggie put ${target.publicId} back to ${rank}`,
        createdAt: now,
      }),
    );
    records.push({
      studentId: target.publicId,
      name: target.name,
      dojo: target.dojoName,
      before: observed.currentRank,
      after: rank,
    });
  }
  const result = {
    ok: true,
    operationId: row.id,
    action: "rank_revert",
    count: args.targets.length,
    records,
    completedAt: now,
    undoable: false,
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
        action: "rank_revert",
        aiGenerated: true,
        aiAssistant: "admin_auggie",
        undoOfOperationId: row.undo_of_operation_id,
        dojoIds: Array.from(
          new Set(args.targets.map((target) => target.dojoId)),
        ),
      },
      source: "admin_ai",
      requestId: ctx.requestId,
      summary: `Admin Auggie put ${args.targets.length} student rank(s) back`,
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
        JSON.stringify({}),
        null,
        new Date(Date.parse(now) + UNDO_TTL_MS).toISOString(),
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
  secondPhrase = "",
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
  const stored = safeJson<OperationArgsUnion | null>(
    row.normalized_args_json,
    null,
  );
  const delegated = isDelegatedArgs(stored) ? stored : null;
  const content = isContentArgs(stored) ? stored : null;
  const rankRevert = isRankRevertArgs(stored) ? stored : null;
  const endpointOwned = delegated || content;
  if (endpointOwned?.requiresSecondaryConfirmation && !secondPhrase.trim()) {
    await operationAudit(
      ctx,
      row,
      "admin_ai_confirmation_rejected",
      "failure",
      { code: "ADMIN_AUGGIE_SECOND_CONFIRMATION_REQUIRED" },
      "Admin Auggie confirmation rejected because the second exact confirmation was missing",
    ).run();
    throw new AdminAuggieError(
      content?.kind === "newsletter_send"
        ? "This sends real email to real people. Type both exact confirmation phrases shown in the proposal."
        : "This is a money, payslip, permanent-deletion or public-website decision. Type both exact confirmation phrases shown in the proposal.",
      400,
      "ADMIN_AUGGIE_SECOND_CONFIRMATION_REQUIRED",
    );
  }
  const supplied = await confirmationDigest(
    phrase.trim(),
    endpointOwned?.requiresSecondaryConfirmation
      ? secondPhrase.trim()
      : undefined,
  );
  if (!row.confirmation_sha256 || supplied !== row.confirmation_sha256) {
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
  if (endpointOwned) {
    try {
      return delegated
        ? await executeDelegatedOperation(ctx, row, delegated)
        : await executeContentOperation(ctx, row, content!);
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
            ? "Admin Auggie confirmation rejected a stale preview"
            : `Admin Auggie ${endpointOwned.action} failed without a partial write`,
        );
      }
      throw error;
    }
  }
  const args = rankRevert ? null : (stored as OperationArgs | null);
  if (
    !rankRevert &&
    (!args ||
      (args.action !== "archive" && args.action !== "restore") ||
      !Array.isArray(args.targets))
  )
    throw new AdminAuggieError(
      "The stored operation is invalid.",
      409,
      "ADMIN_AUGGIE_OPERATION_INVALID",
    );
  try {
    return rankRevert
      ? await executeRankRevertOperation(ctx, row, rankRevert)
      : await executeStatusOperation(ctx, row, args!);
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
          : `Admin Auggie ${rankRevert ? "rank_revert" : args!.action} failed without a partial student write`,
      );
    }
    throw error;
  }
}

function undoableDelegated(args: DelegatedArgs) {
  return (
    args.undoable === true &&
    (args.kind === "student_record_update" ||
      (args.kind === "bulk_student_action" &&
        args.bulkAction === "mass_rank_change"))
  );
}

// The undo is prepared from what the database holds right now, never from the
// preview. Every student must still be inside the administrator's own scope and
// must still hold exactly the values the confirmed write produced, otherwise a
// later edit would be silently thrown away.
async function prepareStudentUndo(
  ctx: AdminAuggieContext,
  original: OperationRow,
  args: DelegatedArgs,
) {
  requirePathPermission(ctx, args.requiredPath);
  const guards = delegatedGuards(args);
  const resultFingerprints = safeJson<Record<string, string>>(
    original.result_fingerprints_json || "{}",
    {},
  );
  if (
    !guards.length ||
    guards.some((guard) => !resultFingerprints[guard.targetId])
  )
    throw new AdminAuggieError(
      "This operation is no longer eligible for safe undo.",
      409,
      "ADMIN_AUGGIE_UNDO_UNAVAILABLE",
    );
  const current = await resolveStudentTargets(
    ctx,
    args.targets.map((target) => target.publicId),
  );
  const byId = new Map(current.map((target) => [target.id, target]));
  const observed = await readDelegatedStates(ctx, args, guards);
  for (const guard of guards)
    if (observed[guard.targetId] !== resultFingerprints[guard.targetId])
      throw new AdminAuggieError(
        "A student changed after the operation, so automatic undo is blocked.",
        409,
        "ADMIN_AUGGIE_UNDO_STALE",
      );
  const undoContext: AdminAuggieContext = {
    ...ctx,
    requestId: `${ctx.requestId}:undo:${original.id}`.slice(0, 128),
  };
  if (args.kind === "student_record_update") {
    const target = byId.get(args.targets[0].id);
    if (!target)
      throw new AdminAuggieError(
        "This operation is no longer eligible for safe undo.",
        409,
        "ADMIN_AUGGIE_UNDO_UNAVAILABLE",
      );
    const stored: StoredTarget = {
      ...target,
      expectedState: observed[guards[0].targetId],
    };
    return insertDelegatedOperation(undoContext, {
      toolName: "undo_student_record_update",
      args: {
        kind: "student_record_update",
        action: "undo_student_record_update",
        targets: [stored],
        route: "admin/student-record",
        requiresSecondaryConfirmation: false,
        requiredPath: STUDENT_PATH,
        newRank: args.newRank ? args.previousRank : undefined,
        publicVisible:
          args.publicVisible === undefined
            ? undefined
            : args.previousPublicVisible,
        dojoJoinedDate: args.dojoJoinedDate
          ? args.previousDojoJoinedDate
          : undefined,
        undoable: false,
      },
      primaryPhrase: `UNDO EDIT ${target.publicId}`,
      records: [
        {
          studentId: target.publicId,
          name: target.name,
          dojo: target.dojoName,
          before: [
            args.newRank,
            args.publicVisible === undefined
              ? ""
              : args.publicVisible
                ? "shown"
                : "hidden",
            args.dojoJoinedDate,
          ]
            .filter(Boolean)
            .join(" · "),
          after: [
            args.newRank ? args.previousRank : "",
            args.publicVisible === undefined
              ? ""
              : args.previousPublicVisible
                ? "shown"
                : "hidden",
            args.dojoJoinedDate ? args.previousDojoJoinedDate : "",
          ]
            .filter(Boolean)
            .join(" · "),
        },
      ],
      extraPreview: { undoOfOperationId: original.id },
      undoOf: original.id,
      expiresAtCap: original.undo_expires_at,
      heading: { en: "Undo proposal", th: "ข้อเสนอย้อนกลับ" },
    });
  }
  const ranks: Record<string, string> = {};
  const targets: StoredTarget[] = [];
  const records: Array<Record<string, unknown>> = [];
  for (const guard of guards) {
    const previous = args.targets.find((entry) => entry.id === guard.id);
    const target = byId.get(guard.id);
    const rank = previous ? normalizeRank(previous.currentRank) : null;
    if (!previous || !target || !rank)
      throw new AdminAuggieError(
        "This operation is no longer eligible for safe undo.",
        409,
        "ADMIN_AUGGIE_UNDO_UNAVAILABLE",
      );
    ranks[target.id] = rank;
    targets.push({ ...target, expectedState: observed[guard.targetId] });
    records.push({
      studentId: target.publicId,
      name: target.name,
      dojo: target.dojoName,
      before: target.currentRank,
      after: rank,
    });
  }
  const dojos = Array.from(new Set(targets.map((target) => target.dojoName)));
  const phrase = `UNDO RANK CHANGE ${plural(targets.length, "STUDENT")}`;
  const row = await insertOperation(undoContext, {
    toolName: "undo_bulk_mass_rank_change",
    mode: "direct",
    status: "prepared",
    args: {
      kind: "rank_revert",
      action: "rank_revert",
      targets,
      ranks,
      requiredPath: STUDENT_PATH,
    },
    preview: {
      action: "rank_revert",
      count: targets.length,
      dojos,
      records,
      confirmationPhrase: phrase,
      undoOfOperationId: original.id,
      transactional: true,
      warningEn: `No change has been made. This puts ${targets.length} student rank(s) in ${dojos.join(", ") || "your dojo"} back to what they were before, in one transaction: either every student goes back or none does. Type the exact confirmation phrase.`,
      warningTh: `ยังไม่มีการเปลี่ยนแปลง รายการนี้จะคืนระดับของนักเรียน ${targets.length} รายการใน ${dojos.join(", ") || "โดโจของคุณ"} ให้เป็นค่าก่อนหน้าในธุรกรรมเดียว คือคืนทุกคนหรือไม่คืนเลย โปรดพิมพ์ข้อความยืนยันให้ตรง`,
    },
    fingerprints: Object.fromEntries(
      targets.map((target) => [`__rank__:${target.id}`, target.expectedState]),
    ),
    phrase,
    undoOf: original.id,
    expiresAtCap: original.undo_expires_at,
  });
  return {
    kind: "proposal" as const,
    heading: localized(ctx.locale, "Undo proposal", "ข้อเสนอย้อนกลับ"),
    message: localized(
      ctx.locale,
      "Undo is a new write. Review it and confirm separately.",
      "การย้อนกลับเป็นการเขียนข้อมูลใหม่ โปรดตรวจสอบและยืนยันแยกต่างหาก",
    ),
    operation: operationProposal(row, ctx.locale),
  };
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
  const storedOriginal = safeJson<unknown>(original.normalized_args_json, null);
  // An undo is itself a write. Undoing one would chain writes that nobody
  // previewed, so Auggie stops at one step back.
  if (isRankRevertArgs(storedOriginal))
    throw new AdminAuggieError(
      "An undo cannot itself be undone. Prepare a new change instead.",
      409,
      "ADMIN_AUGGIE_UNDO_UNAVAILABLE",
    );
  // A plain student field that the server recorded before the change can be
  // written back exactly, so those two changes are undoable.
  if (isDelegatedArgs(storedOriginal) && undoableDelegated(storedOriginal))
    return prepareStudentUndo(ctx, original, storedOriginal);
  // Examination, payment, hour, profile and website writes are owned by the
  // reviewed endpoints and can create ledger, decision, and history rows that no
  // inverse write can retract safely. Auggie never offers to undo them.
  if (isEndpointOwnedArgs(storedOriginal))
    throw new AdminAuggieError(
      "Examination, payment, training-hour, profile, newsletter, gallery, website, and dojo changes cannot be undone by Admin Auggie. Use the reviewed administration page.",
      409,
      "ADMIN_AUGGIE_UNDO_UNAVAILABLE",
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
