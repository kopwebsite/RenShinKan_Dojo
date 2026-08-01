import {
  getAuthorizedAdminSession,
  jsonResponse,
  requiresCentralAdmin,
} from "../../_lib/auth";
import {
  EXPECTED_LATEST_MIGRATION,
  runBindingDiagnostics,
  runReadOnlyConsistencyAudit,
  type DiagnosticsEnv,
} from "../../_lib/diagnostics";

type Env = DiagnosticsEnv & { SESSION_SECRET?: string };

async function authorize(request: Request, env: Env) {
  const session = await getAuthorizedAdminSession(request, env);
  if (!requiresCentralAdmin(session)) {
    return {
      session: null,
      response: jsonResponse(
        {
          ok: false,
          error: "RenShinKan administrator verification is required.",
        },
        session ? 403 : 401,
      ),
    };
  }
  return { session, response: null };
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await authorize(request, env);
  if (auth.response) return auth.response;
  const [health, consistency] = await Promise.all([
    runBindingDiagnostics(env),
    runReadOnlyConsistencyAudit(env),
  ]);
  return jsonResponse({
    ok: health.ok && consistency.ok,
    expectedLatestMigration: EXPECTED_LATEST_MIGRATION,
    health,
    consistency,
    privacy:
      "No resource IDs, object keys, record identities, request bodies, or storage contents are returned.",
  });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await authorize(request, env);
  if (auth.response) return auth.response;
  return jsonResponse(
    {
      ok: false,
      error:
        "Automated repairs are intentionally unavailable. Export, preview, review, and audit an explicit repair plan before any write.",
    },
    405,
    { Allow: "GET" },
  );
};
