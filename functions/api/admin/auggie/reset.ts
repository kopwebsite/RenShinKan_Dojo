import { jsonResponse } from "../../../_lib/auth";
import {
  adminAuggieErrorResponse,
  parseBoundedJson,
  resetAdminAuggieFlowSession,
  type AdminAuggieEnv,
  type AdminAuggieLocale,
} from "../../../_lib/adminAuggie";

// resetAdminAuggieFlowSession rechecks getAuthorizedAdminSession and scope. It
// clears only the caller's own saved answers and never touches a record that
// has already been saved.

export const onRequestPost: PagesFunction<AdminAuggieEnv> = async ({
  request,
  env,
}) => {
  try {
    const body = await parseBoundedJson(request, ["locale", "currentPath"]);
    const locale: AdminAuggieLocale = body.locale === "th" ? "th" : "en";
    const currentPath =
      typeof body.currentPath === "string" ? body.currentPath : "/admin/dashboard";
    const result = await resetAdminAuggieFlowSession(
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
