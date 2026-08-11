import type { AdminPermission } from "../../shared/adminPermissions";
import type { D1Database } from "./studentRecords";

export const CONVERSATION_TTL_MS = 2 * 60 * 60 * 1_000;
export const MAX_CONVERSATION_MESSAGES = 12;
const MAX_SUMMARY_CHARS = 1_600;
const MAX_CONTEXT_ENTITIES = 12;

export type ConversationEntityType =
  | "student"
  | "newsletter"
  | "event"
  | "payment"
  | "payment_proof"
  | "examination_application"
  | "dojo"
  | "site_page"
  | "training_request";

export type ConversationEntity = {
  type: ConversationEntityType;
  id: string;
  label: string;
  status?: string;
  dojo?: string;
};

export type ConversationTask = {
  type: string;
  slots: Record<string, string | number | boolean>;
};

export type ConversationMessage =
  | { role: "user"; text: string; at: string }
  | {
      role: "assistant";
      response: Record<string, unknown>;
      at: string;
    };

export type ConversationContext = {
  currentStudent?: ConversationEntity;
  currentNewsletter?: ConversationEntity;
  currentEvent?: ConversationEntity;
  currentPayment?: ConversationEntity;
  currentApplication?: ConversationEntity;
  currentTrainingRequest?: ConversationEntity;
  currentDojo?: ConversationEntity;
  currentSitePage?: ConversationEntity;
  candidateStudents?: ConversationEntity[];
  currentTask?: ConversationTask;
  previousIntent?: string;
  unresolvedQuestion?: string;
  pendingOperationId?: string;
  lastOperationId?: string;
};

export type ConversationState = {
  locale: "en" | "th";
  currentPath: string;
  summary: string;
  messages: ConversationMessage[];
  context: ConversationContext;
  startedAt: string;
  updatedAt: string;
  expiresAt: string;
};

export type ConversationOwner = {
  accountId: string;
  sessionHash: string;
  selectedDojoId: string;
  permission: AdminPermission;
};

type ConversationRow = {
  locale: string;
  current_path: string;
  summary_text: string;
  messages_json: string;
  context_json: string;
  started_at: string;
  updated_at: string;
  expires_at: string;
};

function plainObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function cleanText(value: unknown, max: number) {
  return typeof value === "string"
    ? value
        .normalize("NFKC")
        .replace(/[\u0000-\u001F\u007F]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max)
    : "";
}

function parseEntity(value: unknown): ConversationEntity | undefined {
  const entry = plainObject(value);
  if (!entry) return undefined;
  const type = cleanText(entry.type, 40) as ConversationEntityType;
  const id = cleanText(entry.id, 120);
  const label = cleanText(entry.label, 160);
  if (!type || !id || !label) return undefined;
  return {
    type,
    id,
    label,
    ...(cleanText(entry.status, 100)
      ? { status: cleanText(entry.status, 100) }
      : {}),
    ...(cleanText(entry.dojo, 160) ? { dojo: cleanText(entry.dojo, 160) } : {}),
  };
}

function parseTask(value: unknown): ConversationTask | undefined {
  const entry = plainObject(value);
  const slots = plainObject(entry?.slots);
  const type = cleanText(entry?.type, 80);
  if (!entry || !slots || !type) return undefined;
  const safeSlots = Object.fromEntries(
    Object.entries(slots)
      .filter(
        (item): item is [string, string | number | boolean] =>
          typeof item[1] === "string" ||
          typeof item[1] === "number" ||
          typeof item[1] === "boolean",
      )
      .slice(0, 16)
      .map(([key, slot]) => [
        cleanText(key, 60),
        typeof slot === "string" ? cleanText(slot, 300) : slot,
      ]),
  );
  return { type, slots: safeSlots };
}

