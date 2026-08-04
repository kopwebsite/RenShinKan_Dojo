import { getAuthorizedAdminSession, isSameOriginRequest, jsonResponse, requiresCentralAdmin } from "../../_lib/auth";
import { adminAuditMetadata, auditStatement, requestIdentifier, requireStudentDb, type StudentEnv } from "../../_lib/studentRecords";

type Env = StudentEnv & { SESSION_SECRET?: string };

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, max + 1) : "";
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const session = await getAuthorizedAdminSession(request, env);
  if (!requiresCentralAdmin(session)) return jsonResponse({ error: "Only the RenShinKan administrator may manage dojos." }, session ? 403 : 401);
  const db = requireStudentDb(env);
  // Counts the same records the students screen counts, so "student records"
  // means one thing across the site.
  const rows = (await db.prepare(`SELECT d.*,
    (SELECT COUNT(*) FROM students s WHERE s.dojo_id = d.id
      AND s.deleted_at IS NULL AND s.profile_status <> 'rejected') AS student_count
    FROM dojos d ORDER BY d.sort_order, d.official_name COLLATE NOCASE`).all()).results || [];
  return jsonResponse({ dojos: rows.map((row) => {
    const value = row as Record<string, unknown>;
    try { value.contact = JSON.parse(String(value.contact_json || "{}")); } catch { value.contact = {}; }
    delete value.contact_json;
    return value;
  }) }, 200, { "Cache-Control": "no-store" });
};

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Forbidden" }, 403);
  const session = await getAuthorizedAdminSession(request, env);
  if (!requiresCentralAdmin(session)) return jsonResponse({ error: "Only the RenShinKan administrator may manage dojos." }, session ? 403 : 401);
  try {
    const body = await request.json<Record<string, unknown>>();
    const id = clean(body.id, 80);
    const officialName = clean(body.officialName, 160);
    const shortName = clean(body.shortName, 100);
    const code = clean(body.code, 8).toLocaleUpperCase("en-US");
    const slug = clean(body.slug, 100).toLocaleLowerCase("en-US");
    const logoUrl = clean(body.logoUrl, 300);
    const sortOrder = Number(body.sortOrder);
    const active = body.active === true ? 1 : 0;
    const contact = body.contact && typeof body.contact === "object" ? body.contact : {};
    if (!/^dojo-[a-z0-9-]+$/.test(id) || !officialName || !shortName || !/^[A-Z0-9]{2,8}$/.test(code)
      || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !/^\/[a-zA-Z0-9_./-]+$/.test(logoUrl)
      || !Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 10_000) {
      return jsonResponse({ error: "Check the dojo name, 2-8 character code, slug, logo path, and sort order." }, 400);
    }
    const contactJson = JSON.stringify(contact);
    if (contactJson.length > 5_000) return jsonResponse({ error: "Dojo contact details are too long." }, 400);
    const db = requireStudentDb(env);
    const before = await db.prepare("SELECT * FROM dojos WHERE id = ? LIMIT 1").bind(id).first<Record<string, unknown>>();
    if (!before) return jsonResponse({ error: "Dojo not found." }, 404);
    const now = new Date().toISOString();
    await db.batch([
      db.prepare(`UPDATE dojos SET official_name = ?, short_name = ?, code = ?, logo_url = ?, slug = ?,
        active = ?, sort_order = ?, contact_json = ?, updated_at = ? WHERE id = ?`)
        .bind(officialName, shortName, code, logoUrl, slug, active, sortOrder, contactJson, now, id),
      auditStatement(db, {
        actorType: "administrator", ...adminAuditMetadata(session!, request), action: "dojo_updated",
        entityType: "dojo", entityId: id, previousValues: before,
        newValues: { officialName, shortName, code, logoUrl, slug, active: Boolean(active), sortOrder, contact },
        source: "admin_dojo_settings", requestId: requestIdentifier(request), summary: `Updated ${officialName}`, createdAt: now,
      }),
    ]);
    return jsonResponse({ ok: true }, 200, { "Cache-Control": "no-store" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The dojo could not be updated.";
    return jsonResponse({ error: message.includes("UNIQUE") ? "The dojo code, name, or slug is already in use." : message }, message.includes("UNIQUE") ? 409 : 400);
  }
};
