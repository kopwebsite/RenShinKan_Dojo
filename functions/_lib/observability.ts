import { jsonResponse } from "./auth";

export type OperationalCategory =
  | "api_failure"
  | "authentication_denied"
  | "database_failure"
  | "kv_failure"
  | "migration_failure"
  | "payment_proof_failure"
  | "publishing_failure"
  | "r2_failure"
  | "rate_limit_denied"
  | "unexpected_error"
  | "upload_failure";

export type OperationalEnv = {
  APP_ENV?: string;
  BUILD_ID?: string;
};

type OperationalContext = {
  request: Request;
  env?: OperationalEnv;
  status?: number;
  adminAccountId?: string | null;
  dojoScope?: string | null;
};

const SAFE_IDENTIFIER = /^[A-Za-z0-9:_-]{1,120}$/;
const SAFE_BUILD = /^[A-Za-z0-9._-]{1,80}$/;
const DYNAMIC_PARENT_SEGMENTS = new Set([
  "students",
  "payment-proofs",
  "examinations",
  "share",
]);

export function correlationIdentifier(request: Request) {
  const supplied = request.headers.get("X-Request-ID")?.trim() || "";
  return /^[A-Za-z0-9._:-]{8,128}$/.test(supplied)
    ? supplied
    : crypto.randomUUID();
}

function safeIdentifier(value: string | null | undefined) {
  const normalized = value?.trim() || "";
  return SAFE_IDENTIFIER.test(normalized) ? normalized : undefined;
}

export function safeRoute(request: Request) {
  const pathname = new URL(request.url).pathname;
  if (pathname.startsWith("/uploads/")) return "/uploads/:object";
  const segments = pathname.split("/").filter(Boolean);
  return `/${segments
    .map((segment, index) => {
      const previous = segments[index - 1];
      if (DYNAMIC_PARENT_SEGMENTS.has(previous)) return ":id";
      if (segment.length > 40 || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment))
        return ":id";
      return /^[A-Za-z0-9._~-]{1,40}$/.test(segment) ? segment : ":segment";
    })
    .join("/")}`;
}

function safeEnvironment(env?: OperationalEnv) {
  const value = env?.APP_ENV?.trim() || "unknown";
  return /^(local|preview|production|test)$/.test(value) ? value : "unknown";
}

function safeBuildId(env?: OperationalEnv) {
  const value = env?.BUILD_ID?.trim() || "unknown";
  return SAFE_BUILD.test(value) ? value : "unknown";
}

export function operationalEvent(
  level: "info" | "warn" | "error",
  event: string,
  category: OperationalCategory,
  context: OperationalContext,
) {
  const entry = {
    timestamp: new Date().toISOString(),
    event: event.replace(/[^a-z0-9_]/gi, "_").slice(0, 80),
    category,
    requestId: correlationIdentifier(context.request),
    route: safeRoute(context.request),
    method: context.request.method.toUpperCase().slice(0, 12),
    ...(Number.isInteger(context.status) ? { status: context.status } : {}),
    environment: safeEnvironment(context.env),
    buildId: safeBuildId(context.env),
    ...(safeIdentifier(context.adminAccountId)
      ? { adminAccountId: safeIdentifier(context.adminAccountId) }
      : {}),
    ...(safeIdentifier(context.dojoScope)
      ? { dojoScope: safeIdentifier(context.dojoScope) }
      : {}),
  };

  // This object is deliberately closed over a fixed allowlist. Never add
  // request bodies, URL queries, cookies, authorization values, error text,
  // student details, or storage contents here.
  if (level === "error") console.error(entry);
  else if (level === "warn") console.warn(entry);
  else console.info(entry);
  return entry;
}

export function failureCategory(request: Request, status: number) {
  const route = safeRoute(request);
  if (status === 429) return "rate_limit_denied" as const;
  if (status === 401 || status === 403) return "authentication_denied" as const;
  if (route.includes("payment-proofs")) return "payment_proof_failure" as const;
  if (route.includes("publish") || route.includes("newsletters"))
    return "publishing_failure" as const;
  if (route.includes("upload") || route.includes("site-media"))
    return "upload_failure" as const;
  if (route === "/api/content") return "kv_failure" as const;
  return "api_failure" as const;
}

export function unexpectedErrorResponse(
  request: Request,
  env: OperationalEnv | undefined,
  category: OperationalCategory = "unexpected_error",
  status = 500,
) {
  const correlationId = correlationIdentifier(request);
  operationalEvent("error", "uncaught_request_error", category, {
    request,
    env,
    status,
  });
  return jsonResponse(
    {
      ok: false,
      error:
        "The request could not be completed. Retry safely or contact an administrator with the correlation ID.",
      correlationId,
    },
    status,
    { "X-Correlation-ID": correlationId },
  );
}
