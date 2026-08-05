import { jsonResponse } from "../../../_lib/auth";
import {
  adminAuggieErrorResponse,
  getAdminAuggieFlowSession,
  type AdminAuggieEnv,
  type AdminAuggieLocale,
} from "../../../_lib/adminAuggie";

// getAdminAuggieFlowSession rechecks getAuthorizedAdminSession and scope. The
// saved conversation is bound to the account, the signed-in session and the
// selected dojo, so this can only ever return the caller's own work.

export const onRequestGet: PagesFunction<AdminAuggieEnv> = async ({
  request,
  env,
}) => {
  try {
    const url = new URL(request.url);
    const locale: AdminAuggieLocale =
      url.searchParams.get("locale") === "th" ? "th" : "en";
    const currentPath = url.searchParams.get("currentPath") || "/admin/dashboard";
    const result = await getAdminAuggieFlowSession(
      request,
      env,
      locale,
      currentPath,
    );
    return jsonResponse({ ok: true, ...result }, 200, {
      "Cache-Control": "private, no-store",
    });
  } catch (error) {
    return adminAuggieErrorResponse(error, request);
  }
};
