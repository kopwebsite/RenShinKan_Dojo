import { clearSessionCookie, getAdminSession, isSameOriginRequest, jsonResponse, revokeAdminSession } from "../../_lib/auth";
import { adminAuditMetadata, auditStatement, requestIdentifier, requireStudentDb, type StudentEnv } from "../../_lib/studentRecords";
import {
  adminAuggieSessionHash,
  clearFlowSessionsForSignOut,
} from "../../_lib/adminAuggieFlowStore";
import { clearConversationSessionsForSignOut } from "../../_lib/adminAuggieConversation";

type Env = StudentEnv & { SESSION_SECRET?: string };

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!isSameOriginRequest(request)) {
    return jsonResponse({ ok: false, error: "Forbidden" }, 403);
  }

  const session = await getAdminSession(request, env);
  if (session) {
    const now = new Date().toISOString();
    const db = requireStudentDb(env);
    await auditStatement(db, { actorType: "administrator", ...adminAuditMetadata(session, request),
      action: "admin_logout", entityType: "admin_session", entityId: session.sessionId, source: "admin_logout",
      requestId: requestIdentifier(request), summary: `${session.adminName} signed out`, createdAt: now }).run();
    // Any Admin Auggie conversation left part way through is removed at once,
    // rather than waiting for it to time out on its own.
    const secret = env.SESSION_SECRET?.trim() || "";
    const conversationHash = await adminAuggieSessionHash(
      secret,
      session.sessionId,
    );
    await Promise.all([
      clearFlowSessionsForSignOut(db, secret, session),
      clearConversationSessionsForSignOut(
        db,
        session.accountId,
        conversationHash,
      ),
      db
        .prepare(
          `UPDATE admin_ai_operations
          SET status = 'cancelled', error_code = 'ADMIN_AUGGIE_SIGNED_OUT',
            payload_expires_at = ?, updated_at = ?
          WHERE account_id = ? AND session_hash = ? AND status = 'prepared'`,
        )
        .bind(now, now, session.accountId, conversationHash)
        .run(),
    ]).catch(() => undefined);
    await revokeAdminSession(env, session, session.adminName, "logout");
  }
  return jsonResponse(
    { ok: true },
    200,
    {
      "Set-Cookie": clearSessionCookie(),
    },
  );
};
