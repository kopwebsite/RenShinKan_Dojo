import { jsonResponse } from "../_lib/auth";
import { type StorageEnv, readEditableContentFromStorage } from "../_lib/storage";

export async function onRequestGet({ env }: { env: StorageEnv }) {
  if (!env.CONTENT_KV) {
    return jsonResponse(
      { ok: false, error: "Cloudflare CONTENT_KV binding is not configured" },
      503,
      { "Cache-Control": "no-store" },
    );
  }

  try {
    const content = await readEditableContentFromStorage(env);
    return jsonResponse(content, 200, { "Cache-Control": "no-store" });
  } catch (error) {
    return jsonResponse(
      { ok: false, error: error instanceof Error ? error.message : "Content is unavailable" },
      500,
      { "Cache-Control": "no-store" },
    );
  }
}
