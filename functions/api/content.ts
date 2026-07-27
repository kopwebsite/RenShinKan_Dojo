import { jsonResponse } from "../_lib/auth";
import { type StorageEnv, readEditableContentFromStorage } from "../_lib/storage";
import type { D1Database } from "../_lib/studentRecords";
import { formatGregorianDateTime } from "../../shared/date";

type Env = StorageEnv & { STUDENT_DB?: D1Database };

function activeExamAnnouncement(value: string, venue: string) {
  const formatted = formatGregorianDateTime(value, value);
  return `Next belt examination: ${formatted}${venue ? ` at ${venue}` : ""}`;
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  if (!env.CONTENT_KV) {
    return jsonResponse(
      { ok: false, error: "Cloudflare CONTENT_KV binding is not configured" },
      503,
      { "Cache-Control": "no-store" },
    );
  }

  try {
    let content = await readEditableContentFromStorage(env);
    if (env.STUDENT_DB) {
      const cycle = await env.STUDENT_DB.prepare(`SELECT examination_at, venue, updated_at
        FROM examination_cycles
        WHERE status = 'active' AND examination_at IS NOT NULL AND examination_at <> ''
        ORDER BY created_at DESC LIMIT 1`)
        .first<{ examination_at: string; venue: string; updated_at: string | null }>();
      if (cycle) {
        content = {
          ...content,
          examAnnouncement: {
            text: activeExamAnnouncement(cycle.examination_at, cycle.venue),
            updatedAt: cycle.updated_at || cycle.examination_at,
          },
        };
      }
    }
    return jsonResponse(content, 200, { "Cache-Control": "no-store" });
  } catch (error) {
    return jsonResponse(
      { ok: false, error: error instanceof Error ? error.message : "Content is unavailable" },
      500,
      { "Cache-Control": "no-store" },
    );
  }
};
