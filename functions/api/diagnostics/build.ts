import { jsonResponse } from "../../_lib/auth";

type Env = { BUILD_ID?: string };

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const buildId = env.BUILD_ID && /^[A-Za-z0-9._-]{7,64}$/.test(env.BUILD_ID)
    ? env.BUILD_ID
    : "not-configured";
  return jsonResponse({ buildId }, 200, {
    "Cache-Control": "private, no-store",
    "X-Build-ID": buildId,
  });
};
