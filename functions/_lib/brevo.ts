import type { RecentEvent } from "./content";

type BrevoEnv = {
  BREVO_API_KEY?: string;
  BREVO_LIST_ID?: string;
  BREVO_SENDER_EMAIL?: string;
  BREVO_SENDER_NAME?: string;
  SITE_URL?: string;
};

function isConfigured(value: string | undefined) {
  return Boolean(value && !value.startsWith("PLACEHOLDER"));
}

export function missingBrevoEnv(env: BrevoEnv) {
  return [
    "BREVO_API_KEY",
    "BREVO_LIST_ID",
    "BREVO_SENDER_EMAIL",
    "SITE_URL",
  ].filter((key) => !isConfigured(env[key as keyof BrevoEnv]));
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function eventUrl(env: BrevoEnv, event: RecentEvent) {
  const baseUrl = (env.SITE_URL || "").replace(/\/+$/, "");
  return `${baseUrl}/newsletter#${encodeURIComponent(event.slug)}`;
}

function campaignHtml(env: BrevoEnv, event: RecentEvent) {
  const link = eventUrl(env, event);

  return `<!doctype html>
<html>
  <body style="font-family: Arial, sans-serif; color: #2f2a24; line-height: 1.6;">
    <h1>${escapeHtml(event.title)}</h1>
    <p><strong>${escapeHtml(event.date)}</strong></p>
    <p>${escapeHtml(event.summary)}</p>
    <p><a href="${escapeHtml(link)}">Read the update on the RenshinKan Dojo website</a></p>
    <hr>
    <p style="font-size: 12px; color: #6f675c;">You subscribed to RenshinKan Dojo updates.</p>
  </body>
</html>`;
}

async function readBrevoJson(response: Response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { message: text };
  }
}

function shortError(data: Record<string, unknown>, fallback: string) {
  const message = typeof data.message === "string" ? data.message : fallback;
  return message.slice(0, 240);
}

export async function createAndSendRecentEventCampaign(env: BrevoEnv, event: RecentEvent) {
  const missing = missingBrevoEnv(env);

  if (missing.length) {
    throw new Error(`Brevo is not configured: ${missing.join(", ")}`);
  }

  const listId = Number(env.BREVO_LIST_ID);

  if (!Number.isFinite(listId)) {
    throw new Error("Brevo list ID must be numeric");
  }

  const createResponse = await fetch("https://api.brevo.com/v3/emailCampaigns", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "api-key": env.BREVO_API_KEY!,
    },
    body: JSON.stringify({
      name: `RenshinKan Dojo Update: ${event.title}`.slice(0, 120),
      subject: `New RenshinKan Dojo Update: ${event.title}`,
      sender: {
        email: env.BREVO_SENDER_EMAIL,
        name: env.BREVO_SENDER_NAME || "RenshinKan Dojo",
      },
      type: "classic",
      htmlContent: campaignHtml(env, event),
      recipients: {
        listIds: [listId],
      },
    }),
  });
  const createData = await readBrevoJson(createResponse);

  if (!createResponse.ok) {
    throw new Error(shortError(createData, "Brevo campaign creation failed"));
  }

  const campaignId = createData.id;

  if (typeof campaignId !== "number" && typeof campaignId !== "string") {
    throw new Error("Brevo did not return a campaign id");
  }

  const sendResponse = await fetch(`https://api.brevo.com/v3/emailCampaigns/${campaignId}/sendNow`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "api-key": env.BREVO_API_KEY!,
    },
  });
  const sendData = await readBrevoJson(sendResponse);

  if (!sendResponse.ok) {
    throw new Error(shortError(sendData, "Brevo campaign send failed"));
  }

  return { campaignId };
}
