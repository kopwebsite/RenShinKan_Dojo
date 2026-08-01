import {
  getAuthorizedAdminSession,
  isSameOriginRequest,
  jsonResponse,
  requiresCentralAdmin,
} from "../../../_lib/auth";
import {
  createRecentEventCampaign,
  getBrevoSubscriberCount,
  missingBrevoEnv,
  renderNewsletterCampaignHtml,
  sendRecentEventCampaignNow,
  type BrevoEnv,
} from "../../../_lib/brevo";
import type { EditableContent, RecentEvent } from "../../../_lib/content";
import {
  type StorageEnv,
  readEditableContentFromStorage,
} from "../../../_lib/storage";
import { publishEditableContent } from "../../../_lib/publishing";
import { newsletterPublicationIssues } from "../../../../shared/newsletter";
import {
  adminAuditMetadata,
  auditStatement,
  requestIdentifier,
  requireStudentDb,
  type StudentEnv,
} from "../../../_lib/studentRecords";
import { newsletterPublishingEnabled } from "../../../_lib/operationalControls";

type Env = StorageEnv & StudentEnv & BrevoEnv & { SESSION_SECRET?: string; NEWSLETTER_PUBLISHING_ENABLED?: string };

type DeliveryRow = {
  id: string;
  status: "pending" | "created" | "sent" | "failed_before_send" | "pending_verification";
  recipient_count: number | null;
  brevo_campaign_id: string | null;
  sent_at: string | null;
  error_message: string | null;
};

function updateNewsletterDelivery(content: EditableContent, id: string, newsletter: RecentEvent["newsletter"]) {
  return {
    ...content,
    recentEvents: content.recentEvents.map((event) =>
      event.id === id ? { ...event, notifySubscribers: true, newsletter } : event),
  };
}