function parseContext(value: string): ConversationContext {
  try {
    const parsed = plainObject(JSON.parse(value));
    if (!parsed) return {};
    const candidates = Array.isArray(parsed.candidateStudents)
      ? parsed.candidateStudents
          .map(parseEntity)
          .filter((entry): entry is ConversationEntity => Boolean(entry))
          .slice(0, MAX_CONTEXT_ENTITIES)
      : [];
    return {
      ...(parseEntity(parsed.currentStudent)
        ? { currentStudent: parseEntity(parsed.currentStudent) }
        : {}),
      ...(parseEntity(parsed.currentNewsletter)
        ? { currentNewsletter: parseEntity(parsed.currentNewsletter) }
        : {}),
      ...(parseEntity(parsed.currentEvent)
        ? { currentEvent: parseEntity(parsed.currentEvent) }
        : {}),
      ...(parseEntity(parsed.currentPayment)
        ? { currentPayment: parseEntity(parsed.currentPayment) }
        : {}),
      ...(parseEntity(parsed.currentApplication)
        ? { currentApplication: parseEntity(parsed.currentApplication) }
        : {}),
      ...(parseEntity(parsed.currentTrainingRequest)
        ? { currentTrainingRequest: parseEntity(parsed.currentTrainingRequest) }
        : {}),
      ...(parseEntity(parsed.currentDojo)
        ? { currentDojo: parseEntity(parsed.currentDojo) }
        : {}),
      ...(parseEntity(parsed.currentSitePage)
        ? { currentSitePage: parseEntity(parsed.currentSitePage) }
        : {}),
      ...(candidates.length ? { candidateStudents: candidates } : {}),
      ...(parseTask(parsed.currentTask)
        ? { currentTask: parseTask(parsed.currentTask) }
        : {}),
      ...(cleanText(parsed.previousIntent, 100)
        ? { previousIntent: cleanText(parsed.previousIntent, 100) }
        : {}),
      ...(cleanText(parsed.unresolvedQuestion, 400)
        ? { unresolvedQuestion: cleanText(parsed.unresolvedQuestion, 400) }
        : {}),
      ...(cleanText(parsed.pendingOperationId, 80)
        ? { pendingOperationId: cleanText(parsed.pendingOperationId, 80) }
        : {}),
      ...(cleanText(parsed.lastOperationId, 80)
        ? { lastOperationId: cleanText(parsed.lastOperationId, 80) }
        : {}),
    };
  } catch {
    return {};
  }
}

function parseMessages(value: string): ConversationMessage[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    const messages: ConversationMessage[] = [];
    for (const value of parsed.slice(-MAX_CONVERSATION_MESSAGES)) {
      const entry = plainObject(value);
      if (!entry) continue;
      const at = cleanText(entry.at, 40) || new Date(0).toISOString();
      if (entry.role === "user") {
        const text = cleanText(entry.text, 1_600);
        if (text) messages.push({ role: "user", text, at });
      } else if (entry.role === "assistant") {
        const response = plainObject(entry.response);
        if (response) messages.push({ role: "assistant", response, at });
      }
    }
    return messages;
  } catch {
    return [];
  }
}

export function newConversationState(
  locale: "en" | "th",
  currentPath: string,
  currentDojo?: ConversationEntity,
  now = new Date().toISOString(),
): ConversationState {
  return {
    locale,
    currentPath,
    summary: "",
    messages: [],
    context: currentDojo ? { currentDojo } : {},
    startedAt: now,
    updatedAt: now,
    expiresAt: new Date(Date.parse(now) + CONVERSATION_TTL_MS).toISOString(),
  };
}

export async function readConversationSession(
  db: D1Database,
  owner: ConversationOwner,
  now = new Date().toISOString(),
): Promise<ConversationState | null> {
  const row = await db
    .prepare(
      `SELECT locale, current_path, summary_text, messages_json, context_json,
        started_at, updated_at, expires_at
      FROM admin_ai_conversation_sessions
      WHERE account_id = ? AND session_hash = ? AND selected_dojo_id = ?
        AND permission_level = ? AND expires_at > ? LIMIT 1`,
    )
    .bind(
      owner.accountId,
      owner.sessionHash,
      owner.selectedDojoId,
      owner.permission,
      now,
    )
    .first<ConversationRow>();
  if (!row) return null;
  return {
    locale: row.locale === "th" ? "th" : "en",
    currentPath: cleanText(row.current_path, 240) || "/admin/dashboard",
    summary: cleanText(row.summary_text, MAX_SUMMARY_CHARS),
    messages: parseMessages(row.messages_json),
    context: parseContext(row.context_json),
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
  };
}

export async function writeConversationSession(
  db: D1Database,
  owner: ConversationOwner,
  state: ConversationState,
  now = new Date().toISOString(),
) {
  const expiresAt = new Date(
    Date.parse(now) + CONVERSATION_TTL_MS,
  ).toISOString();
  const messages = state.messages.slice(-MAX_CONVERSATION_MESSAGES);
  await db
    .prepare(
      `INSERT INTO admin_ai_conversation_sessions (
        id, account_id, session_hash, selected_dojo_id, permission_level,
        locale, current_path, summary_text, messages_json, context_json,
        started_at, expires_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(account_id, session_hash, selected_dojo_id) DO UPDATE SET
        permission_level = excluded.permission_level,
        locale = excluded.locale,
        current_path = excluded.current_path,
        summary_text = excluded.summary_text,
        messages_json = excluded.messages_json,
        context_json = excluded.context_json,
        expires_at = excluded.expires_at,
        updated_at = excluded.updated_at`,
    )
    .bind(
      crypto.randomUUID(),
      owner.accountId,
      owner.sessionHash,
      owner.selectedDojoId,
      owner.permission,
      state.locale,
      state.currentPath,
      cleanText(state.summary, MAX_SUMMARY_CHARS),
      JSON.stringify(messages),
      JSON.stringify(state.context),
      state.startedAt,
      expiresAt,
      state.startedAt,
      now,
    )
    .run();
  return expiresAt;
}

