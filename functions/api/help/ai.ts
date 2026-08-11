import { isSameOriginRequest, jsonResponse } from "../../_lib/auth";
import {
  converseWithPublicHelp,
  PublicHelpRequestError,
  publicOperationalGrounding,
  readPublicHelpRequest,
  restrictedPublicHelpAnswer,
  restrictedPublicHelpRequest,
  unverifiedScheduleAnswer,
  type PublicHelpEnvironment,
} from "../../_lib/publicHelpAi";
import { consumeRateLimit } from "../../_lib/rateLimit";

const RATE_LIMIT_RULE = {
  endpoint: "public-help-ai",
  limit: 30,
  windowSeconds: 10 * 60,
  lockSeconds: 10 * 60,
} as const;

function hasSameOriginEvidence(request: Request) {
  if (!isSameOriginRequest(request)) return false;
  if (request.headers.get("Origin")) return true;
  if (request.headers.get("Referer")) return true;
  return request.headers.get("Sec-Fetch-Site") === "same-origin";
}

function unavailable(status: 429 | 503, headers: HeadersInit = {}) {
  return jsonResponse({ outcome: "unavailable" }, status, headers);
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!hasSameOriginEvidence(request)) {
    return jsonResponse({ outcome: "unavailable" }, 403);
  }

  let input: Awaited<ReturnType<typeof readPublicHelpRequest>>;
  try {
    input = await readPublicHelpRequest(request);
  } catch (error) {
    if (error instanceof PublicHelpRequestError) {
      return jsonResponse({ outcome: "unavailable" }, error.status);
    }
    return unavailable(503);
  }

  try {
    const allowed = await consumeRateLimit(request, env, RATE_LIMIT_RULE);
    if (!allowed) {
      return unavailable(429, { "Retry-After": "600" });
    }
  } catch {
    return unavailable(503);
  }

  const restriction = restrictedPublicHelpRequest(input.message);
  if (restriction)
    return jsonResponse(restrictedPublicHelpAnswer(input, restriction));
  if (!env.AI) return unavailable(503);

  try {
    const grounding = await publicOperationalGrounding(
      env as PublicHelpEnvironment,
      input.locale,
      input.page,
    );
    const scheduleAnswer = unverifiedScheduleAnswer(input, grounding);
    if (scheduleAnswer) return jsonResponse(scheduleAnswer);
    const answer = await converseWithPublicHelp(env.AI, input, grounding);
    return answer ? jsonResponse(answer) : unavailable(503);
  } catch {
    return unavailable(503);
  }
};

export const onRequestGet: PagesFunction = async () =>
  jsonResponse({ outcome: "unavailable" }, 405, { Allow: "POST" });
