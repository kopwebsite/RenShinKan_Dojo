import { createSessionCookie, isSameOriginRequest, jsonResponse, verifyAdminPassword } from "../../_lib/auth";
type Env = { ADMIN_PASSWORD_HASH?: string; SESSION_SECRET?: string };
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!isSameOriginRequest(request)) return jsonResponse({ ok: false, error: "Forbidden" }, 403);
  try {
    const body = await request.json<{ password?: unknown }>();
    if (typeof body.password !== "string") return jsonResponse({ ok: false, error: "Password is required" }, 400);
    if (!(await verifyAdminPassword(body.password, env))) return jsonResponse({ ok: false, error: "Invalid password" }, 401);
    return jsonResponse({ ok: true }, 200, { "Set-Cookie": await createSessionCookie(env) });
  } catch { return jsonResponse({ ok: false, error: "Invalid request body" }, 400); }
};