async function existingDelivery(
  db: ReturnType<typeof requireStudentDb>,
  newsletterId: string,
  idempotencyKey: string,
) {
  return db.prepare(`SELECT id, status, recipient_count, brevo_campaign_id, sent_at, error_message
    FROM newsletter_deliveries
    WHERE idempotency_key = ? OR (
      newsletter_id = ? AND status IN ('pending', 'created', 'sent', 'pending_verification')
    )
    ORDER BY CASE WHEN idempotency_key = ? THEN 0 ELSE 1 END, created_at DESC
    LIMIT 1`)
    .bind(idempotencyKey, newsletterId, idempotencyKey)
    .first<DeliveryRow>();
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!isSameOriginRequest(request)) return jsonResponse({ ok: false, error: "Forbidden" }, 403);
  const session = await getAuthorizedAdminSession(request, env);
  if (!requiresCentralAdmin(session)) {
    return jsonResponse({ ok: false, error: "Only the RenShinKan administrator may send newsletters." }, session ? 403 : 401);
  }
  if (!newsletterPublishingEnabled(env)) return jsonResponse({ ok: false, error: "Newsletter delivery is temporarily paused. The saved draft is unchanged." }, 503);

  const missing = missingBrevoEnv(env);
  if (missing.length) return jsonResponse({ ok: false, error: "Subscriber email is not configured." }, 503);

  try {
    const input = await request.json<Record<string, unknown>>();
    const newsletterId = typeof input.newsletterId === "string" ? input.newsletterId : "";
    const idempotencyKey = typeof input.idempotencyKey === "string" ? input.idempotencyKey : "";
    const confirmedRecipientCount = typeof input.confirmedRecipientCount === "number"
      ? Math.round(input.confirmedRecipientCount)
      : -1;
    if (!newsletterId || !/^[A-Za-z0-9._:-]{16,160}$/.test(idempotencyKey) || input.confirmed !== true) {
      return jsonResponse({ ok: false, error: "The final send confirmation is incomplete." }, 400);
    }

    const content = await readEditableContentFromStorage(env);
    const newsletter = content.recentEvents.find((event) => event.id === newsletterId);
    if (!newsletter || (newsletter.lifecycleStatus ?? "active") !== "active") {
      return jsonResponse({ ok: false, error: "Newsletter not found." }, 404);
    }
    if (newsletter.newsletter?.status === "sent") {
      return jsonResponse({
        ok: true,
        alreadySent: true,
        status: "sent",
        sentAt: newsletter.newsletter.sentAt,
        recipientCount: confirmedRecipientCount >= 0 ? confirmedRecipientCount : null,
      });
    }
    const issues = newsletterPublicationIssues(newsletter).filter((issue) =>
      newsletter.published || issue !== "Create a web address.");
    if (issues.length) return jsonResponse({ ok: false, error: "Complete the newsletter before sending.", issues }, 400);

    const db = requireStudentDb(env);
    const previousDelivery = await existingDelivery(db, newsletterId, idempotencyKey);
    if (previousDelivery) {
      if (previousDelivery.status === "sent") {
        return jsonResponse({
          ok: true,
          alreadySent: true,
          status: previousDelivery.status,
          sentAt: previousDelivery.sent_at,
          recipientCount: previousDelivery.recipient_count,
        });
      }
      return jsonResponse({
        ok: false,
        duplicateBlocked: true,
        status: previousDelivery.status,
        error: previousDelivery.status === "pending_verification"
          ? "Delivery may already have occurred. Verify the Brevo campaign before trying anything else."
          : "This newsletter delivery is already in progress.",
      }, 409);
    }

    const recipientCount = await getBrevoSubscriberCount(env);
    if (recipientCount == null) {
      return jsonResponse({ ok: false, error: "The current recipient count could not be verified, so the newsletter was not sent." }, 503);
    }
    if (confirmedRecipientCount !== recipientCount) {
      return jsonResponse({
        ok: false,
        recipientCountChanged: true,
        recipientCount,
        error: `The subscriber count changed to ${recipientCount}. Review and confirm the send again.`,
      }, 409);
    }

    const now = new Date().toISOString();
    const deliveryId = `newsletter-delivery-${crypto.randomUUID()}`;
    const htmlContent = renderNewsletterCampaignHtml(env, newsletter);
    const subject = newsletter.emailSettings?.subject || newsletter.title;
    const previewText = newsletter.emailSettings?.previewText || newsletter.summary;
    const senderName = newsletter.emailSettings?.senderName || env.BREVO_SENDER_NAME || "RenShinKan Dojo";
    const replyTo = newsletter.emailSettings?.replyTo || env.BREVO_SENDER_EMAIL || "";
    const requestId = requestIdentifier(request);
    await db.prepare(`INSERT INTO newsletter_deliveries
      (id, newsletter_id, idempotency_key, status, subject, preview_text, sender_name, reply_to,
       recipient_count, snapshot_json, html_content, requested_by, request_id, created_at, updated_at)
      VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        deliveryId,
        newsletter.id,
        idempotencyKey,
        subject,
        previewText,
        senderName,
        replyTo,
        recipientCount,
        JSON.stringify(newsletter),
        htmlContent,
        session!.adminName.slice(0, 120),
        requestId,
        now,
        now,
      )
      .run();

    let campaignId: number | string;
    try {
      ({ campaignId } = await createRecentEventCampaign(env, newsletter));
      await db.prepare(`UPDATE newsletter_deliveries
        SET status = 'created', brevo_campaign_id = ?, updated_at = ? WHERE id = ?`)
        .bind(String(campaignId), new Date().toISOString(), deliveryId)
        .run();
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 240) : "Campaign creation failed";
      await db.prepare(`UPDATE newsletter_deliveries
        SET status = 'failed_before_send', error_message = ?, updated_at = ? WHERE id = ?`)
        .bind(message, new Date().toISOString(), deliveryId)
        .run();
      return jsonResponse({ ok: false, error: message }, 502);
    }

    try {
      await sendRecentEventCampaignNow(env, campaignId);
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 240) : "Campaign delivery needs verification";
      const failedAt = new Date().toISOString();
      await db.prepare(`UPDATE newsletter_deliveries
        SET status = 'pending_verification', error_message = ?, updated_at = ? WHERE id = ?`)
        .bind(message, failedAt, deliveryId)
        .run();
      const blockedContent = updateNewsletterDelivery(content, newsletter.id, {
        status: "failed",
        sentAt: null,
        brevoCampaignId: campaignId,
        error: "Delivery needs verification in Brevo. Do not retry from the website.",
      });
      await publishEditableContent({
        env, db, request, session: session!, content: blockedContent,
        action: "newsletter_delivery_pending_verification", source: "newsletter_editor",
        note: `Recorded uncertain Brevo delivery state for ${newsletter.title}`,
      });
      return jsonResponse({
        ok: false,
        duplicateBlocked: true,
        status: "pending_verification",
        error: "Brevo did not confirm delivery. Do not retry; verify the campaign in Brevo first.",
      }, 502);
    }

    const sentAt = new Date().toISOString();
    await db.batch([
      db.prepare(`UPDATE newsletter_deliveries
        SET status = 'sent', sent_at = ?, updated_at = ?, error_message = NULL WHERE id = ?`)
        .bind(sentAt, sentAt, deliveryId),
      auditStatement(db, {
        actorType: "administrator",
        ...adminAuditMetadata(session!, request),
        action: "newsletter_sent",
        entityType: "recent_event",
        entityId: newsletter.id,
        newValues: { campaignId, recipientCount, sentAt },
        source: "newsletter_editor",
        requestId,
        summary: `Newsletter sent to ${recipientCount} subscriber${recipientCount === 1 ? "" : "s"}: ${newsletter.title}`,
        createdAt: sentAt,
      }),
    ]);

    let storageWarning = "";
    try {
      await publishEditableContent({
        env, db, request, session: session!,
        content: updateNewsletterDelivery(content, newsletter.id, {
          status: "sent", sentAt, brevoCampaignId: campaignId, error: null,
        }),
        action: "newsletter_delivery_status_published", source: "newsletter_editor",
        note: `Published sent status for ${newsletter.title}`,
      });
    } catch (error) {
      storageWarning = `Email was sent, but website status reconciliation is required. Do not send it again. ${error instanceof Error ? error.message : ""}`.trim();
    }

    return jsonResponse({
      ok: true,
      status: "sent",
      sentAt,
      campaignId,
      recipientCount,
      warning: storageWarning || undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Newsletter could not be sent.";
    if (/UNIQUE constraint failed/i.test(message)) {
      return jsonResponse({
        ok: false,
        duplicateBlocked: true,
        error: "A newsletter delivery is already in progress or has already been sent.",
      }, 409);
    }
    return jsonResponse({ ok: false, error: message }, 500);
  }
};
