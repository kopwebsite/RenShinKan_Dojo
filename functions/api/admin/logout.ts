import { clearSessionCookie, isSameOriginRequest, jsonResponse } from "../../_lib/auth";

export async function onRequestPost({ request }: { request: Request }) {
  if (!isSameOriginRequest(request)) {
    return jsonResponse({ ok: false, error: "Forbidden" }, 403);
  }

  return jsonResponse(
    { ok: true },
    200,
    {
      "Set-Cookie": clearSessionCookie(),
    },
  );
}
