import { allowAdminLoginAttempt, clearAdminLoginAttempts, createSessionCookie, isSameOriginRequest, jsonResponse, recordFailedAdminLoginAttempt, verifyAdminPassword } from "../../_lib/auth";
import type { D1Database } from "../../_lib/studentRecords";
type Env = { ADMIN_PASSWORD_HASH?: string; SESSION_SECRET?: string; STUDENT_DB?: D1Database };
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!isSameOriginRequest(request)) return jsonResponse({ ok: false, error: "Forbidden" }, 403);
  try {
    const body = await request.json<{ password?: unknown }>();
    if (typeof body.password !== "string") return jsonResponse({ ok: false, error: "Password is required" }, 400);
    if (!(await allowAdminLoginAttempt(request, env))) return jsonResponse({ ok: false, error: "Too many sign-in attempts. Try again in 15 minutes." }, 429);
    if (!(await verifyAdminPassword(body.password, env))) {
      const mayRetry = await recordFailedAdminLoginAttempt(request, env);
      return jsonResponse({ ok: false, error: mayRetry ? "Invalid password" : "Too many sign-in attempts. Try again in 15 minutes." }, mayRetry ? 401 : 429);
    }
    await clearAdminLoginAttempts(request, env);
    return jsonResponse({ ok: true }, 200, { "Set-Cookie": await createSessionCookie(env) });
  } catch { return jsonResponse({ ok: false, error: "Invalid request body" }, 400); }
};
