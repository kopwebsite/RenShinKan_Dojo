import {
  getAuthorizedAdminSession,
  isSameOriginRequest,
  jsonResponse,
  requiresCentralAdmin,
} from "../../../_lib/auth";
import {
  type StorageEnv,
  readEditableContentFromStorage,
  writeEditableContentToStorage,
} from "../../../_lib/storage";
import {
  adminAuditMetadata,
  auditStatement,
  requestIdentifier,
  requireStudentDb,
  type StudentEnv,
} from "../../../_lib/studentRecords";

type Env = StorageEnv & StudentEnv & { SESSION_SECRET?: string };

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!isSameOriginRequest(request)) return jsonResponse({ ok: false, error: "Forbidden" }, 403);
  const session = await getAuthorizedAdminSession(request, env);
  if (!requiresCentralAdmin(session)) {
    return jsonResponse({ ok: false, error: "Only the RenShinKan administrator may manage newsletters." }, session ? 403 : 401);
  }
  try {
    const input = await request.json<Record<string, unknown>>();
    if (input.action !== "delete" || input.confirmed !== true || typeof input.newsletterId !== "string") {
      return jsonResponse({ ok: false, error: "Invalid newsletter action." }, 400);
    }
    const content = await readEditableContentFromStorage(env);
    const newsletter = content.recentEvents.find((event) => event.id === input.newsletterId);
    if (!newsletter) return jsonResponse({ ok: false, error: "Newsletter not found." }, 404);
    if (newsletter.lifecycleStatus !== "trash") {
      return jsonResponse({ ok: false, error: "Only newsletters already in Trash may be permanently deleted." }, 409);
    }
    const now = new Date().toISOString();
    await writeEditableContentToStorage(env, {
      ...content,
      recentEvents: content.recentEvents.filter((event) => event.id !== newsletter.id),
      lastPublishedAt: now,
    });
    const db = requireStudentDb(env);
    await auditStatement(db, {
      actorType: "administrator",
      ...adminAuditMetadata(session!, request),
      action: "newsletter_permanently_deleted",
      entityType: "recent_event",
      entityId: newsletter.id,
      previousValues: { title: newsletter.title, slug: newsletter.slug, newsletter: newsletter.newsletter },
      source: "newsletter_library",
      requestId: requestIdentifier(request),
      summary: `Permanently deleted trashed newsletter: ${newsletter.title || "Untitled draft"}`,
      createdAt: now,
    }).run();
    return jsonResponse({ ok: true });
  } catch (error) {
    return jsonResponse({ ok: false, error: error instanceof Error ? error.message : "Newsletter action failed." }, 500);
  }
};
