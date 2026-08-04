import { onRequestPost as contributionsPost } from "../api/admin/contributions";
import { onRequestPost as examinationsPost } from "../api/admin/examinations";
import { onRequestPost as examinationApplicationPost } from "../api/admin/examinations/[applicationId]";
import { onRequestPost as paymentProofsPost } from "../api/admin/payment-proofs";
import { onRequestPost as newsletterSavePost } from "../api/admin/newsletters/save";
import { onRequestPost as newsletterSendPost } from "../api/admin/newsletters/send";
import { onRequestPost as newsletterActionsPost } from "../api/admin/newsletters/actions";
import {
  onRequestGet as galleriesGet,
  onRequestPost as galleriesPost,
  onRequestPut as galleriesPut,
} from "../api/admin/galleries";
import {
  onRequestGet as siteContentGet,
  onRequestPost as siteContentPost,
  onRequestPut as siteContentPut,
} from "../api/admin/site-content";
import {
  onRequestGet as dojosGet,
  onRequestPut as dojosPut,
} from "../api/admin/dojos";
import { onRequestPut as studentRecordPut } from "../api/admin/students/[id]";
import { onRequestPost as studentHoursPost } from "../api/admin/students/[id]/hours";
import { onRequestPost as studentExamPost } from "../api/admin/students/[id]/exam";
import { onRequestPost as studentProfileStatusPost } from "../api/admin/students/[id]/profile-status";
import { onRequestPost as studentsBulkPost } from "../api/admin/students/bulk";

// Admin Auggie never writes examination, payment, newsletter, gallery, website
// or dojo rows itself. Every write is delegated to the reviewed administration
// endpoint that already owns the transaction, the dojo scope, the permission
// check, the replay record, and the domain audit rows. This module only builds
// the internal same-origin request and reads the endpoint's own JSON answer
// back.

export type AdminApiRoute =
  | "admin/examinations"
  | "admin/examination-application"
  | "admin/contributions"
  | "admin/payment-proofs"
  | "admin/newsletter-save"
  | "admin/newsletter-send"
  | "admin/newsletter-actions"
  | "admin/galleries"
  | "admin/site-content"
  | "admin/dojos"
  | "admin/student-record"
  | "admin/student-hours"
  | "admin/student-exam"
  | "admin/student-profile-status"
  | "admin/students-bulk";

export type AdminApiMethod = "GET" | "POST" | "PUT";

type DelegatedHandler = (context: {
  request: Request;
  env: unknown;
  params: Record<string, string>;
}) => Response | Promise<Response>;

type RouteDefinition = {
  path: string;
  handlers: Partial<Record<AdminApiMethod, DelegatedHandler>>;
};

const ROUTES: Record<AdminApiRoute, RouteDefinition> = {
  "admin/examinations": {
    path: "/api/admin/examinations",
    handlers: { POST: examinationsPost as unknown as DelegatedHandler },
  },
  "admin/examination-application": {
    path: "/api/admin/examinations",
    handlers: {
      POST: examinationApplicationPost as unknown as DelegatedHandler,
    },
  },
  "admin/contributions": {
    path: "/api/admin/contributions",
    handlers: { POST: contributionsPost as unknown as DelegatedHandler },
  },
  "admin/payment-proofs": {
    path: "/api/admin/payment-proofs",
    handlers: { POST: paymentProofsPost as unknown as DelegatedHandler },
  },
  "admin/newsletter-save": {
    path: "/api/admin/newsletters/save",
    handlers: { POST: newsletterSavePost as unknown as DelegatedHandler },
  },
  "admin/newsletter-send": {
    path: "/api/admin/newsletters/send",
    handlers: { POST: newsletterSendPost as unknown as DelegatedHandler },
  },
  "admin/newsletter-actions": {
    path: "/api/admin/newsletters/actions",
    handlers: { POST: newsletterActionsPost as unknown as DelegatedHandler },
  },
  "admin/galleries": {
    path: "/api/admin/galleries",
    handlers: {
      GET: galleriesGet as unknown as DelegatedHandler,
      PUT: galleriesPut as unknown as DelegatedHandler,
      POST: galleriesPost as unknown as DelegatedHandler,
    },
  },
  "admin/site-content": {
    path: "/api/admin/site-content",
    handlers: {
      GET: siteContentGet as unknown as DelegatedHandler,
      PUT: siteContentPut as unknown as DelegatedHandler,
      POST: siteContentPost as unknown as DelegatedHandler,
    },
  },
  "admin/dojos": {
    path: "/api/admin/dojos",
    handlers: {
      GET: dojosGet as unknown as DelegatedHandler,
      PUT: dojosPut as unknown as DelegatedHandler,
    },
  },
  // Student record, hour, examination, profile and bulk writes keep the same
  // rule as every other delegated route: the reviewed endpoint owns the
  // transaction, the dojo check and the domain audit rows.
  "admin/student-record": {
    path: "/api/admin/students",
    handlers: { PUT: studentRecordPut as unknown as DelegatedHandler },
  },
  "admin/student-hours": {
    path: "/api/admin/students",
    handlers: { POST: studentHoursPost as unknown as DelegatedHandler },
  },
  "admin/student-exam": {
    path: "/api/admin/students",
    handlers: { POST: studentExamPost as unknown as DelegatedHandler },
  },
  "admin/student-profile-status": {
    path: "/api/admin/students",
    handlers: {
      POST: studentProfileStatusPost as unknown as DelegatedHandler,
    },
  },
  "admin/students-bulk": {
    path: "/api/admin/students/bulk",
    handlers: { POST: studentsBulkPost as unknown as DelegatedHandler },
  },
};

