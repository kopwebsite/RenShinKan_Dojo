import {
  getAuthorizedAdminSession,
  isSameOriginRequest,
  jsonResponse,
  requiresCentralAdmin,
} from "../../../_lib/auth";
import {
  createRecentEventCampaign,
  sendRecentEventCampaignTest,
  type BrevoEnv,
} from "../../../_lib/brevo";
import { type StorageEnv, readEditableContentFromStorage } from "../../../_lib/storage";
import {
  adminAuditMetadata,
  auditStatement,
  requestIdentifier,
  requireStudentDb,
  type StudentEnv,
} from "../../../_lib/studentRecords";

type Env = StorageEnv & StudentEnv & BrevoEnv & { SESSION_SECRET?: string };

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!isSameOriginRequest(request)) return jsonResponse({ ok: false, error: "Forbidden" }, 403);
  const session = await getAuthorizedAdminSession(request, env);
  if (!requiresCentralAdmin(session)) {
    return jsonResponse({ ok: false, error: "Only the RenShinKan administrator may send a test newsletter." }, session ? 403 : 401);
  }
  try {
    const input = await request.json<Record<string, unknown>>();
    const newsletterId = typeof input.newsletterId === "string" ? input.newsletterId : "";
    const email = typeof input.email === "string" ? input.email.trim().toLocaleLowerCase("en-US") : "";
    if (!newsletterId || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || input.confirmed !== true) {
      return jsonResponse({ ok: false, error: "Enter and confirm a valid test email address." }, 400);
    }
    const content = await readEditableContentFromStorage(env);
    const newsletter = content.recentEvents.find((event) => event.id === newsletterId);
    if (!newsletter) return jsonResponse({ ok: false, error: "Newsletter not found." }, 404);
    if (!newsletter.title.trim() || (!newsletter.body.trim() && !newsletter.bodyContent)) {
      return jsonResponse({ ok: false, error: "Add a title and newsletter body before sending a test." }, 400);
    }

    const { campaignId } = await createRecentEventCampaign(env, newsletter);
    await sendRecentEventCampaignTest(env, campaignId, email);
    const now = new Date().toISOString();
    const db = requireStudentDb(env);
    await auditStatement(db, {
      actorType: "administrator",
      ...adminAuditMetadata(session!, request),
      action: "newsletter_test_sent",
      entityType: "recent_event",
      entityId: newsletter.id,
      newValues: { campaignId, recipientDomain: email.split("@")[1] },
      source: "newsletter_editor",
      requestId: requestIdentifier(request),
      summary: `Test email sent for ${newsletter.title || "Untitled draft"}`,
      createdAt: now,
    }).run();
    return jsonResponse({ ok: true, sentAt: now });
  } catch (error) {
    return jsonResponse({ ok: false, error: error instanceof Error ? error.message : "Test email could not be sent." }, 500);
  }
};
