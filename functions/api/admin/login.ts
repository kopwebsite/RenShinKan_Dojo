import { createSessionCookie, isSameOriginRequest, jsonResponse, verifyAdminPassword } from "../../_lib/auth";

type Env = {
  ADMIN_PASSWORD_HASH?: string;
  SESSION_SECRET?: string;
};

export async function onRequestPost({ request, env }: { request: Request; env: Env }) {
  if (!isSameOriginRequest(request)) {
    return jsonResponse({ ok: false, error: "Forbidden" }, 403);
  }

  let body: { password?: unknown };

  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: "Invalid request body" }, 400);
  }

  if (typeof body.password !== "string") {
    return jsonResponse({ ok: false, error: "Password is required" }, 400);
  }

  const valid = await verifyAdminPassword(body.password, env);

  if (!valid) {
    return jsonResponse({ ok: false, error: "Invalid password" }, 401);
  }

  return jsonResponse(
    { ok: true },
    200,
    {
      "Set-Cookie": await createSessionCookie(env),
    },
  );
}
