import { jsonResponse } from "../../../_lib/auth";
import {
  adminAuggieErrorResponse,
  getAdminAuggieOperation,
  type AdminAuggieEnv,
  type AdminAuggieLocale,
} from "../../../_lib/adminAuggie";

// getAdminAuggieOperation rechecks getAuthorizedAdminSession and scope.

export const onRequestGet: PagesFunction<AdminAuggieEnv> = async ({
  request,
  env,
}) => {
  try {
    const url = new URL(request.url);
    const operationId = url.searchParams.get("operationId") || "";
    const locale: AdminAuggieLocale =
      url.searchParams.get("locale") === "th" ? "th" : "en";
    const response = await getAdminAuggieOperation(
      request,
      env,
      operationId,
      locale,
    );
    return jsonResponse({ ok: true, ...response }, 200, {
      "Cache-Control": "private, no-store",
    });
  } catch (error) {
    return adminAuggieErrorResponse(error, request);
  }
};
