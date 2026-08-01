import {
  effectivePermissionLevel,
  getAdminSession,
  isSameOriginRequest,
  jsonResponse,
  RENSHINKAN_DOJO_ID,
  updateRenshinKanVerifiedCookie,
  verifyRenshinKanSecondaryPassword,
} from "../../_lib/auth";
import { adminAuditMetadata, auditStatement, requestIdentifier, requireStudentDb, type StudentEnv } from "../../_lib/studentRecords";
import { clearRateLimit, consumeRateLimit } from "../../_lib/rateLimit";

type Env = StudentEnv & {
  SESSION_SECRET?: string;
  RSK_ADMIN_SECONDARY_PASSWORD?: string;
  RSK_ADMIN_SECONDARY_PASSWORD_HASH?: string;
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Forbidden" }, 403);
  const session = await getAdminSession(request, env);
  if (!session) return jsonResponse({ error: "Unauthorized" }, 401);
  if (session.role !== "central" || session.selectedDojoId !== RENSHINKAN_DOJO_ID) {
    return jsonResponse({ error: "Choose RenShinKan Dojo before entering its access password." }, 403);
  }
  try {
    const sourceAllowed = await consumeRateLimit(request, env, {
      endpoint: "renshinkan-secondary-ip", limit: 8, windowSeconds: 15 * 60, lockSeconds: 15 * 60,
    });
    const accountAllowed = await consumeRateLimit(request, env, {
      endpoint: "renshinkan-secondary-account", subject: session.accountId, limit: 6, windowSeconds: 15 * 60, lockSeconds: 15 * 60,
    });
    if (!sourceAllowed || !accountAllowed) {
      return jsonResponse({ error: "RenShinKan verification is temporarily unavailable. Wait and try again." }, 429);
    }
    const body = await request.json<{ password?: unknown }>();
    const password = typeof body.password === "string" && body.password.length <= 256 ? body.password : "";
    const verified = password !== "" && await verifyRenshinKanSecondaryPassword(password, env);
    const db = requireStudentDb(env);
    const now = new Date().toISOString();
    const requestId = requestIdentifier(request);

    if (!verified) {
      await auditStatement(db, {
        actorType: "administrator",
        ...adminAuditMetadata(session, request),
        administratorRole: "dojo_admin",
        action: "renshinkan_secondary_verification_failed",
        entityType: "admin_session",
        entityId: session.sessionId,
        source: "admin_renshinkan_verification",
        requestId,
        summary: `${session.adminName} failed RenShinKan secondary verification`,
        outcome: "failure",
        createdAt: now,
      }).run();
      return jsonResponse({ error: "Incorrect RenShinKan access password." }, 401, { "Cache-Control": "no-store" });
    }

    const verifiedSession = { ...session, renshinkanVerified: true };
    await Promise.all([
      clearRateLimit(request, env, "renshinkan-secondary-ip"),
      clearRateLimit(request, env, "renshinkan-secondary-account", session.accountId),
    ]);
    await auditStatement(db, {
      actorType: "administrator",
      ...adminAuditMetadata(verifiedSession, request),
      action: "renshinkan_secondary_verified",
      entityType: "admin_session",
      entityId: session.sessionId,
      source: "admin_renshinkan_verification",
      requestId,
      summary: `${session.adminName} completed RenShinKan secondary verification`,
      createdAt: now,
    }).run();
    return jsonResponse({
      ok: true,
      admin: {
        name: verifiedSession.adminName,
        role: verifiedSession.role,
        allowedDojoIds: verifiedSession.allowedDojoIds,
        selectedDojoId: verifiedSession.selectedDojoId,
        permissionLevel: effectivePermissionLevel(verifiedSession),
        renshinkanVerificationRequired: false,
      },
    }, 200, {
      "Set-Cookie": await updateRenshinKanVerifiedCookie(env, session),
      "Cache-Control": "no-store",
    });
  } catch {
    return jsonResponse({ error: "RenShinKan verification is unavailable." }, 503, { "Cache-Control": "no-store" });
  }
};
