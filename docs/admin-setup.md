# Admin Publishing Setup

This site uses Cloudflare Pages for hosting, Pages Functions for the admin API, Workers KV for editable JSON content, and R2 for uploaded admin media. GitHub can still be used for source-code deployment, but `/admin` saves do not need repository commits.

## Values To Provide

- Cloudflare Pages project name: `renshinkan-dojo` if you keep the checked-in `wrangler.toml` as-is.
- Workers KV namespace bound as `CONTENT_KV`.
- R2 bucket bound as `MEDIA_BUCKET`.
- Admin password hash.
- Long random session secret.
- Production `SITE_URL`.
- Public build-time `VITE_SITE_URL`.
- Brevo API key, list ID, and verified sender if newsletter sending is enabled.
- Public `VITE_BREVO_SIGNUP_FORM_URL` if the signup form should appear.
- Cloudflare Turnstile widget site key and matching secret key for the public
  `/support` contribution form.

## Admin Password Hash

The Functions use an HMAC-SHA-256 hash of the admin password with `SESSION_SECRET`. Generate `SESSION_SECRET` first, then generate the hash locally:

```bash
SESSION_SECRET="PLACEHOLDER_LONG_RANDOM_SECRET" ADMIN_PASSWORD="PLACEHOLDER_ADMIN_PASSWORD" node -e "const crypto=require('node:crypto'); console.log(crypto.createHmac('sha256', process.env.SESSION_SECRET).update(process.env.ADMIN_PASSWORD).digest('hex'))"
```

Put the printed value into `ADMIN_PASSWORD_HASH`. Do not store the plaintext admin password in Cloudflare, GitHub, or frontend code.

## Cloudflare Storage

Create the storage resources:

```bash
npx wrangler kv namespace create CONTENT_KV
npx wrangler kv namespace create CONTENT_KV --preview
npx wrangler r2 bucket create renshinkan-dojo-media
npx wrangler r2 bucket create renshinkan-dojo-media-preview
```

Bind them to the Pages project:

- KV binding name: `CONTENT_KV`
- R2 binding name: `MEDIA_BUCKET`

If you deploy with the Cloudflare dashboard Git integration, add these bindings in **Workers & Pages** > your Pages project > **Settings** > **Bindings**. If you deploy with Wrangler, add the real KV namespace `id` / `preview_id` and R2 bucket names to `wrangler.toml`.

## Cloudflare Secrets And Variables

Add these secrets:

```bash
npx wrangler pages secret put ADMIN_PASSWORD_HASH --project-name renshinkan-dojo
npx wrangler pages secret put SESSION_SECRET --project-name renshinkan-dojo
npx wrangler pages secret put TURNSTILE_SECRET_KEY --project-name renshinkan-dojo
npx wrangler pages secret put BREVO_API_KEY --project-name renshinkan-dojo
```

This project uses `wrangler.toml` as the Cloudflare Pages configuration source of
truth, so add public/plaintext variables to `[vars]` in `wrangler.toml`, not the
Cloudflare dashboard:

```toml
[vars]
SITE_URL = "https://YOUR_DOMAIN"
ALLOWED_ORIGIN = "https://YOUR_DOMAIN"
VITE_SITE_URL = "https://YOUR_DOMAIN"
VITE_MEMBERSHIP_WORKER_URL = "/api/membership"
VITE_TURNSTILE_SITE_KEY = "PLACEHOLDER_CLOUDFLARE_TURNSTILE_SITE_KEY"
BREVO_LIST_ID = "PLACEHOLDER_BREVO_LIST_ID"
BREVO_SENDER_EMAIL = "PLACEHOLDER_VERIFIED_SENDER_EMAIL"
BREVO_SENDER_NAME = "RenShinKan Dojo"
VITE_BREVO_SIGNUP_FORM_URL = "PLACEHOLDER_BREVO_SIGNUP_FORM_URL"
```

Only the `VITE_*` values are exposed to browser JavaScript. Keep `ADMIN_PASSWORD_HASH`, `SESSION_SECRET`, `TURNSTILE_SECRET_KEY`, and `BREVO_API_KEY` as secrets managed in the Cloudflare dashboard.