// The reviewed student endpoints live under a dynamic path segment. The
// identifier is always the internal row id the server itself resolved from an
// exact public Student ID, never a value taken from model output.
const STUDENT_ROUTE_SUFFIX: Partial<Record<AdminApiRoute, string>> = {
  "admin/student-record": "",
  "admin/student-hours": "/hours",
  "admin/student-exam": "/exam",
  "admin/student-profile-status": "/profile-status",
};

// Audit rows written by the delegated endpoint carry this request identifier,
// so every AI-assisted domain row is queryable as AI-made alongside the
// admin_ai_operation row that authorised it.
export const ADMIN_AUGGIE_REQUEST_PREFIX = "admin-auggie:";

export function adminAuggieDelegatedRequestId(operationId: string) {
  return `${ADMIN_AUGGIE_REQUEST_PREFIX}${operationId}`;
}

// Headers copied from the administrator's own confirmation request. The session
// cookie is the only authority: the delegated endpoint re-derives the account,
// role, permission level, and selected dojo from it. No caller-supplied dojo,
// role, or permission is ever forwarded.
const FORWARDED_HEADERS = [
  "Cookie",
  "User-Agent",
  "CF-Connecting-IP",
  "CF-IPCountry",
  "Accept-Language",
] as const;

function delegatedPath(
  route: AdminApiRoute,
  applicationId: string,
  studentId: string,
) {
  if (route === "admin/examination-application")
    return `/api/admin/examinations/${encodeURIComponent(applicationId)}`;
  const suffix = STUDENT_ROUTE_SUFFIX[route];
  if (suffix !== undefined)
    return `${ROUTES[route].path}/${encodeURIComponent(studentId)}${suffix}`;
  return ROUTES[route].path;
}

export function internalAdminRequest(input: {
  source: Request;
  route: AdminApiRoute;
  requestId: string;
  method?: AdminApiMethod;
  body?: Record<string, unknown>;
  form?: Record<string, string>;
  query?: Record<string, string>;
  applicationId?: string;
  studentId?: string;
}) {
  const method = input.method || "POST";
  const origin = new URL(input.source.url).origin;
  const url = new URL(
    delegatedPath(
      input.route,
      input.applicationId || "",
      input.studentId || "",
    ),
    origin,
  );
  for (const [name, value] of Object.entries(input.query || {}))
    url.searchParams.set(name, value);
  const headers = new Headers();
  for (const name of FORWARDED_HEADERS) {
    const value = input.source.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("Origin", origin);
  headers.set("Sec-Fetch-Site", "same-origin");
  headers.set("X-Request-ID", input.requestId);
  // A multipart body must keep the boundary the runtime generates, so the
  // Content-Type header is only set for the JSON bodies.
  let body: BodyInit | undefined;
  if (method !== "GET") {
    if (input.form) {
      const form = new FormData();
      for (const [name, value] of Object.entries(input.form))
        form.set(name, value);
      body = form;
    } else {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(input.body || {});
    }
  }
  return new Request(url.toString(), { method, headers, body });
}

export async function callAdminApi(input: {
  source: Request;
  env: unknown;
  route: AdminApiRoute;
  requestId: string;
  method?: AdminApiMethod;
  body?: Record<string, unknown>;
  form?: Record<string, string>;
  query?: Record<string, string>;
  applicationId?: string;
  studentId?: string;
}) {
  const method = input.method || "POST";
  const handler = ROUTES[input.route].handlers[method];
  if (!handler)
    return {
      status: 405,
      body: {
        ok: false,
        error: "That administration endpoint does not accept this request.",
      } as Record<string, unknown>,
    };
  const request = internalAdminRequest(input);
  const response = await handler({
    request,
    env: input.env,
    params: {
      ...(input.applicationId ? { applicationId: input.applicationId } : {}),
      ...(input.studentId ? { id: input.studentId } : {}),
    },
  });
  let body: Record<string, unknown> = {};
  try {
    const parsed: unknown = await response.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      body = parsed as Record<string, unknown>;
  } catch {
    body = {};
  }
  return { status: response.status, body };
}
