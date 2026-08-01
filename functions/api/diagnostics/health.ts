import {
  runBindingDiagnostics,
  type DiagnosticsEnv,
} from "../../_lib/diagnostics";
import { jsonResponse } from "../../_lib/auth";
import { correlationIdentifier } from "../../_lib/observability";

export const onRequestGet: PagesFunction<DiagnosticsEnv> = async ({
  request,
  env,
}) => {
  const result = await runBindingDiagnostics(env);
  const correlationId = correlationIdentifier(request);
  return jsonResponse(
    {
      status: result.ok ? "ok" : "degraded",
      checkedAt: result.checkedAt,
      environment: result.environment,
      buildId: result.buildId,
      checks: Object.fromEntries(
        Object.entries(result.checks).map(([name, check]) => [name, check.ok]),
      ),
      correlationId,
    },
    result.ok ? 200 : 503,
    {
      "Cache-Control": "no-store",
      "X-Correlation-ID": correlationId,
      "X-Robots-Tag": "noindex, nofollow",
    },
  );
};
