export type MembershipEnv = {
  TURNSTILE_SECRET_KEY?: string;
  GOOGLE_FORM_URL?: string;
  PARENT_NAME_ENTRY_ID?: string;
  STUDENT_NAME_ENTRY_ID?: string;
  EMAIL_ENTRY_ID?: string;
  PHONE_ENTRY_ID?: string;
  HOME_ADDRESS_ENTRY_ID?: string;
  PAYMENT_METHOD_ENTRY_ID?: string;
  NOTES_ENTRY_ID?: string;
  AGREEMENT_ENTRY_ID?: string;
  SITE_URL?: string;
  ALLOWED_ORIGIN?: string;
};

type MembershipPayload = {
  parentName?: unknown;
  studentName?: unknown;
  emailAddress?: unknown;
  phoneNumber?: unknown;
  homeAddress?: unknown;
  paymentMethod?: unknown;
  notes?: unknown;
  agreement?: unknown;
  turnstileToken?: unknown;
};

const REQUIRED_ENV_KEYS = [
  "TURNSTILE_SECRET_KEY",
  "GOOGLE_FORM_URL",
  "PARENT_NAME_ENTRY_ID",
  "STUDENT_NAME_ENTRY_ID",
  "EMAIL_ENTRY_ID",
  "PHONE_ENTRY_ID",
  "HOME_ADDRESS_ENTRY_ID",
  "PAYMENT_METHOD_ENTRY_ID",
  "NOTES_ENTRY_ID",
  "AGREEMENT_ENTRY_ID",
] as const;

const TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const REQUIRED_FIELDS = [
  "parentName",
  "studentName",
  "emailAddress",
  "phoneNumber",
  "homeAddress",
  "paymentMethod",
] as const;

function jsonResponse(request: Request, env: MembershipEnv, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(request, env),
    },
  });
}

function corsHeaders(request: Request, env: MembershipEnv) {
  const requestOrigin = new URL(request.url).origin;
  const origin = request.headers.get("Origin");
  const allowedOrigins = new Set(
    [requestOrigin, env.SITE_URL, env.ALLOWED_ORIGIN]
      .filter((value): value is string => Boolean(value))
      .map((value) => normalizeOrigin(value)),
  );
  const allowedOrigin = origin && allowedOrigins.has(normalizeOrigin(origin)) ? origin : requestOrigin;

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function normalizeOrigin(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return value.replace(/\/+$/, "");
  }
}

function getRequiredEnv(env: MembershipEnv) {
  const missing = REQUIRED_ENV_KEYS.filter((key) => !env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing Worker configuration: ${missing.join(", ")}`);
  }

  return {
    turnstileSecretKey: env.TURNSTILE_SECRET_KEY!,
    googleFormUrl: env.GOOGLE_FORM_URL!,
    parentNameEntryId: env.PARENT_NAME_ENTRY_ID!,
    studentNameEntryId: env.STUDENT_NAME_ENTRY_ID!,
    emailEntryId: env.EMAIL_ENTRY_ID!,
    phoneEntryId: env.PHONE_ENTRY_ID!,
    homeAddressEntryId: env.HOME_ADDRESS_ENTRY_ID!,
    paymentMethodEntryId: env.PAYMENT_METHOD_ENTRY_ID!,
    notesEntryId: env.NOTES_ENTRY_ID!,
    agreementEntryId: env.AGREEMENT_ENTRY_ID!,
  };
}

function requiredString(payload: MembershipPayload, key: (typeof REQUIRED_FIELDS)[number]) {
  const value = payload[key];
  return typeof value === "string" ? value.trim() : "";
}

function optionalString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function validatePayload(payload: MembershipPayload) {
  const missingFields: string[] = REQUIRED_FIELDS.filter((field) => !requiredString(payload, field));

  if (payload.agreement !== "Check") {
    missingFields.push("agreement");
  }

  if (!optionalString(payload.turnstileToken)) {
    missingFields.push("turnstileToken");
  }

  return missingFields;
}

type TurnstileVerification = {
  success?: boolean;
  "error-codes"?: string[];
};

function getRequestIp(request: Request) {
  const forwardedFor = request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim();
  return request.headers.get("CF-Connecting-IP") || forwardedFor || "";
}

async function verifyTurnstileToken(token: string, secretKey: string, request: Request) {
  const body = new URLSearchParams({
    secret: secretKey,
    response: token,
  });
  const remoteIp = getRequestIp(request);

  if (remoteIp) {
    body.set("remoteip", remoteIp);
  }

  try {
    const response = await fetch(TURNSTILE_SITEVERIFY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!response.ok) {
      return { success: false, "error-codes": ["siteverify-request-failed"] } satisfies TurnstileVerification;
    }

    return await response.json() as TurnstileVerification;
  } catch {
    return { success: false, "error-codes": ["siteverify-request-failed"] } satisfies TurnstileVerification;
  }
}

export async function handleMembershipSubmission(request: Request, env: MembershipEnv) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(request, env),
    });
  }

  if (request.method !== "POST") {
    return jsonResponse(request, env, { error: "Method not allowed" }, 405);
  }

  const contentLength = Number(request.headers.get("Content-Length") ?? "0");
  if (contentLength > 10_000) {
    return jsonResponse(request, env, { error: "Request body is too large" }, 413);
  }

  let payload: MembershipPayload;

  try {
    payload = await request.json();
  } catch {
    return jsonResponse(request, env, { error: "Invalid JSON body" }, 400);
  }

  const missingFields = validatePayload(payload);
  if (missingFields.length > 0) {
    return jsonResponse(
      request,
      env,
      { error: `Missing required field${missingFields.length === 1 ? "" : "s"}: ${missingFields.join(", ")}` },
      400,
    );
  }

  let config: ReturnType<typeof getRequiredEnv>;

  try {
    config = getRequiredEnv(env);
  } catch (error) {
    return jsonResponse(
      request,
      env,
      { error: error instanceof Error ? error.message : "Worker configuration is incomplete" },
      500,
    );
  }

  const turnstileVerification = await verifyTurnstileToken(
    optionalString(payload.turnstileToken),
    config.turnstileSecretKey,
    request,
  );

  if (!turnstileVerification.success) {
    return jsonResponse(request, env, { error: "Cloudflare verification failed. Please try again." }, 400);
  }

  const formData = new URLSearchParams();
  formData.set(config.parentNameEntryId, requiredString(payload, "parentName"));
  formData.set(config.studentNameEntryId, requiredString(payload, "studentName"));
  formData.set(config.emailEntryId, requiredString(payload, "emailAddress"));
  formData.set(config.phoneEntryId, requiredString(payload, "phoneNumber"));
  formData.set(config.homeAddressEntryId, requiredString(payload, "homeAddress"));
  formData.set(config.paymentMethodEntryId, requiredString(payload, "paymentMethod"));
  formData.set(config.notesEntryId, optionalString(payload.notes));
  formData.set(config.agreementEntryId, "Check");

  try {
    const formResponse = await fetch(config.googleFormUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData,
    });

    if (!formResponse.ok) {
      return jsonResponse(request, env, { error: "Google Form submission failed" }, 502);
    }

    return jsonResponse(request, env, { success: true });
  } catch {
    return jsonResponse(request, env, { error: "Unable to submit membership details" }, 502);
  }
}
