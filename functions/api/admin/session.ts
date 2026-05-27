import { hasValidAdminSession, jsonResponse } from "../../_lib/auth";

type Env = {
  SESSION_SECRET?: string;
};

export async function onRequestGet({ request, env }: { request: Request; env: Env }) {
  return jsonResponse({
    authenticated: await hasValidAdminSession(request, env),
  });
}
