import { isSameOriginRequest, jsonResponse } from "../../_lib/auth";
import {
  classifyPublicHelpQuestion,
  containsPrivateHelpInput,
  PublicHelpRequestError,
  readPublicHelpRequest,
} from "../../_lib/publicHelpAi";
import { consumeRateLimit } from "../../_lib/rateLimit";

const RATE_LIMIT_RULE = {
  endpoint: "public-help-ai",
  limit: 10,
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

  if (containsPrivateHelpInput(input.question)) {
    return jsonResponse({ outcome: "private" });
  }
  if (!env.AI) return unavailable(503);

  try {
    const classification = await classifyPublicHelpQuestion(
      env.AI,
      input.question,
      input.locale,
    );
    if (!classification) return unavailable(503);
    if (classification.decision === "match") {
      return jsonResponse({
        outcome: "match",
        topicId: classification.topicId,
      });
    }
    return jsonResponse({ outcome: classification.decision });
  } catch {
    return unavailable(503);
  }
};

export const onRequestGet: PagesFunction = async () =>
  jsonResponse({ outcome: "unavailable" }, 405, { Allow: "POST" });
