/**
 * Placeholder backend for /api/admin/publish.
 *
 * This static GitHub Pages site cannot securely commit to GitHub from browser
 * JavaScript because GITHUB_TOKEN would be public. Deploy this handler as a
 * serverless function on Netlify, Vercel, Cloudflare Workers, or another backend
 * host, then point /api/admin/publish to it.
 *
 * Required environment variables:
 * - GITHUB_TOKEN: fine-grained token with Contents read/write for the repo
 * - GITHUB_OWNER: repository owner, for example CrappyTaco
 * - GITHUB_REPO: repository name, for example RenShinKan_Dojo
 * - GITHUB_BRANCH: target branch, usually main
 *
 * Production work still needed:
 * - authenticate the admin request server-side
 * - accept image uploads and commit them into public/admin-uploads/
 * - rewrite src/data/editableContent.ts or a generated JSON data file
 * - call sendNewsletterUpdatePlaceholder data from the backend when new updates
 *   are published, then connect a real provider such as MailerLite, Brevo,
 *   Mailchimp, Resend, or SendGrid.
 */

const requiredEnv = ["GITHUB_TOKEN", "GITHUB_OWNER", "GITHUB_REPO", "GITHUB_BRANCH"];

export default async function adminPublishPlaceholder(request) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const missing = requiredEnv.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    return json(
      {
        error: "Publish backend is not configured.",
        missing,
      },
      501,
    );
  }

  const body = await request.json();
  const repo = `${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}`;

  return json(
    {
      ok: false,
      message:
        "Placeholder received the admin draft. Add file upload handling and content-file rewriting before enabling real commits.",
      repo,
      branch: process.env.GITHUB_BRANCH,
      receivedUpdates: body?.content?.updates?.length ?? 0,
      newsletterPayloadsPrepared: body?.newsletterPayloads?.length ?? 0,
    },
    501,
  );
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}
