import { isSameOriginRequest, jsonResponse } from "../../_lib/auth";

export const onRequestPost: PagesFunction = async ({ request }) => {
  if (!isSameOriginRequest(request))
    return jsonResponse({ error: "Forbidden" }, 403);
  return jsonResponse(
    {
      error:
        "Dojo-context switching is no longer available. Use the dojo filter in RenShinKan administration.",
    },
    410,
  );
};
