import { allowAdminLoginAttempt, authenticateAdminPassword, clearAdminLoginAttempts, createSessionCookie, isSameOriginRequest, jsonResponse, recordFailedAdminLoginAttempt } from "../../_lib/auth";
import type { D1Database } from "../../_lib/studentRecords";
type Env = { ADMIN_PASSWORD_HASH?: string; DOJO_ADMIN_PASSWORD_HASHES?: string; SESSION_SECRET?: string; STUDENT_DB?: D1Database };
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!isSameOriginRequest(request)) return jsonResponse({ ok: false, error: "Forbidden" }, 403);
  try {
    const body = await request.json<{ adminName?: unknown; password?: unknown }>();
    const adminName = typeof body.adminName === "string"
      ? body.adminName.normalize("NFKC").trim().replace(/\s+/g, " ")
      : "";
    if (!adminName || adminName.length > 120) return jsonResponse({ ok: false, error: "Your name is required and must be 120 characters or fewer." }, 400);
    if (typeof body.password !== "string") return jsonResponse({ ok: false, error: "Password is required" }, 400);
    if (!(await allowAdminLoginAttempt(request, env))) return jsonResponse({ ok: false, error: "Too many sign-in attempts. Try again in 15 minutes." }, 429);
    const access = await authenticateAdminPassword(body.password, env);
    if (!access) {
      const mayRetry = await recordFailedAdminLoginAttempt(request, env);
      return jsonResponse({ ok: false, error: mayRetry ? "Invalid password" : "Too many sign-in attempts. Try again in 15 minutes." }, mayRetry ? 401 : 429);
    }
    await clearAdminLoginAttempts(request, env);
    if (access.role === "dojo" && env.STUDENT_DB) {
      const active = await env.STUDENT_DB.prepare(`SELECT COUNT(*) AS count FROM dojos
        WHERE id IN (${access.allowedDojoIds.map(() => "?").join(",")}) AND active = 1`)
        .bind(...access.allowedDojoIds).first<{ count: number }>();
      if (Number(active?.count || 0) !== access.allowedDojoIds.length) {
        return jsonResponse({ ok: false, error: "This dojo administrator account is not active." }, 403);
      }
    }
    const sessionId = crypto.randomUUID();
    if (env.STUDENT_DB) {
      const now = new Date().toISOString();
      const auditId = crypto.randomUUID();
      await env.STUDENT_DB.prepare(`INSERT INTO audit_log (
        id, admin_action, record_type, record_id, action_summary, created_at,
        actor_type, actor_identifier, action, entity_type, entity_id, source, request_id,
        administrator_name, administrator_role, ip_address, country_code, user_agent
      ) VALUES (?, 'admin_login', 'admin_session', ?, ?, ?, 'administrator', ?, 'admin_login',
        'admin_session', ?, 'admin_login', ?, ?, ?, ?, ?, ?)`)
        .bind(
          auditId, sessionId, `${adminName} signed in as ${access.role === "central" ? "RenShinKan administrator" : "dojo administrator"}`,
          now, sessionId, sessionId, request.headers.get("X-Request-ID") || auditId, adminName, access.role,
          request.headers.get("CF-Connecting-IP"), request.headers.get("CF-IPCountry"),
          (request.headers.get("User-Agent") || "").slice(0, 500),
        ).run();
    }
    return jsonResponse({ ok: true, role: access.role }, 200, {
      "Set-Cookie": await createSessionCookie(env, { sessionId, adminName, role: access.role, allowedDojoIds: access.allowedDojoIds }),
      "Cache-Control": "no-store",
    });
  } catch { return jsonResponse({ ok: false, error: "Invalid request body" }, 400); }
};
