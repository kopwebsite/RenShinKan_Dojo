import { getAuthorizedAdminSession, isSameOriginRequest, jsonResponse, requiresCentralAdmin } from "../../_lib/auth";
import { reconcileEditableContentPublish } from "../../_lib/publishing";
import { requireStudentDb, type StudentEnv } from "../../_lib/studentRecords";
import type { StorageEnv } from "../../_lib/storage";

type Env = StudentEnv & StorageEnv & { SESSION_SECRET?: string };

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Forbidden" }, 403);
  const session = await getAuthorizedAdminSession(request, env);
  if (!requiresCentralAdmin(session)) return jsonResponse({ error: "Unauthorized" }, session ? 403 : 401);
  try {
    const body = await request.json<{ operationId?: unknown; confirmed?: unknown }>();
    const operationId = typeof body.operationId === "string" ? body.operationId : "";
    if (body.confirmed !== true || !/^[a-f0-9-]{36}$/i.test(operationId)) {
      return jsonResponse({ error: "Confirm a valid publish operation to reconcile." }, 400);
    }
    const operation = await reconcileEditableContentPublish({ env, db: requireStudentDb(env), operationId });
    return jsonResponse({ ok: true, operationId: operation.id, revisionNumber: operation.revision_number, status: "published" });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "The publish operation could not be reconciled." }, 409);
  }
};
