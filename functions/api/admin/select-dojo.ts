import { canAccessDojo, getAdminSession, isSameOriginRequest, jsonResponse, updateSelectedDojoCookie } from "../../_lib/auth";
import { requestIdentifier, requireStudentDb, type StudentEnv } from "../../_lib/studentRecords";

type Env = StudentEnv & { SESSION_SECRET?: string };

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Forbidden" }, 403);
  const session = await getAdminSession(request, env);
  if (!session) return jsonResponse({ error: "Unauthorized" }, 401);
  try {
    const body = await request.json<{ dojoId?: unknown }>();
    const dojoId = typeof body.dojoId === "string" ? body.dojoId : "";
    const db = requireStudentDb(env);
    const dojo = await db.prepare("SELECT id, official_name FROM dojos WHERE id = ? AND active = 1 LIMIT 1")
      .bind(dojoId).first<{ id: string; official_name: string }>();
    if (!dojo) return jsonResponse({ error: "Choose an active dojo." }, 404);
    if (!canAccessDojo(session, dojo.id)) return jsonResponse({ error: "Your administrator account does not have access to that dojo." }, 403);
    const now = new Date().toISOString();
    const auditId = crypto.randomUUID();
    await db.prepare(`INSERT INTO audit_log (
      id, admin_action, record_type, record_id, action_summary, created_at,
      actor_type, actor_identifier, action, entity_type, entity_id, source, request_id,
      administrator_name, administrator_role, selected_dojo_id, ip_address, country_code, user_agent
    ) VALUES (?, 'dojo_selected', 'dojo', ?, ?, ?, 'administrator', ?, 'dojo_selected',
      'dojo', ?, 'admin_login', ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        auditId, dojo.id, `${session.adminName} selected ${dojo.official_name}`, now, session.sessionId, dojo.id,
        requestIdentifier(request), session.adminName, session.role, dojo.id,
        request.headers.get("CF-Connecting-IP"), request.headers.get("CF-IPCountry"),
        (request.headers.get("User-Agent") || "").slice(0, 500),
      ).run();
    return jsonResponse({ ok: true, selectedDojoId: dojo.id }, 200, {
      "Set-Cookie": await updateSelectedDojoCookie(env, session, dojo.id),
      "Cache-Control": "no-store",
    });
  } catch {
    return jsonResponse({ error: "Choose an active dojo." }, 400);
  }
};
