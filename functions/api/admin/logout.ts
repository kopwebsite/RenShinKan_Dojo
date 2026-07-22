import { clearSessionCookie, getAdminSession, isSameOriginRequest, jsonResponse, revokeAdminSession } from "../../_lib/auth";
import { adminAuditMetadata, auditStatement, requestIdentifier, requireStudentDb, type StudentEnv } from "../../_lib/studentRecords";

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
