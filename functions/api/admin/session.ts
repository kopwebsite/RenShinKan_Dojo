import { hasValidAdminSession, jsonResponse } from "../../_lib/auth";
type Env = { SESSION_SECRET?: string };
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => jsonResponse({ authenticated: await hasValidAdminSession(request, env) }, 200, { "Cache-Control": "no-store" });
