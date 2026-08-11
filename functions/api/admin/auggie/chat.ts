import { jsonResponse } from "../../../_lib/auth";
import {
  adminAuggieErrorResponse,
  getAdminAuggieUsage,
  handleAdminAuggieChat,
  type AdminAuggieEnv,
} from "../../../_lib/adminAuggie";

// handleAdminAuggieChat enforces getAuthorizedAdminSession before inference.

export const onRequestPost: PagesFunction<AdminAuggieEnv> = async ({
  request,
  env,
}) => {
  try {
    const response = await handleAdminAuggieChat(request, env);
    const usage = await getAdminAuggieUsage(request, env);
    return jsonResponse({ ok: true, response, usage }, 200, {
      "Cache-Control": "private, no-store",
    });
  } catch (error) {
    return adminAuggieErrorResponse(error, request);
  }
};
