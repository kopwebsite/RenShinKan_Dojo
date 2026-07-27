import {
  getAuthorizedAdminSession,
  isSameOriginRequest,
  jsonResponse,
  requiresCentralAdmin,
} from "../../../_lib/auth";
import {
  type EditableContent,
  type RecentEvent,
  replacePendingMediaUrls,
  validateEditableContent,
} from "../../../_lib/content";
import {
  type StorageEnv,
  getUploadFiles,
  readEditableContentFromStorage,
  uploadFilesToR2,
  writeEditableContentToStorage,
} from "../../../_lib/storage";
import { newsletterPublicationIssues } from "../../../../shared/newsletter";
import { requireStudentDb, type StudentEnv } from "../../../_lib/studentRecords";

type Env = StorageEnv & StudentEnv & { SESSION_SECRET?: string };

const MAX_FILES = 10;
const MAX_EVENT_BYTES = 900_000;

function withNewsletter(
  content: EditableContent,
  value: unknown,
): EditableContent {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Newsletter draft must be an object");
  const id = typeof (value as Record<string, unknown>).id === "string"
    ? (value as Record<string, unknown>).id as string
    : "";
  if (!id) throw new Error("Newsletter draft is missing its identifier");
  const currentIndex = content.recentEvents.findIndex((event) => event.id === id);
  const recentEvents = [...content.recentEvents];
  if (currentIndex >= 0) recentEvents[currentIndex] = value as RecentEvent;
  else recentEvents.unshift(value as RecentEvent);
  return validateEditableContent({ ...content, recentEvents });
}

function preserveHistoricalDelivery(next: RecentEvent, previous: RecentEvent | undefined) {
  if (previous?.newsletter?.status !== "sent") return next;
  return {
    ...next,
    notifySubscribers: previous.notifySubscribers,
    newsletter: previous.newsletter,
  };
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!isSameOriginRequest(request)) return jsonResponse({ ok: false, error: "Forbidden" }, 403);
  const session = await getAuthorizedAdminSession(request, env);
  if (!requiresCentralAdmin(session)) {
    return jsonResponse({ ok: false, error: "Only the RenShinKan administrator may save newsletters." }, session ? 403 : 401);
  }
  if (!env.CONTENT_KV) return jsonResponse({ ok: false, error: "Cloudflare content storage is unavailable." }, 503);

  try {
    const formData = await request.formData();
    const eventField = formData.get("event");
    if (typeof eventField !== "string" || eventField.length > MAX_EVENT_BYTES) {
      return jsonResponse({ ok: false, error: "Newsletter draft is missing or too large." }, 400);
    }
    const files = getUploadFiles(formData);
    if (files.length > MAX_FILES) return jsonResponse({ ok: false, error: "Add at most 10 files per save." }, 400);

    const current = await readEditableContentFromStorage(env);
    const rawEvent = JSON.parse(eventField) as Record<string, unknown>;
    const id = typeof rawEvent.id === "string" ? rawEvent.id : "";
    const previous = current.recentEvents.find((event) => event.id === id);
    const expectedUpdatedAt = typeof formData.get("expectedUpdatedAt") === "string"
      ? String(formData.get("expectedUpdatedAt"))
      : "";
    if (previous && expectedUpdatedAt && previous.updatedAt !== expectedUpdatedAt) {
      return jsonResponse({
        ok: false,
        conflict: true,
        error: "This newsletter was changed in another tab. Reload it before saving again.",
        event: previous,
      }, 409);
    }

    const now = new Date().toISOString();
    rawEvent.updatedAt = now;
    rawEvent.createdAt = typeof rawEvent.createdAt === "string" && rawEvent.createdAt ? rawEvent.createdAt : now;
    if (rawEvent.published === true && previous?.published !== true) rawEvent.publishedAt = now;

    const previousSlug = previous?.slug || "";
    const nextSlug = typeof rawEvent.slug === "string" ? rawEvent.slug : "";
    const confirmedSlugChange = formData.get("confirmSlugChange") === "true";
    if (previous?.published && previousSlug && nextSlug !== previousSlug) {
      if (!confirmedSlugChange) {
        return jsonResponse({
          ok: false,
          error: "Confirm the published web-address change before saving.",
          requiresSlugConfirmation: true,
        }, 409);
      }
      const history = Array.isArray(rawEvent.slugHistory) ? rawEvent.slugHistory : [];
      rawEvent.slugHistory = [...new Set([previousSlug, ...history])];
    }

    let next = withNewsletter(current, rawEvent);
    let event = next.recentEvents.find((item) => item.id === id)!;
    event = preserveHistoricalDelivery(event, previous);
    next = {
      ...next,
      version: 3,
      lastPublishedAt:
        previous?.published !== event.published ||
        previous?.showInCommunityCalendar !== event.showInCommunityCalendar
          ? now
          : current.lastPublishedAt,
      recentEvents: next.recentEvents.map((item) => item.id === id ? event : item),
    };

    const duplicateSlug = event.slug
      ? next.recentEvents.find((item) =>
          item.id !== event.id &&
          (item.slug === event.slug || item.slugHistory?.includes(event.slug)))
      : undefined;
    if (duplicateSlug) return jsonResponse({ ok: false, error: "That web address is already used by another newsletter." }, 409);
    if (event.published) {
      const issues = newsletterPublicationIssues(event);
      if (issues.length) return jsonResponse({ ok: false, error: "Complete the required publishing details.", issues }, 400);
    }

    const { uploadUrlByPendingId, fallbackUrls, uploaded } = await uploadFilesToR2(env, files);
    next = replacePendingMediaUrls(next, uploadUrlByPendingId, fallbackUrls);
    event = next.recentEvents.find((item) => item.id === id)!;
    await writeEditableContentToStorage(env, next);

    let warning = "";
    try {
      const db = requireStudentDb(env);
      const revisionId = `newsletter-revision-${crypto.randomUUID()}`;
      await db.batch([
        db.prepare(`INSERT INTO newsletter_revisions
          (id, newsletter_id, revision, event_json, saved_by, created_at)
          SELECT ?, ?, COALESCE(MAX(revision), 0) + 1, ?, ?, ?
          FROM newsletter_revisions WHERE newsletter_id = ?`)
          .bind(revisionId, id, JSON.stringify(event), session!.adminName.slice(0, 120), now, id),
        db.prepare(`DELETE FROM newsletter_revisions
          WHERE newsletter_id = ? AND id NOT IN (
            SELECT id FROM newsletter_revisions WHERE newsletter_id = ? ORDER BY revision DESC LIMIT 10
          )`).bind(id, id),
      ]);
    } catch {
      warning = "The draft was saved, but its recovery-history snapshot could not be recorded.";
    }

    return jsonResponse({ ok: true, event, uploaded, savedAt: now, warning: warning || undefined });
  } catch (error) {
    return jsonResponse({ ok: false, error: error instanceof Error ? error.message : "Newsletter could not be saved." }, 500);
  }
};
