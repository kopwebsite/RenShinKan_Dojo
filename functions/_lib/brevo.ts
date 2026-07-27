import type { RecentEvent } from "./content";
import type { NewsletterDocumentMark, NewsletterDocumentNode } from "../../shared/newsletter";

export type BrevoEnv = {
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
  return `${baseUrl}/newsletter/${encodeURIComponent(event.slug)}`;
}

function absoluteUrl(base: string, src: string) {
  if (/^(https?:|mailto:|tel:)/i.test(src)) {
    return src;
  }

  return src.startsWith("/") ? `${base}${src}` : `${base}/${src}`;
}

function splitBodyParagraphs(text: string) {
  return (text || "")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
}

function bodyPlacement(item: NonNullable<RecentEvent["media"]>[number], paragraphCount: number) {
  const placement = item.bodyPlacement;
  const position =
    typeof placement?.position === "number" && Number.isFinite(placement.position)
      ? Math.min(Math.max(Math.round(placement.position), 0), paragraphCount)
      : paragraphCount;
  const widthPercent =
    typeof placement?.widthPercent === "number" && Number.isFinite(placement.widthPercent)
      ? Math.min(Math.max(Math.round(placement.widthPercent), 25), 100)
      : 70;
  const align = placement?.align === "left" || placement?.align === "right" ? placement.align : "center";

  return { position, widthPercent, align };
}

