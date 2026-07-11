import { hasValidAdminSession, isSameOriginRequest, jsonResponse } from "../../../../_lib/auth";
import { audit, requireStudentDb, sha256Hex, type StudentEnv } from "../../../../_lib/studentRecords";
type Env = StudentEnv & { SESSION_SECRET?: string; SITE_URL?: string };
async function allowed(request: Request, env: Env) { return isSameOriginRequest(request) && await hasValidAdminSession(request, env); }
function randomToken() { const bytes = crypto.getRandomValues(new Uint8Array(32)); return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""); }
export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!(await allowed(request, env))) return jsonResponse({ error: "Unauthorized" }, 401);
  const db = requireStudentDb(env); const studentId = String(params.id); const token = randomToken(); const hash = await sha256Hex(token); const now = new Date().toISOString();
  await db.batch([db.prepare("UPDATE share_tokens SET active = 0, revoked_at = ? WHERE student_id = ? AND active = 1").bind(now, studentId), db.prepare("INSERT INTO share_tokens (id, token_hash, student_id, active, created_at) VALUES (?, ?, ?, 1, ?)").bind(crypto.randomUUID(), hash, studentId, now)]);
  await audit(db, "regenerate", "share_token", studentId, "Generated a new public share token");
  return jsonResponse({ ok: true, url: `${(env.SITE_URL || new URL(request.url).origin).replace(/\/$/, "")}/records/share/${token}` }, 201, { "Cache-Control": "no-store" });
};
export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!(await allowed(request, env))) return jsonResponse({ error: "Unauthorized" }, 401);
  const db = requireStudentDb(env); const studentId = String(params.id); const now = new Date().toISOString();
  await db.prepare("UPDATE share_tokens SET active = 0, revoked_at = ? WHERE student_id = ? AND active = 1").bind(now, studentId).run(); await audit(db, "revoke", "share_token", studentId, "Revoked public sharing"); return jsonResponse({ ok: true });
};