function responseExcerpt(response: Record<string, unknown>) {
  return [cleanText(response.heading, 120), cleanText(response.message, 300)]
    .filter(Boolean)
    .join(": ");
}

function summaryFragment(message: ConversationMessage) {
  return message.role === "user"
    ? `Admin: ${cleanText(message.text, 220)}`
    : `Auggie: ${responseExcerpt(message.response)}`;
}

export function appendConversationTurn(
  state: ConversationState,
  userText: string,
  response: Record<string, unknown>,
  now = new Date().toISOString(),
) {
  const combined: ConversationMessage[] = [
    ...state.messages,
    { role: "user", text: cleanText(userText, 1_600), at: now },
    { role: "assistant", response, at: now },
  ];
  const removed = combined.slice(
    0,
    Math.max(0, combined.length - MAX_CONVERSATION_MESSAGES),
  );
  if (removed.length) {
    const addition = removed.map(summaryFragment).filter(Boolean).join(" | ");
    state.summary = cleanText(
      [state.summary, addition].filter(Boolean).join(" | "),
      MAX_SUMMARY_CHARS,
    );
  }
  state.messages = combined.slice(-MAX_CONVERSATION_MESSAGES);
  state.updatedAt = now;
  state.expiresAt = new Date(
    Date.parse(now) + CONVERSATION_TTL_MS,
  ).toISOString();
  return state;
}

export function modelConversationMessages(state: ConversationState) {
  return state.messages.slice(-8).map((message) =>
    message.role === "user"
      ? { role: "user" as const, content: message.text }
      : {
          role: "assistant" as const,
          content: responseExcerpt(message.response) || "Handled safely.",
        },
  );
}

export function modelConversationContext(
  state: ConversationState,
  currentRequest: { photoAttached?: boolean } = {},
) {
  return JSON.stringify(
    {
      summary: state.summary || undefined,
      selected: {
        student: state.context.currentStudent,
        newsletter: state.context.currentNewsletter,
        event: state.context.currentEvent,
        payment: state.context.currentPayment,
        examinationApplication: state.context.currentApplication,
        trainingRequest: state.context.currentTrainingRequest,
        dojo: state.context.currentDojo,
        sitePage: state.context.currentSitePage,
      },
      candidateStudents: state.context.candidateStudents,
      currentTask: state.context.currentTask,
      previousIntent: state.context.previousIntent,
      unresolvedQuestion: state.context.unresolvedQuestion,
      pendingOperationId: state.context.pendingOperationId,
      lastOperationId: state.context.lastOperationId,
      currentPage: state.currentPath,
      currentLanguage: state.locale,
      currentRequest: {
        // Only availability reaches inference. The stored id, URL, bytes,
        // filename, and media metadata stay on the server.
        photoAttached: currentRequest.photoAttached === true,
      },
    },
    null,
    2,
  );
}

export async function clearConversationSession(
  db: D1Database,
  owner: ConversationOwner,
) {
  await db
    .prepare(
      `DELETE FROM admin_ai_conversation_sessions
      WHERE account_id = ? AND session_hash = ? AND selected_dojo_id = ?`,
    )
    .bind(owner.accountId, owner.sessionHash, owner.selectedDojoId)
    .run();
}

export async function clearConversationSessionsForSignOut(
  db: D1Database,
  accountId: string,
  sessionHash: string,
) {
  await db
    .prepare(
      `DELETE FROM admin_ai_conversation_sessions
      WHERE account_id = ? AND session_hash = ?`,
    )
    .bind(accountId, sessionHash)
    .run();
}

export async function deleteExpiredConversationSessions(
  db: D1Database,
  now = new Date().toISOString(),
) {
  const result = await db
    .prepare(`DELETE FROM admin_ai_conversation_sessions WHERE expires_at <= ?`)
    .bind(now)
    .run();
  return Number(result?.meta?.changes ?? 0);
}
