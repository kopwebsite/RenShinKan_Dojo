import { getAuthorizedAdminSession, isSameOriginRequest, jsonResponse, requiresCentralAdmin } from "../../_lib/auth";
import {
  type EditableContent,
  type RecentEvent,
  replacePendingMediaUrls,
  validateEditableContent,
} from "../../_lib/content";
import {
  type StorageEnv,
  getUploadFiles,
  readEditableContentFromStorage,
  uploadFilesToR2,
} from "../../_lib/storage";
import { publishEditableContent } from "../../_lib/publishing";
import { adminAuditMetadata, auditStatement, requestIdentifier, requireStudentDb, type StudentEnv } from "../../_lib/studentRecords";
import { syncLegacyGalleryArrays } from "../../../shared/gallery";
import { uploadsEnabled } from "../../_lib/operationalControls";

type Env = StorageEnv & StudentEnv & {
  SESSION_SECRET?: string;
  SITE_URL?: string;
  BREVO_API_KEY?: string;
  BREVO_LIST_ID?: string;
  BREVO_SENDER_EMAIL?: string;
  BREVO_SENDER_NAME?: string;
  UPLOADS_ENABLED?: string;
};

const MAX_FILES = 10;

async function readPreviousContent(env: Env) {
  return readEditableContentFromStorage(env);
}

function newsletterCandidates(content: EditableContent, previousById: Map<string, RecentEvent>) {
  return content.recentEvents.filter((event) => {
    const previous = previousById.get(event.id);
    return event.published && event.notifySubscribers === true && event.newsletter?.status !== "sent" && previous?.newsletter?.status !== "sent";
  });
}

function preservePreviouslySentNewsletters(content: EditableContent, previousById: Map<string, RecentEvent>) {
  return {
    ...content,
    recentEvents: content.recentEvents.map((event) => {
      const previous = previousById.get(event.id);

      if (previous?.newsletter?.status === "sent") {
        return {
          ...event,
          newsletter: previous.newsletter,
        };
      }

      return {
        ...event,
        notifySubscribers: event.notifySubscribers === true,
        newsletter: event.newsletter ?? {
          status: "not_sent" as const,
          sentAt: null,
          brevoCampaignId: null,
          error: null,
        },
      };
    }),
  };
}

async function publishNewsletterCandidates(_env: Env, content: EditableContent, candidates: RecentEvent[]) {
  const nextContent = content;
  const warnings: string[] = [];
  for (const candidate of candidates) {
    warnings.push(`${candidate.title || "Untitled draft"} was saved, but email was not sent. Use the newsletter editor's final confirmation screen to send it safely.`);
  }

  return { content: nextContent, warnings };
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!isSameOriginRequest(request)) {
    return jsonResponse({ ok: false, error: "Forbidden" }, 403);
  }

  const session = await getAuthorizedAdminSession(request, env);
  if (!requiresCentralAdmin(session)) return jsonResponse({ ok: false, error: "Only the RenShinKan administrator may publish website content or newsletters." }, session ? 403 : 401);

  if (!env.CONTENT_KV) {
    return jsonResponse({ ok: false, error: "Cloudflare CONTENT_KV binding is not configured" }, 500);
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return jsonResponse({ ok: false, error: "Expected multipart/form-data" }, 400);
  }

  const contentField = formData.get("content");

  if (typeof contentField !== "string") {
    return jsonResponse({ ok: false, error: "Missing content field" }, 400);
  }

  const files = getUploadFiles(formData);

  if (files.length > 0 && !uploadsEnabled(env)) {
    return jsonResponse({ ok: false, error: "Uploads are temporarily paused. Remove new files and publish again; existing content is unchanged." }, 503);
  }

  if (files.length > MAX_FILES) {
    return jsonResponse({ ok: false, error: "At most 10 files can be uploaded per publish" }, 400);
  }

  let parsedContent: EditableContent;

  try {
    parsedContent = validateEditableContent(JSON.parse(contentField));
  } catch (error) {
    return jsonResponse(
      { ok: false, error: error instanceof Error ? error.message : "Invalid content" },
      400,
    );
  }

  try {
    const previousContent = await readPreviousContent(env);
    const previousById = new Map(previousContent.recentEvents.map((event) => [event.id, event]));
    const { uploadUrlByPendingId, fallbackUrls, uploaded } = await uploadFilesToR2(env, files);
    let content = replacePendingMediaUrls(parsedContent, uploadUrlByPendingId, fallbackUrls);

    content = preservePreviouslySentNewsletters(
      {
        ...content,
        // Gallery drafts publish through the dedicated, optimistic-concurrency
        // endpoint. A long-open newsletter tab must never overwrite albums.
        galleryAlbums: previousContent.galleryAlbums,
        lastPublishedAt: new Date().toISOString(),
      },
      previousById,
    );
    content = syncLegacyGalleryArrays(content) as EditableContent;

    const candidates = newsletterCandidates(content, previousById);
    const newsletterResult = await publishNewsletterCandidates(env, content, candidates);
    content = newsletterResult.content;

    const now = new Date().toISOString();
    const db = requireStudentDb(env);
    const published = await publishEditableContent({
      env, db, request, session: session!, content,
      action: "public_content_published", source: "admin_content_publish",
      note: `Published public content; ${uploaded.length} upload(s), ${candidates.length} newsletter candidate(s)`,
    });
    if (candidates.length) await db.batch(candidates.map((event) => auditStatement(db, { actorType: "administrator", ...adminAuditMetadata(session!, request),
        action: "newsletter_send_deferred", entityType: "recent_event", entityId: event.id,
        newValues: content.recentEvents.find((item) => item.id === event.id)?.newsletter || null,
        source: "admin_content_publish", requestId: requestIdentifier(request), summary: `Newsletter email deferred for explicit confirmation: ${event.title}`, createdAt: now })));

    return jsonResponse({
      ok: true,
      content,
      uploaded,
      warnings: newsletterResult.warnings,
      publishOperation: published,
    });
  } catch (error) {
    return jsonResponse(
      { ok: false, error: error instanceof Error ? error.message : "Publish failed" },
      500,
    );
  }
};