function normalizeEmbedUrl(value: string) {
  const trimmed = value.trim();

  if (trimmed.startsWith("<iframe")) {
    const match = trimmed.match(/src=["']([^"']+)["']/i);
    return match?.[1] ?? trimmed;
  }

  try {
    const url = new URL(trimmed);
    const host = url.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      return `https://www.youtube.com/embed/${url.pathname.slice(1)}`;
    }

    if (host === "youtube.com" || host.endsWith(".youtube.com")) {
      const id = url.searchParams.get("v");
      if (id) {
        return `https://www.youtube.com/embed/${id}`;
      }

      const shortsMatch = url.pathname.match(/^\/shorts\/([^/?#]+)/);
      if (shortsMatch) {
        return `https://www.youtube.com/embed/${shortsMatch[1]}`;
      }
    }

    if (host === "vimeo.com") {
      const id = url.pathname.match(/^\/(\d+)/)?.[1];
      if (id) {
        return `https://player.vimeo.com/video/${id}`;
      }
    }

    return trimmed;
  } catch {
    return trimmed;
  }
}

function videoWatchUrl(value: string) {
  const embedUrl = normalizeEmbedUrl(value);

  try {
    const url = new URL(embedUrl);
    const host = url.hostname.replace(/^www\./, "");

    if (host === "youtube.com" || host.endsWith(".youtube.com")) {
      const id = url.pathname.match(/^\/embed\/([^/?#]+)/)?.[1];
      if (id) {
        return `https://www.youtube.com/watch?v=${id}`;
      }
    }

    if (host === "player.vimeo.com") {
      const id = url.pathname.match(/^\/video\/([^/?#]+)/)?.[1];
      if (id) {
        return `https://vimeo.com/${id}`;
      }
    }

    return embedUrl;
  } catch {
    return embedUrl;
  }
}

function documentKindLabel(kind: NonNullable<RecentEvent["media"]>[number]["documentKind"]) {
  if (kind === "pdf") {
    return "PDF";
  }

  if (kind === "docx") {
    return "DOCX";
  }

  if (kind === "ppt") {
    return "PowerPoint";
  }

  return "Document";
}

function renderParagraphRow(text: string) {
  const paragraphHtml = escapeHtml(text).replace(/\n/g, "<br />");

  return `
          <tr>
            <td class="pad body-txt sans" style="padding:18px 48px 0 48px; font-size:17px; line-height:29px; color:#3d362c;">
              <p style="margin:0 0 16px 0;">${paragraphHtml}</p>
            </td>
          </tr>`;
}

function renderMediaRow(base: string, item: NonNullable<RecentEvent["media"]>[number], paragraphCount: number) {
  const placement = bodyPlacement(item, paragraphCount);
  const maxWidth = Math.round(504 * (placement.widthPercent / 100));

  if (item.type === "video") {
    const href = escapeHtml(videoWatchUrl(item.src));
    const title = escapeHtml(item.title || item.caption || "Watch video");

    return `
          <tr>
            <td class="pad" align="${placement.align}" style="padding:20px 48px 0 48px;">
              <table role="presentation" width="${maxWidth}" cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:${maxWidth}px; border:1px solid #e3d8c1; background-color:#fffaf2;">
                <tr>
                  <td class="sans" style="padding:16px; font-size:15px; line-height:23px; color:#3d362c;">
                    <div style="font-weight:700; color:#1f1b16;">${title}</div>
                    <div style="margin-top:8px;"><a href="${href}" style="color:#b22a22; text-decoration:underline;">Watch video</a></div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;
  }

  if (item.type === "document") {
    const href = escapeHtml(absoluteUrl(base, item.src));
    const title = escapeHtml(item.title || item.caption || item.fileName || documentKindLabel(item.documentKind));
    const label = escapeHtml(documentKindLabel(item.documentKind));

    return `
          <tr>
            <td class="pad" align="${placement.align}" style="padding:20px 48px 0 48px;">
              <table role="presentation" width="${maxWidth}" cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:${maxWidth}px; border:1px solid #e3d8c1; background-color:#fffaf2;">
                <tr>
                  <td class="sans" style="padding:16px; font-size:15px; line-height:23px; color:#3d362c;">
                    <div style="font-size:12px; line-height:18px; letter-spacing:2px; text-transform:uppercase; color:#7a6f60;">${label}</div>
                    <div style="margin-top:4px; font-weight:700; color:#1f1b16;">${title}</div>
                    <div style="margin-top:8px;"><a href="${href}" style="color:#b22a22; text-decoration:underline;">Open file</a></div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;
  }

  const imageSrc = escapeHtml(absoluteUrl(base, item.src));

  return `
          <tr>
            <td class="pad" align="${placement.align}" style="padding:20px 48px 0 48px;">
              <img src="${imageSrc}" alt="${escapeHtml(item.alt || "")}" width="${maxWidth}" style="width:100%; max-width:${maxWidth}px; height:auto; display:block;" />${
                item.caption
                  ? `
              <div class="sans" style="margin-top:8px; font-size:13px; line-height:19px; color:#7a6f60; font-style:italic;">${escapeHtml(item.caption)}</div>`
                  : ""
              }
            </td>
  </tr>`;
}

function renderDocumentText(text: string, marks: NewsletterDocumentMark[] = []) {
  return marks.reduce((html, mark) => {
    if (mark.type === "bold") return `<strong>${html}</strong>`;
    if (mark.type === "italic") return `<em>${html}</em>`;
    if (mark.type === "link" && mark.attrs?.href) {
      return `<a href="${escapeHtml(absoluteUrl("", mark.attrs.href))}" style="color:#b22a22;text-decoration:underline;">${html}</a>`;
    }
    return html;
  }, escapeHtml(text));
}

function renderDocumentNode(node: NewsletterDocumentNode): string {
  if (node.type === "text") return renderDocumentText(node.text ?? "", node.marks);
  if (node.type === "hardBreak") return "<br />";
  if (node.type === "horizontalRule") return '<hr style="border:0;border-top:1px solid #d8ccb7;margin:28px 0;" />';
  const children = (node.content ?? []).map(renderDocumentNode).join("");
  if (node.type === "paragraph") {
    if (node.attrs?.variant === "cta") {
      return `<p style="margin:24px 0;text-align:center;"><span style="display:inline-block;background:#2a2018;color:#faf6f0;padding:13px 24px;border-radius:999px;font-weight:700;">${children}</span></p>`;
    }
    return `<p style="margin:0 0 18px 0;">${children}</p>`;
  }
  if (node.type === "heading") {
    const size = node.attrs?.level === 3 ? "22px" : "27px";
    return `<h${node.attrs?.level === 3 ? "3" : "2"} style="margin:28px 0 12px;font-family:Georgia,'Times New Roman',serif;font-size:${size};line-height:1.2;color:#1f1b16;">${children}</h${node.attrs?.level === 3 ? "3" : "2"}>`;
  }
  if (node.type === "bulletList") return `<ul style="margin:0 0 20px 22px;padding:0;">${children}</ul>`;
  if (node.type === "orderedList") return `<ol style="margin:0 0 20px 22px;padding:0;">${children}</ol>`;
  if (node.type === "listItem") return `<li style="margin:0 0 8px;">${children}</li>`;
  if (node.type === "blockquote") {
    return `<blockquote style="margin:24px 0;padding:2px 0 2px 18px;border-left:3px solid #c8312a;color:#5b5145;font-style:italic;">${children}</blockquote>`;
  }
  return children;
}

function renderEventBodyRows(base: string, event: RecentEvent) {
  if (event.bodyContent) {
    const media = event.media?.length ? event.media : event.image ? [event.image] : [];
    const documentHtml = (event.bodyContent.content ?? []).map(renderDocumentNode).join("");
    return `
          <tr>
            <td class="pad body-txt sans" style="padding:24px 48px 0 48px; font-size:17px; line-height:29px; color:#3d362c;">
              ${documentHtml}
            </td>
          </tr>
          ${media.map((item) => renderMediaRow(base, item, 0)).join("\n")}`;
  }
  const bodyText = event.body && event.body.trim() ? event.body : event.summary;
  const paragraphs = splitBodyParagraphs(bodyText);
  const paragraphCount = paragraphs.length;
  const media = event.media?.length ? event.media : event.image ? [event.image] : [];
  const mediaByPosition = new Map<number, typeof media>();
  const rows: string[] = [];

  for (const item of media) {
    const placement = bodyPlacement(item, paragraphCount);
    const items = mediaByPosition.get(placement.position) ?? [];
    items.push(item);
    mediaByPosition.set(placement.position, items);
  }

  const pushMediaRows = (position: number) => {
    for (const item of mediaByPosition.get(position) ?? []) {
      rows.push(renderMediaRow(base, item, paragraphCount));
    }
  };

  pushMediaRows(0);
  paragraphs.forEach((paragraph, index) => {
    rows.push(renderParagraphRow(paragraph));
    pushMediaRows(index + 1);
  });

  return rows.join("\n");
}

export function renderNewsletterCampaignHtml(env: BrevoEnv, event: RecentEvent) {
  const base = (env.SITE_URL || "https://renshinkandojo.org").replace(/\/+$/, "");
  const link = escapeHtml(eventUrl(env, event));
  const logo = `${base}/renshinkan-logo.png`;
  const texture = `${base}/parchment-texture.png`;
  const contactUrl = `${base}/contact`;
  const bodyRows = renderEventBodyRows(base, event);
  const websiteCta = event.published && event.slug
    ? `
          <!-- Read the full post on the website -->
          <tr>
            <td align="center" class="pad" style="padding:26px 48px 6px 48px;">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${link}" style="height:50px;v-text-anchor:middle;width:260px;" arcsize="50%" strokecolor="#2a2018" fillcolor="#2a2018">
                <w:anchorlock/>
                <center style="color:#faf6f0;font-family:Georgia,'Times New Roman',serif;font-size:15px;font-weight:bold;">Read the full post</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-- -->
              <a class="btn-a sans" href="${link}" style="display:inline-block; background-color:#2a2018; color:#faf6f0; font-size:15px; font-weight:600; line-height:20px; padding:15px 32px; border-radius:999px; text-decoration:none;">Read the full post</a>
              <!--<![endif]-->
            </td>
          </tr>`
    : "";

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${escapeHtml(event.emailSettings?.subject || event.title)}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&amp;family=Inter:wght@400;500;600&amp;display=swap" rel="stylesheet" />
  <style type="text/css">
    html, body { margin: 0 !important; padding: 0 !important; width: 100% !important; }
    * { -ms-text-size-adjust: 100%; -webkit-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-collapse: collapse; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; display: block; }
    a { text-decoration: none; }
    .serif { font-family: 'Cormorant Garamond', 'Iowan Old Style', Georgia, Cambria, 'Times New Roman', Times, serif; }
    .sans  { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    @media screen and (max-width: 600px) {
      .container { width: 100% !important; }
      .pad { padding-left: 24px !important; padding-right: 24px !important; }
      .h1 { font-size: 31px !important; line-height: 39px !important; }
      .body-txt { font-size: 16px !important; line-height: 27px !important; }
      .btn-a { display: block !important; }
    }
    @media (prefers-color-scheme: dark) {
      body, .bg-canvas { background-color: #221d16 !important; }
    }
  </style>
</head>
<body class="bg-canvas" style="margin:0; padding:0; width:100%; background-color:#eae0cb;">
  <!-- Preheader: inbox preview text (the post summary) -->
  <div style="display:none; max-height:0; overflow:hidden; mso-hide:all; font-size:1px; line-height:1px; color:#eae0cb; opacity:0;">${escapeHtml(event.emailSettings?.previewText || event.summary)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg-canvas" style="background-color:#eae0cb; background-image:url('${texture}'); background-size:cover; background-position:center;">
    <tr>
      <td align="center" style="padding:20px 12px 28px 12px;">

        <!-- View in browser -->
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="container" style="width:600px; max-width:600px;">
          <tr>
            <td align="center" class="sans" style="padding:6px 16px 14px 16px; font-size:11px; line-height:16px; color:#8c8164; letter-spacing:0.4px;">
              Trouble viewing this letter? <a href="{{ mirror }}" style="color:#7a6f60; text-decoration:underline;">Read it in your browser</a>.
            </td>
          </tr>
        </table>

        <!-- ===================== EMAIL CARD (max 600px) ===================== -->
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="container" style="width:600px; max-width:600px; background-color:#fbf7ef; border:1px solid #e3d8c1; border-radius:14px; overflow:hidden; box-shadow:0 24px 60px rgba(31,27,22,0.10);">

          <!-- Masthead -->
          <tr>
            <td align="center" class="pad" style="padding:34px 40px 18px 40px;">
              <img src="${logo}" width="58" height="58" alt="RenShinKan Dojo" style="width:58px; height:auto; margin:0 auto 12px auto;" />
              <div class="serif" style="font-size:26px; line-height:30px; color:#1f1b16; letter-spacing:0.3px;">RenShinKan Dojo</div>
              <div class="sans" style="font-size:11px; line-height:16px; letter-spacing:3px; text-transform:uppercase; color:#4f6b4a; margin-top:7px; font-weight:600;">Notes from the mat</div>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:0 40px 4px 40px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="width:56px; height:2px; background-color:#c8312a; font-size:0; line-height:0;">&nbsp;</td></tr></table>
            </td>
          </tr>
          <!-- Post date + title -->
          <tr>
            <td class="pad" style="padding:28px 48px 0 48px;">
              <div class="sans" style="font-size:11px; line-height:16px; letter-spacing:3px; text-transform:uppercase; color:#b22a22; font-weight:600;">${escapeHtml(event.date)}</div>
              <h1 class="serif h1" style="margin:10px 0 0 0; font-weight:500; font-size:34px; line-height:42px; color:#1f1b16;">${escapeHtml(event.title)}</h1>
            </td>
          </tr>
          <!-- Post body and embedded media -->
${bodyRows}
${websiteCta}

          <!-- Call to action -->
          <tr>
            <td class="pad" style="padding:32px 48px 0 48px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#2a2018; border-radius:14px;">
                <tr>
                  <td align="center" style="padding:32px 30px;">
                    <h2 class="serif" style="margin:0; font-weight:500; font-size:26px; line-height:33px; color:#f6efe2;">Come train with us</h2>
                    <p class="sans" style="margin:12px auto 0 auto; max-width:380px; font-size:15px; line-height:24px; color:#cabfa8;">Beginners, children and visiting aikidoka are always welcome. Your first visit is on us.</p>
                    <div style="margin-top:22px;">
                      <!--[if mso]>
                      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${contactUrl}" style="height:50px;v-text-anchor:middle;width:220px;" arcsize="50%" strokecolor="#c8312a" fillcolor="#c8312a">
                        <w:anchorlock/>
                        <center style="color:#fbf7ef;font-family:Georgia,'Times New Roman',serif;font-size:15px;font-weight:bold;">Plan your visit</center>
                      </v:roundrect>
                      <![endif]-->
                      <!--[if !mso]><!-- -->
                      <a class="btn-a sans" href="${contactUrl}" style="display:inline-block; background-color:#c8312a; color:#fbf7ef; font-size:15px; font-weight:600; line-height:20px; padding:15px 32px; border-radius:999px; text-decoration:none;">Plan your visit</a>
                      <!--<![endif]-->
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Sign-off -->
          <tr>
            <td class="pad sans" style="padding:30px 48px 38px 48px; font-size:16px; line-height:25px; color:#3d362c;">
              <p style="margin:0;">With warmth,</p>
              <p class="serif" style="margin:4px 0 0 0; font-size:19px; color:#1f1b16;">The RenShinKan Dojo</p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#2a2018; padding:30px 40px;" class="pad">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" class="sans" style="font-size:13px; line-height:21px; color:#b7a98f;">
                    <div class="serif" style="font-size:17px; color:#f3ece0; margin-bottom:6px;">RenShinKan Dojo</div>
                    <a href="https://www.google.com/maps/search/?api=1&amp;query=RenShinKan%20Dojo%2C%20155%20Soi%206%2C%20Suan%20Luang%20Village%2C%20T.%20Baan%20Waen%2C%20A.%20Hang%20Dong%2C%20Chiang%20Mai%2050230" style="color:#b7a98f; text-decoration:none;">155 Soi 6, Suan Luang Village, Baan Waen,<br />Hang Dong, Chiang Mai 50230</a>
                    <div style="margin-top:14px;">
                      <a href="https://www.facebook.com/RenShinKanChiangMai/" style="color:#e2d8c4; text-decoration:underline;">Facebook</a>
                      &nbsp;&middot;&nbsp;
                      <a href="${base}/" style="color:#e2d8c4; text-decoration:underline;">Website</a>
                    </div>
                    <div style="margin-top:16px; padding-top:16px; border-top:1px solid #43382b; font-size:12px; line-height:19px; color:#9a8d76;">
                      You are receiving this letter at {{ contact.EMAIL }} as a member of the RenShinKan community.<br />
                      Prefer not to receive these? <a href="{{ unsubscribe }}" style="color:#cdbfa6; text-decoration:underline;">Unsubscribe here</a>.
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
        <!-- ==================== /EMAIL CARD ==================== -->

        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="container" style="width:600px; max-width:600px;">
          <tr>
            <td align="center" class="sans" style="padding:18px 24px 6px 24px; font-size:11px; line-height:17px; color:#8c8164;">
              &copy; RenShinKan Dojo &middot; Aikido in Hang Dong, Chiang Mai, Thailand
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
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

function brevoListId(env: BrevoEnv) {
  const missing = missingBrevoEnv(env);
  if (missing.length) {
    throw new Error(`Brevo is not configured: ${missing.join(", ")}`);
  }
  const listId = Number(env.BREVO_LIST_ID);
  if (!Number.isFinite(listId)) {
    throw new Error("Brevo list ID must be numeric");
  }
  return listId;
}

export async function getBrevoSubscriberCount(env: BrevoEnv) {
  const listId = brevoListId(env);
  const response = await fetch(`https://api.brevo.com/v3/contacts/lists/${listId}`, {
    headers: {
      Accept: "application/json",
      "api-key": env.BREVO_API_KEY!,
    },
  });
  const data = await readBrevoJson(response);
  if (!response.ok) throw new Error(shortError(data, "Subscriber count is unavailable"));
  return typeof data.totalSubscribers === "number" && Number.isFinite(data.totalSubscribers)
    ? Math.max(0, Math.round(data.totalSubscribers))
    : null;
}

export async function createRecentEventCampaign(env: BrevoEnv, event: RecentEvent) {
  const listId = brevoListId(env);
  const settings = event.emailSettings;

  const createResponse = await fetch("https://api.brevo.com/v3/emailCampaigns", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "api-key": env.BREVO_API_KEY!,
    },
    body: JSON.stringify({
      name: `RenShinKan Dojo: ${event.title}`.slice(0, 120),
      subject: settings?.subject || event.title,
      sender: {
        email: env.BREVO_SENDER_EMAIL,
        name: settings?.senderName || env.BREVO_SENDER_NAME || "RenShinKan Dojo",
      },
      replyTo: settings?.replyTo || env.BREVO_SENDER_EMAIL,
      previewText: settings?.previewText || event.summary,
      type: "classic",
      mirrorActive: true,
      htmlContent: renderNewsletterCampaignHtml(env, event),
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
  return { campaignId };
}

export async function sendRecentEventCampaignNow(env: BrevoEnv, campaignId: number | string) {
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
}

export async function sendRecentEventCampaignTest(
  env: BrevoEnv,
  campaignId: number | string,
  email: string,
) {
  const response = await fetch(`https://api.brevo.com/v3/emailCampaigns/${campaignId}/sendTest`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "api-key": env.BREVO_API_KEY!,
    },
    body: JSON.stringify({ emailTo: [email] }),
  });
  const data = await readBrevoJson(response);
  if (!response.ok) throw new Error(shortError(data, "Brevo test email failed"));
}

export async function createAndSendRecentEventCampaign(env: BrevoEnv, event: RecentEvent) {
  const { campaignId } = await createRecentEventCampaign(env, event);
  await sendRecentEventCampaignNow(env, campaignId);
  return { campaignId };
}
