import { jsonResponse } from "../../../_lib/auth";
import {
  adminAuggieErrorResponse,
  parseBoundedJson,
  prepareAdminAuggieUndo,
  type AdminAuggieEnv,
  type AdminAuggieLocale,
} from "../../../_lib/adminAuggie";

// prepareAdminAuggieUndo rechecks getAuthorizedAdminSession and scope.

export const onRequestPost: PagesFunction<AdminAuggieEnv> = async ({
  request,
  env,
}) => {
  try {
    const body = await parseBoundedJson(request, ["operationId", "locale"]);
    const operationId =
      typeof body.operationId === "string" ? body.operationId : "";
    const locale: AdminAuggieLocale = body.locale === "th" ? "th" : "en";
    const response = await prepareAdminAuggieUndo(
      request,
      env,
      operationId,
      locale,
    );
    return jsonResponse({ ok: true, response }, 200, {
      "Cache-Control": "private, no-store",
    });
  } catch (error) {
    return adminAuggieErrorResponse(error, request);
  }
};
