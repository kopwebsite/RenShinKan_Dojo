import { getAuthorizedAdminSession, isSameOriginRequest, jsonResponse, requiresCentralAdmin } from "../../_lib/auth";
import { validateEditableContent, type EditableContent } from "../../_lib/content";
import { readEditableContentFromStorage, writeEditableContentToStorage, type StorageEnv } from "../../_lib/storage";
import { adminAuditMetadata, auditStatement, requestIdentifier, requireStudentDb, type StudentEnv } from "../../_lib/studentRecords";

type Env = StudentEnv & StorageEnv & { SESSION_SECRET?: string };

async function currentOrEmpty(env: Env) {
  try { return await readEditableContentFromStorage(env); }
  catch {
    return validateEditableContent({ version: 1, lastPublishedAt: null, recentEvents: [], examAnnouncement: null, historyMedia: [], onTheMatMedia: [], passedTestStudents: [], sitePages: [], siteSettings: {} });
  }
}

function mergeSiteContent(base: EditableContent, input: unknown) {
  if (!input || typeof input !== "object") throw new Error("Site content is required.");
  const value = input as Record<string, unknown>;
  const pages = Array.isArray(value.sitePages) ? value.sitePages : [];
  return validateEditableContent({ ...base, sitePages: pages, siteSettings: value.siteSettings, lastPublishedAt: base.lastPublishedAt });
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const session = await getAuthorizedAdminSession(request, env);
  if (!requiresCentralAdmin(session)) return jsonResponse({ error: "Only the RenShinKan administrator may edit the website." }, session ? 403 : 401);
  const db = requireStudentDb(env);
  const [draft, revisions] = await Promise.all([
    db.prepare("SELECT content_json, updated_by, updated_at FROM site_content_drafts WHERE id = 'current'").first<{ content_json: string; updated_by: string; updated_at: string }>(),
    db.prepare(`SELECT id, revision_number, published_by, published_at, source_revision_id, note
      FROM site_revisions ORDER BY revision_number DESC LIMIT 50`).all(),
  ]);
  const content = draft ? validateEditableContent(JSON.parse(draft.content_json)) : await currentOrEmpty(env);
  return jsonResponse({ content, draftMeta: draft ? { updatedBy: draft.updated_by, updatedAt: draft.updated_at } : null, revisions: revisions.results || [] }, 200, { "Cache-Control": "no-store" });
};

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Forbidden" }, 403);
  const session = await getAuthorizedAdminSession(request, env);
  if (!requiresCentralAdmin(session)) return jsonResponse({ error: "Only the RenShinKan administrator may edit the website." }, session ? 403 : 401);
  try {
    const body = await request.json<{ content?: unknown }>();
    const base = await currentOrEmpty(env);
    const content = mergeSiteContent(base, body.content);
    const serialized = JSON.stringify(content);
    if (serialized.length > 900_000) return jsonResponse({ error: "The site draft is too large. Reduce block text or gallery items." }, 413);
    const db = requireStudentDb(env);
    const now = new Date().toISOString();
    await db.batch([
      db.prepare(`INSERT INTO site_content_drafts (id, content_json, updated_by, updated_at)
        VALUES ('current', ?, ?, ?) ON CONFLICT(id) DO UPDATE SET content_json = excluded.content_json,
        updated_by = excluded.updated_by, updated_at = excluded.updated_at`).bind(serialized, session!.adminName, now),
      auditStatement(db, {
        actorType: "administrator", ...adminAuditMetadata(session!, request), action: "site_draft_saved",
        entityType: "site_content", entityId: "current", newValues: { pageCount: content.sitePages.length },
        source: "admin_site_editor", requestId: requestIdentifier(request), summary: "Saved website content draft", createdAt: now,
      }),
    ]);
    return jsonResponse({ ok: true, updatedAt: now, content }, 200, { "Cache-Control": "no-store" });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "The site draft could not be saved." }, 400);
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Forbidden" }, 403);
  const session = await getAuthorizedAdminSession(request, env);
  if (!requiresCentralAdmin(session)) return jsonResponse({ error: "Only the RenShinKan administrator may publish the website." }, session ? 403 : 401);
  try {
    const body = await request.json<{ action?: unknown; confirmed?: unknown; revisionId?: unknown; note?: unknown }>();
    if (body.confirmed !== true || (body.action !== "publish" && body.action !== "rollback")) return jsonResponse({ error: "Confirm the website publish action." }, 400);
    const db = requireStudentDb(env);
    const sourceRevisionId = body.action === "rollback" && typeof body.revisionId === "string" ? body.revisionId : null;
    let content: EditableContent;
    if (sourceRevisionId) {
      const revision = await db.prepare("SELECT content_json FROM site_revisions WHERE id = ? LIMIT 1").bind(sourceRevisionId).first<{ content_json: string }>();
      if (!revision) return jsonResponse({ error: "Revision not found." }, 404);
      content = validateEditableContent(JSON.parse(revision.content_json));
    } else {
      const draft = await db.prepare("SELECT content_json FROM site_content_drafts WHERE id = 'current'").first<{ content_json: string }>();
      if (!draft) return jsonResponse({ error: "Save a website draft before publishing." }, 409);
      content = validateEditableContent(JSON.parse(draft.content_json));
    }
    const now = new Date().toISOString();
    content = validateEditableContent({ ...content, lastPublishedAt: now,
      sitePages: content.sitePages.map((page) => page.status === "published" ? { ...page, publishedAt: now, publishedBy: session!.adminName } : page) });
    await writeEditableContentToStorage(env, content);
    const numberRow = await db.prepare("SELECT COALESCE(MAX(revision_number), 0) + 1 AS next_number FROM site_revisions").first<{ next_number: number }>();
    const revisionId = crypto.randomUUID();
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";
    await db.batch([
      db.prepare(`INSERT INTO site_revisions
        (id, revision_number, content_json, published_by, published_at, source_revision_id, note)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .bind(revisionId, Number(numberRow?.next_number || 1), JSON.stringify(content), session!.adminName, now, sourceRevisionId, note),
      db.prepare(`INSERT INTO site_content_drafts (id, content_json, updated_by, updated_at)
        VALUES ('current', ?, ?, ?) ON CONFLICT(id) DO UPDATE SET content_json = excluded.content_json,
        updated_by = excluded.updated_by, updated_at = excluded.updated_at`).bind(JSON.stringify(content), session!.adminName, now),
      auditStatement(db, {
        actorType: "administrator", ...adminAuditMetadata(session!, request),
        action: sourceRevisionId ? "site_revision_rolled_back" : "site_content_published",
        entityType: "site_revision", entityId: revisionId,
        previousValues: sourceRevisionId ? { sourceRevisionId } : null,
        newValues: { revisionNumber: Number(numberRow?.next_number || 1), pageCount: content.sitePages.length },
        source: "admin_site_editor", requestId: requestIdentifier(request),
        summary: sourceRevisionId ? `Published rollback of revision ${sourceRevisionId}` : "Published website content", createdAt: now,
      }),
    ]);
    return jsonResponse({ ok: true, revisionId, revisionNumber: Number(numberRow?.next_number || 1), publishedAt: now, content }, 200, { "Cache-Control": "no-store" });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "The website could not be published." }, 400);
  }
};