### Turnstile Site Key

The `/support` contribution form renders Cloudflare Turnstile in the browser. If the
production build does not have `VITE_TURNSTILE_SITE_KEY`, visitors will see:
`Cloudflare verification needs a public site key.`

To fix the live site:

1. In Cloudflare, open **Turnstile** and create a managed widget.
2. Add the production hostnames, for example `renshinkandojo.org` and
   `www.renshinkandojo.org`. Also add `localhost` and `127.0.0.1` for local
   testing.
3. Copy the widget **Site key** into `[vars]` in `wrangler.toml` as
   `VITE_TURNSTILE_SITE_KEY`. This key is public by design and Vite needs it
   during the frontend build.
4. Copy the widget **Secret key** into the Pages secret `TURNSTILE_SECRET_KEY`.
5. Redeploy the Cloudflare Pages project. `VITE_*` values are read at build time,
   so changing the variable without a new deployment leaves the old JavaScript in
   place.

For local-only development, `.env.local` may use Cloudflare's always-pass test
site key:

```bash
VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA
```

## Cloudflare Git Deployment

Create the Cloudflare Pages project from GitHub if you want Cloudflare to rebuild source changes automatically:

1. Go to Cloudflare **Workers & Pages**.
2. Select **Create application** > **Pages** > **Connect to Git**.
3. Authorize GitHub and select the repository.
4. Set production branch to `main`.
5. Use the **React (Vite)** preset, or enter:
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Deploy command: leave blank for a Git-connected Pages project
   - Root directory: repository root / blank
6. Add the KV and R2 bindings, secrets, and environment variables.
7. Select **Save and Deploy**.

Do not create this as a Worker project or set the deploy command to `npx wrangler deploy`. This repo uses Cloudflare Pages plus the `/functions` directory for the admin API. `npm run deploy` is only for manual/direct-upload Pages deployments.

## Admin Edit Flow

1. Admin visits `/admin`.
2. The React route loads through `public/_redirects`.
3. Login posts to `/api/admin/login`.
4. Pages Functions verify the password hash and set an HttpOnly session cookie.
5. The editor loads current content from `/api/content`, backed by KV.
6. Save posts to `/api/admin/publish`.
7. Uploaded images are validated and stored in R2.
8. Editable JSON is stored in KV.
9. Public pages fetch `/api/content` and show the changes without a GitHub commit or Pages rebuild.

## Local Build Check

```bash
npm install
npm run check
```

For a local end-to-end admin test, build first and run Cloudflare Pages locally with Wrangler so Functions and local KV/R2 bindings are available:

```bash
npm run build
npx wrangler pages dev dist
```

Use local env values for `ADMIN_PASSWORD_HASH`, `SESSION_SECRET`, `SITE_URL`, and optional Brevo settings.

## Post-Deploy Tests

1. Visit `/admin` directly.
2. Confirm the login page appears and not a 404.
3. Confirm `GET /api/admin/session` returns `{ "authenticated": false }` before login.
4. Login with the admin password.
5. Create a test unpublished Recent Event without newsletter.
6. Upload a small JPEG, PNG, or WebP.
7. Save.
8. Confirm the public page updates.
9. Refresh the public page and confirm the change persists.
10. Enable `notifySubscribers` only after a Brevo test list is configured.
## D1 student records

The student-record manager uses the `STUDENT_DB` D1 binding declared in `wrangler.toml`.

```bash
npx wrangler d1 migrations apply renshinkan-student-records --local
npx wrangler d1 migrations apply renshinkan-student-records --remote
```

Production requires the existing `SESSION_SECRET` and `TURNSTILE_SECRET_KEY`. A separate `STUDENT_LOOKUP_PEPPER` Pages secret is recommended; when it is not configured, the server derives record HMACs from `SESSION_SECRET` with purpose-specific prefixes. Keep these values out of Git.

Profile images are converted to WebP in the administrator's browser, which removes ordinary camera metadata, then validated again by MIME type, extension, file signature, and size before R2 storage. A photo is returned publicly only when photo consent and the relevant share-field setting are both enabled.
