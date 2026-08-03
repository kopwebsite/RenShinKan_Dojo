import { jsonResponse } from "../../../_lib/auth";
import {
  adminAuggieErrorResponse,
  confirmAdminAuggieOperation,
  parseBoundedJson,
  type AdminAuggieEnv,
  type AdminAuggieLocale,
} from "../../../_lib/adminAuggie";

// confirmAdminAuggieOperation rechecks getAuthorizedAdminSession and scope.

export const onRequestPost: PagesFunction<AdminAuggieEnv> = async ({
  request,
  env,
}) => {
  try {
    const body = await parseBoundedJson(request, [
      "operationId",
      "phrase",
      "locale",
    ]);
    const operationId =
      typeof body.operationId === "string" ? body.operationId : "";
    const phrase = typeof body.phrase === "string" ? body.phrase : "";
    const locale: AdminAuggieLocale = body.locale === "th" ? "th" : "en";
    const result = await confirmAdminAuggieOperation(
      request,
      env,
      operationId,
      phrase,
      locale,
    );
    return jsonResponse({ ok: true, result }, 200, {
      "Cache-Control": "private, no-store",
    });
  } catch (error) {
    return adminAuggieErrorResponse(error, request);
  }
};
