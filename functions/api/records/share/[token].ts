import { jsonResponse } from "../../../_lib/auth";
import { publicStudentRecord, requireStudentDb, sha256Hex, type StudentEnv } from "../../../_lib/studentRecords";

export const onRequestGet: PagesFunction<StudentEnv> = async ({ params, env }) => {
  const token = String(params.token || "");
  const headers = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) return jsonResponse({ error: "This shared record is unavailable." }, 404, headers);
  try {
    const db = requireStudentDb(env);
    const hash = await sha256Hex(token);
    const student = await db.prepare(`SELECT s.id, s.public_student_id, s.display_name, s.current_belt, s.belt_color, s.profile_image_url, s.profile_image_consent, s.public_visible, s.active, s.share_fields, s.dojo_name, s.training_hours_adjustment, s.updated_at
      FROM share_tokens st JOIN students s ON s.id = st.student_id
      WHERE st.token_hash = ? AND st.active = 1 AND (st.expires_at IS NULL OR st.expires_at > ?) AND s.active = 1 AND s.public_visible = 1 LIMIT 1`)
      .bind(hash, new Date().toISOString()).first<any>();
    if (!student) return jsonResponse({ error: "This shared record is unavailable." }, 404, headers);
    return jsonResponse({ record: await publicStudentRecord(db, student, true) }, 200, headers);
  } catch {
    return jsonResponse({ error: "This shared record is unavailable." }, 404, headers);
  }
};
