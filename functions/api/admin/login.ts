import {
  allowAdminLoginAttempt,
  authenticateAdminPassword,
  clearAdminLoginAttempts,
  createSessionCookie,
  isSameOriginRequest,
  jsonResponse,
  recordFailedAdminLoginAttempt,
  RENSHINKAN_DOJO_ID,
} from "../../_lib/auth";
import {
  auditStatement,
  requestIdentifier,
  type D1Database,
} from "../../_lib/studentRecords";
import { operationalEvent } from "../../_lib/observability";
type Env = {
  ADMIN_PASSWORD_HASH?: string;
  DOJO_ADMIN_PASSWORD_HASHES?: string;
  SESSION_SECRET?: string;
  STUDENT_DB?: D1Database;
  APP_ENV?: string;
  BUILD_ID?: string;
};

async function auditLoginFailure(
  request: Request,
  env: Env,
  adminName: string,
  summary: string,
) {
  if (!env.STUDENT_DB) return;
  const requestId = requestIdentifier(request);
  await auditStatement(env.STUDENT_DB, {
    actorType: "system",
    actorIdentifier: "unauthenticated_admin_login",
    action: "admin_login_failed",
    entityType: "admin_session",
    entityId: requestId,
    source: "admin_login",
    requestId,
    administratorName: adminName || null,
    outcome: "failure",
    summary,
    ipAddress: request.headers.get("CF-Connecting-IP"),
    countryCode: request.headers.get("CF-IPCountry"),
    userAgent: (request.headers.get("User-Agent") || "").slice(0, 500),
  }).run();
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!isSameOriginRequest(request))
    return jsonResponse({ ok: false, error: "Forbidden" }, 403);
  let body: { adminName?: unknown; password?: unknown };
  let failureStage = "validate_input";
  try {
    body = await request.json<{ adminName?: unknown; password?: unknown }>();
  } catch {
    return jsonResponse({ ok: false, error: "Invalid request body" }, 400);
  }
  try {
    const adminName =
      typeof body.adminName === "string"
        ? body.adminName.normalize("NFKC").trim().replace(/\s+/g, " ")
        : "";
    if (!adminName || adminName.length > 120)
      return jsonResponse(
        {
          ok: false,
          error: "Your name is required and must be 120 characters or fewer.",
        },
        400,
      );
    if (typeof body.password !== "string")
      return jsonResponse({ ok: false, error: "Password is required" }, 400);
    failureStage = "rate_limit_check";
    if (!(await allowAdminLoginAttempt(request, env))) {
      await auditLoginFailure(
        request,
        env,
        adminName,
        "Blocked an administrator sign-in while the source was rate limited",
      );
      return jsonResponse(
        {
          ok: false,
          error: "Too many sign-in attempts. Try again in 15 minutes.",
        },
        429,
      );
    }
    failureStage = "password_verification";
    const access = await authenticateAdminPassword(body.password, env);
    if (!access) {
      failureStage = "invalid_credential_record";
      const mayRetry = await recordFailedAdminLoginAttempt(request, env);
      await auditLoginFailure(
        request,
        env,
        adminName,
        "Administrator sign-in failed because the credential was invalid",
      );
      return jsonResponse(
        {
          ok: false,
          error: mayRetry
            ? "Invalid password"
            : "Too many sign-in attempts. Try again in 15 minutes.",
        },
        mayRetry ? 401 : 429,
      );
    }
    failureStage = "rate_limit_clear";
    await clearAdminLoginAttempts(request, env);
    if (access.role !== "central") {
      await auditLoginFailure(
        request,
        env,
        adminName,
        "Blocked a non-RenShinKan credential from the administration area",
      );
      return jsonResponse(
        {
          ok: false,
          error:
            "This administration area is limited to authorized RenShinKan administrators.",
        },
        403,
      );
    }
    const authenticatedName = access.displayName;
    if (env.STUDENT_DB) {
      failureStage = "account_lookup";
      const existingAccount = await env.STUDENT_DB.prepare(
        "SELECT disabled FROM admin_accounts WHERE credential_id = ? LIMIT 1",
      )
        .bind(access.credentialId)
        .first<{ disabled: number }>();
      if (existingAccount?.disabled === 1) {
        await auditLoginFailure(
          request,
          env,
          "",
          "Blocked a disabled administrator credential",
        );
        return jsonResponse(
          { ok: false, error: "This administrator account is disabled." },
          403,
        );
      }
    }
    const selectedDojoId = RENSHINKAN_DOJO_ID;
    const sessionId = crypto.randomUUID();
    if (env.STUDENT_DB) {
      failureStage = "account_and_audit_write";
      const now = new Date().toISOString();
      const auditId = crypto.randomUUID();
      const statements = [
        env.STUDENT_DB.prepare(
          `INSERT INTO admin_accounts
          (id, credential_id, display_name, role, password_hash, disabled, last_login_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, NULL, 0, ?, ?, ?)
          ON CONFLICT(credential_id) DO UPDATE SET display_name = excluded.display_name,
            role = excluded.role, last_login_at = excluded.last_login_at, updated_at = excluded.updated_at
          WHERE admin_accounts.disabled = 0`,
        ).bind(
          access.accountId,
          access.credentialId,
          authenticatedName,
          access.role,
          now,
          now,
          now,
        ),
        env.STUDENT_DB.prepare(
          `INSERT INTO audit_log (
        id, admin_action, record_type, record_id, action_summary, created_at,
        actor_type, actor_identifier, action, entity_type, entity_id, source, request_id,
        administrator_name, administrator_role, selected_dojo_id, ip_address, country_code, user_agent
      ) VALUES (?, 'admin_login', 'admin_session', ?, ?, ?, 'administrator', ?, 'admin_login',
        'admin_session', ?, 'admin_login', ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          auditId,
          sessionId,
          `${authenticatedName} signed in`,
          now,
          access.accountId,
          sessionId,
          request.headers.get("X-Request-ID") || auditId,
          authenticatedName,
          access.role,
          selectedDojoId,
          request.headers.get("CF-Connecting-IP"),
          request.headers.get("CF-IPCountry"),
          (request.headers.get("User-Agent") || "").slice(0, 500),
        ),
      ];
      await env.STUDENT_DB.batch(statements);
    }
    failureStage = "session_cookie";
    return jsonResponse({ ok: true, role: access.role }, 200, {
      "Set-Cookie": await createSessionCookie(env, {
        sessionId,
        accountId: access.accountId,
        adminName: authenticatedName,
        role: access.role,
        allowedDojoIds: access.allowedDojoIds,
        selectedDojoId,
      }),
      "Cache-Control": "no-store",
    });
  } catch (error) {
    const requestId = requestIdentifier(request);
    const failureType =
      error instanceof Error ? error.name.toLowerCase() : "unknown";
    operationalEvent(
      "error",
      `admin_login_unavailable_${failureStage}_${failureType}`,
      "database_failure",
      {
        request,
        env,
        status: 503,
      },
    );
    return jsonResponse(
      { ok: false, error: "Sign-in is temporarily unavailable.", requestId },
      503,
    );
  }
};
