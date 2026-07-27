import {
  getAuthorizedAdminSession,
  jsonResponse,
  requiresCentralAdmin,
} from "../../../_lib/auth";
import {
  getBrevoSubscriberCount,
  missingBrevoEnv,
  type BrevoEnv,
} from "../../../_lib/brevo";
import type { StudentEnv } from "../../../_lib/studentRecords";

type Env = StudentEnv & BrevoEnv & { SESSION_SECRET?: string };

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const session = await getAuthorizedAdminSession(request, env);
  if (!requiresCentralAdmin(session)) {
    return jsonResponse({ ok: false, error: "Only the RenShinKan administrator may view newsletter delivery details." }, session ? 403 : 401);
  }
  const missing = missingBrevoEnv(env);
  if (missing.length) {
    return jsonResponse({
      ok: true,
      configured: false,
      recipientCount: null,
      senderName: env.BREVO_SENDER_NAME || "RenShinKan Dojo",
      replyTo: env.BREVO_SENDER_EMAIL || "",
    }, 200, { "Cache-Control": "no-store" });
  }
  try {
    const recipientCount = await getBrevoSubscriberCount(env);
    return jsonResponse({
      ok: true,
      configured: true,
      recipientCount,
      senderName: env.BREVO_SENDER_NAME || "RenShinKan Dojo",
      replyTo: env.BREVO_SENDER_EMAIL || "",
    }, 200, { "Cache-Control": "no-store" });
  } catch (error) {
    return jsonResponse({
      ok: true,
      configured: true,
      recipientCount: null,
      senderName: env.BREVO_SENDER_NAME || "RenShinKan Dojo",
      replyTo: env.BREVO_SENDER_EMAIL || "",
      warning: error instanceof Error ? error.message : "Recipient count is unavailable.",
    }, 200, { "Cache-Control": "no-store" });
  }
};
