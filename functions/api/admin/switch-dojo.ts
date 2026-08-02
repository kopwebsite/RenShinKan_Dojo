import { effectivePermissionLevel, getAdminSession, isSameOriginRequest, jsonResponse, updateSelectedDojoCookie } from "../../_lib/auth";
import { adminAuditMetadata, auditStatement, requestIdentifier, requireStudentDb, type StudentEnv } from "../../_lib/studentRecords";

type Env = StudentEnv & { SESSION_SECRET?: string };

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Forbidden" }, 403);
  const session = await getAdminSession(request, env);
  if (!session) return jsonResponse({ error: "Unauthorized" }, 401);
  const clearedSession = { ...session, selectedDojoId: null };
  if (session.selectedDojoId) {
    await auditStatement(requireStudentDb(env), {
      actorType: "administrator",
      ...adminAuditMetadata(session, request),
      action: "dojo_context_cleared",
      entityType: "dojo",
      entityId: session.selectedDojoId,
      source: "admin_switch_dojo",
      requestId: requestIdentifier(request),
      summary: `${session.adminName} left the selected dojo context`,
    }).run();
  }
  return jsonResponse({
    ok: true,
    admin: {
      name: clearedSession.adminName,
      role: clearedSession.role,
      allowedDojoIds: clearedSession.allowedDojoIds,
      selectedDojoId: null,
      permissionLevel: effectivePermissionLevel(clearedSession),
    },
  }, 200, {
    "Set-Cookie": await updateSelectedDojoCookie(env, session, null),
    "Cache-Control": "no-store",
  });
};
