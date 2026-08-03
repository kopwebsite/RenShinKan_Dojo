import {
  getAuthorizedAdminSession,
  isRenShinKanSuperAdmin,
  isSameOriginRequest,
  jsonResponse,
} from "../../_lib/auth";
import { cleanExpiredAuditRecords } from "../../_lib/auditRetention";
import { scrubExpiredAdminAuggiePayloads } from "../../_lib/adminAuggie";
import {
  requestIdentifier,
  requireStudentDb,
  type StudentEnv,
} from "../../_lib/studentRecords";

type Env = StudentEnv & { SESSION_SECRET?: string };

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!isSameOriginRequest(request))
    return jsonResponse({ error: "Forbidden" }, 403);
  const session = await getAuthorizedAdminSession(request, env);
  if (!isRenShinKanSuperAdmin(session))
    return jsonResponse(
      { error: "RenShinKan super administrator access is required." },
      403,
    );
  const db = requireStudentDb(env);
  const result = await cleanExpiredAuditRecords(db, {
    source: "manual_audit_cleanup",
    actorIdentifier: session!.sessionId,
    requestId: requestIdentifier(request),
  });
  const adminAuggiePayloadsScrubbed = await scrubExpiredAdminAuggiePayloads(
    db,
    new Date().toISOString(),
    1_000,
  );
  return jsonResponse(
    { ok: true, retentionDays: 90, adminAuggiePayloadsScrubbed, ...result },
    200,
    { "Cache-Control": "no-store" },
  );
};
