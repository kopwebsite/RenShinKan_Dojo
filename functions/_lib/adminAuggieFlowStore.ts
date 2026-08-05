import { hmacHex, type D1Database } from "./studentRecords";
import type { AdminSession } from "./auth";
import type { AdminPermission } from "../../shared/adminPermissions";
import { isFlowId, type FlowState } from "./adminAuggieFlows";

// Where a guided conversation is kept. It lives on the server, tied to the
// administrator's account, their signed-in session and the dojo they have
// selected, so closing the panel or reloading the page loses nothing and no
// other administrator can ever see the work in progress. Only the answers the
// administrator typed are kept: no question text, no model reply, no database
// result and no chat transcript.

// A guided conversation that has been left alone for two hours is dropped. The
// deadline moves forward every time the administrator answers, so a
// conversation in active use is never cut off mid-way.
export const FLOW_SESSION_TTL_MS = 2 * 60 * 60 * 1_000;

export type FlowSessionRow = {
  id: string;
  account_id: string;
  session_hash: string;
  selected_dojo_id: string;
  permission_level: string;
  flow_id: string;
  answers_json: string;
  answer_order_json: string;
  started_at: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
};

export type FlowSessionOwner = {
  accountId: string;
  sessionHash: string;
  selectedDojoId: string;
  permission: AdminPermission;
};

export async function adminAuggieSessionHash(
  secret: string,
  sessionId: string,
) {
  return hmacHex(secret, `admin-auggie-session\n${sessionId}`);
}

function parseAnswers(value: string): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {};
    const entries = Object.entries(parsed as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    );
    return Object.fromEntries(entries);
  } catch {
    return {};
  }
}

function parseOrder(value: string, answers: Record<string, string>): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is string => typeof entry === "string" && entry in answers,
    );
  } catch {
    return [];
  }
}

export async function readFlowSession(
  db: D1Database,
  owner: FlowSessionOwner,
  now = new Date().toISOString(),
): Promise<{ state: FlowState; expiresAt: string } | null> {
  const row = await db
    .prepare(
      `SELECT * FROM admin_ai_flow_sessions
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
    .first<FlowSessionRow>();
  if (!row || !isFlowId(row.flow_id)) return null;
  const answers = parseAnswers(row.answers_json);
  return {
    state: {
      flowId: row.flow_id,
      answers,
      order: parseOrder(row.answer_order_json, answers),
      startedAt: row.started_at,
    },
    expiresAt: row.expires_at,
  };
}

export async function writeFlowSession(
  db: D1Database,
  owner: FlowSessionOwner,
  state: FlowState,
  now = new Date().toISOString(),
) {
  const expiresAt = new Date(Date.parse(now) + FLOW_SESSION_TTL_MS).toISOString();
  await db
    .prepare(
      `INSERT INTO admin_ai_flow_sessions (
        id, account_id, session_hash, selected_dojo_id, permission_level, flow_id,
        answers_json, answer_order_json, started_at, expires_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(account_id, session_hash, selected_dojo_id) DO UPDATE SET
        permission_level = excluded.permission_level,
        flow_id = excluded.flow_id,
        answers_json = excluded.answers_json,
        answer_order_json = excluded.answer_order_json,
        started_at = excluded.started_at,
        expires_at = excluded.expires_at,
        updated_at = excluded.updated_at`,
    )
    .bind(
      crypto.randomUUID(),
      owner.accountId,
      owner.sessionHash,
      owner.selectedDojoId,
      owner.permission,
      state.flowId,
      JSON.stringify(state.answers),
      JSON.stringify(state.order),
      state.startedAt,
      expiresAt,
      now,
      now,
    )
    .run();
  return expiresAt;
}

export async function clearFlowSession(
  db: D1Database,
  owner: FlowSessionOwner,
) {
  await db
    .prepare(
      `DELETE FROM admin_ai_flow_sessions
      WHERE account_id = ? AND session_hash = ? AND selected_dojo_id = ?`,
    )
    .bind(owner.accountId, owner.sessionHash, owner.selectedDojoId)
    .run();
}

// Signing out clears the guided conversation straight away instead of waiting
// for it to time out.
export async function clearFlowSessionsForSignOut(
  db: D1Database,
  secret: string,
  session: Pick<AdminSession, "accountId" | "sessionId">,
) {
  if (!secret || secret.length < 32 || !session.accountId || !session.sessionId)
    return;
  const sessionHash = await adminAuggieSessionHash(secret, session.sessionId);
  await db
    .prepare(
      `DELETE FROM admin_ai_flow_sessions WHERE account_id = ? AND session_hash = ?`,
    )
    .bind(session.accountId, sessionHash)
    .run();
}

export async function deleteExpiredFlowSessions(
  db: D1Database,
  now = new Date().toISOString(),
) {
  const result = await db
    .prepare(`DELETE FROM admin_ai_flow_sessions WHERE expires_at <= ?`)
    .bind(now)
    .run();
  return Number(result?.meta?.changes ?? 0);
}
