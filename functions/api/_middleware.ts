import {
  correlationIdentifier,
  failureCategory,
  operationalEvent,
  unexpectedErrorResponse,
  type OperationalEnv,
} from "../_lib/observability";

type Env = OperationalEnv & { APP_ENV?: string; PERFORMANCE_DIAGNOSTICS?: string; STUDENT_DB?: object };

function instrumentD1(database: object, metrics: { queryCount: number; d1Ms: number }) {
  const originals = new WeakMap<object, object>();
  const statementMethods = new Set(["first", "all", "run", "raw"]);
  const wrapStatement = (statement: object): object => {
    const wrapped = new Proxy(statement, {
      get(target, property) {
        if (property === "bind") return (...values: unknown[]) => wrapStatement(Reflect.apply(Reflect.get(target, property), target, values));
        if (typeof property === "string" && statementMethods.has(property)) return async (...values: unknown[]) => {
          metrics.queryCount += 1;
          const started = performance.now();
          try { return await Reflect.apply(Reflect.get(target, property), target, values); }
          finally { metrics.d1Ms += performance.now() - started; }
        };
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    originals.set(wrapped, statement);
    return wrapped;
  };
  return new Proxy(database, {
    get(target, property) {
      if (property === "prepare") return (...values: unknown[]) => wrapStatement(Reflect.apply(Reflect.get(target, property), target, values));
      if (property === "batch") return async (statements: object[]) => {
        metrics.queryCount += statements.length;
        const started = performance.now();
        try { return await Reflect.apply(Reflect.get(target, property), target, [statements.map((statement) => originals.get(statement) || statement)]); }
        finally { metrics.d1Ms += performance.now() - started; }
      };
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

function attachPerformanceMetrics(response: Response, metrics: { queryCount: number; d1Ms: number }) {
  const headers = new Headers(response.headers);
  headers.set("X-Perf-Query-Count", String(metrics.queryCount));
  headers.set("X-Perf-D1-Ms", metrics.d1Ms.toFixed(2));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function attachCorrelationId(response: Response, correlationId: string) {
  const headers = new Headers(response.headers);
  headers.set("X-Correlation-ID", correlationId);

  if (
    response.status >= 500 &&
    headers.get("Content-Type")?.toLowerCase().includes("application/json")
  ) {
    try {
      const value = (await response.clone().json()) as unknown;
      if (value && typeof value === "object" && !Array.isArray(value)) {
        return new Response(
          JSON.stringify({
            ...(value as Record<string, unknown>),
            correlationId,
          }),
          { status: response.status, statusText: response.statusText, headers },
        );
      }
    } catch {
      // Preserve non-standard downstream responses; the header still carries
      // the correlation ID without exposing parsing details.
    }
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const requestId = correlationIdentifier(context.request);
  const headers = new Headers(context.request.headers);
  headers.set("X-Request-ID", requestId);
  const downstreamRequest = new Request(context.request, { headers });
  const metrics = { queryCount: 0, d1Ms: 0 };
  const diagnostics = context.env.APP_ENV === "local" && context.env.PERFORMANCE_DIAGNOSTICS === "true" && Boolean(context.env.STUDENT_DB);
  if (diagnostics) context.env.STUDENT_DB = instrumentD1(context.env.STUDENT_DB!, metrics);

  try {
    const response = await context.next(downstreamRequest);
    if (
      response.status === 401 ||
      response.status === 403 ||
      response.status === 429
    ) {
      operationalEvent(
        response.status === 429 ? "warn" : "info",
        response.status === 429
          ? "request_rate_limited"
          : "request_authorization_denied",
        failureCategory(downstreamRequest, response.status),
        {
          request: downstreamRequest,
          env: context.env,
          status: response.status,
        },
      );
    } else if (response.status >= 500) {
      operationalEvent(
        "error",
        "api_request_failed",
        failureCategory(downstreamRequest, response.status),
        {
          request: downstreamRequest,
          env: context.env,
          status: response.status,
        },
      );
    }
    const correlated = await attachCorrelationId(response, requestId);
    return diagnostics ? attachPerformanceMetrics(correlated, metrics) : correlated;
  } catch {
    return unexpectedErrorResponse(downstreamRequest, context.env);
  }
};
