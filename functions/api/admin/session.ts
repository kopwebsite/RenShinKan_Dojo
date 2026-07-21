import { effectivePermissionLevel, getAdminSession, isRenShinKanSuperAdmin, jsonResponse, RENSHINKAN_DOJO_ID } from "../../_lib/auth";
import type { StudentEnv } from "../../_lib/studentRecords";
type Env = StudentEnv & { SESSION_SECRET?: string };
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const session = await getAdminSession(request, env);
  if (!session) return jsonResponse({ authenticated: false, admin: null, dojos: [] }, 200, { "Cache-Control": "no-store" });
  const permittedDojoIds = session.role === "dojo" ? session.allowedDojoIds : [];
  const dojoScope = permittedDojoIds.length
    ? ` AND id IN (${permittedDojoIds.map(() => "?").join(",")})`
    : "";
  const dojos = env.STUDENT_DB
    ? (await env.STUDENT_DB.prepare(`SELECT id, official_name, short_name, code, logo_url, slug, active, sort_order
        FROM dojos WHERE active = 1${dojoScope}
        ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END, sort_order, official_name COLLATE NOCASE`)
        .bind(...permittedDojoIds, RENSHINKAN_DOJO_ID).all()).results || []
    : [];
  return jsonResponse({
    authenticated: true,
    admin: {
      name: session.adminName,
      role: session.role,
      allowedDojoIds: session.allowedDojoIds,
      selectedDojoId: session.selectedDojoId,
      permissionLevel: effectivePermissionLevel(session),
      renshinkanVerificationRequired: session.selectedDojoId === RENSHINKAN_DOJO_ID && !isRenShinKanSuperAdmin(session),
    },
    dojos,
  }, 200, { "Cache-Control": "no-store" });
};
