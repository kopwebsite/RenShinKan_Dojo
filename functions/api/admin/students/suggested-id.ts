import { canAccessDojo, getAuthorizedAdminSession, jsonResponse } from "../../../_lib/auth";
import { activeDojo, requireStudentDb, suggestedStudentId, type StudentEnv } from "../../../_lib/studentRecords";

type Env = StudentEnv & { SESSION_SECRET?: string };

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const session = await getAuthorizedAdminSession(request, env);
  if (!session) return jsonResponse({ error: "Unauthorized" }, 401);

  const dojoId = new URL(request.url).searchParams.get("dojoId")?.trim() || session.selectedDojoId || "";
  if (!dojoId || !canAccessDojo(session, dojoId)) return jsonResponse({ error: "You do not have access to that dojo." }, 403);

  const db = requireStudentDb(env);
  const dojo = await activeDojo(db, dojoId);
  if (!dojo) return jsonResponse({ error: "Choose an active dojo." }, 400);

  return jsonResponse({ suggestedStudentId: await suggestedStudentId(db, dojo.id) }, 200, { "Cache-Control": "no-store" });
};
