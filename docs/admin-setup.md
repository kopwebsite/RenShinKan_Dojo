# Admin Publishing Setup

This site is prepared for Cloudflare Pages, Cloudflare Pages Functions, GitHub content publishing, and Brevo newsletter campaigns. No private values are committed to the repo.

## Values To Provide

- Cloudflare Pages project name: `renshinkan-dojo` if you keep the checked-in `wrangler.toml` as-is.
- GitHub owner, repository, and branch.
- GitHub fine-grained personal access token with contents write access for this repository.
- Admin password hash.
- Long random session secret.
- Brevo API key.
- Brevo list ID.
- Brevo verified sender email.
- Brevo signup form URL.
- Production `SITE_URL`.

## Admin Password Hash

The Functions use an HMAC-SHA-256 hash of the admin password with `SESSION_SECRET`. Generate `SESSION_SECRET` first, then generate the hash locally:

```bash
SESSION_SECRET="PLACEHOLDER_LONG_RANDOM_SECRET" ADMIN_PASSWORD="PLACEHOLDER_ADMIN_PASSWORD" node -e "const crypto=require('node:crypto'); console.log(crypto.createHmac('sha256', process.env.SESSION_SECRET).update(process.env.ADMIN_PASSWORD).digest('hex'))"
```

Put the printed value into `ADMIN_PASSWORD_HASH`. Do not store the plaintext admin password in Cloudflare, GitHub, or frontend code.

## Cloudflare Secrets

Replace `PLACEHOLDER_PROJECT` with the Cloudflare Pages project name and enter each real value when prompted:

```bash
npx wrangler pages secret put ADMIN_PASSWORD_HASH --project-name PLACEHOLDER_PROJECT
npx wrangler pages secret put SESSION_SECRET --project-name PLACEHOLDER_PROJECT
npx wrangler pages secret put GITHUB_TOKEN --project-name PLACEHOLDER_PROJECT
npx wrangler pages secret put GITHUB_OWNER --project-name PLACEHOLDER_PROJECT
npx wrangler pages secret put GITHUB_REPO --project-name PLACEHOLDER_PROJECT
npx wrangler pages secret put GITHUB_BRANCH --project-name PLACEHOLDER_PROJECT
npx wrangler pages secret put SITE_URL --project-name PLACEHOLDER_PROJECT
npx wrangler pages secret put BREVO_API_KEY --project-name PLACEHOLDER_PROJECT
npx wrangler pages secret put BREVO_LIST_ID --project-name PLACEHOLDER_PROJECT
npx wrangler pages secret put BREVO_SENDER_EMAIL --project-name PLACEHOLDER_PROJECT
npx wrangler pages secret put BREVO_SENDER_NAME --project-name PLACEHOLDER_PROJECT
```

Set `VITE_BREVO_SIGNUP_FORM_URL` as a Cloudflare Pages build environment variable, not a secret, because it is meant to be public.

## Cloudflare Git Deployment

Create the Cloudflare Pages project from GitHub so Cloudflare pulls and deploys the repo automatically after each push:

1. Go to Cloudflare **Workers & Pages**.
2. Select **Create application** > **Pages** > **Connect to Git**.
3. Authorize GitHub and select `CrappyTaco/RenShinKan_Dojo`.
4. Set production branch to `main`.
5. Use the **React (Vite)** preset, or enter:
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Root directory: repository root / blank
6. Add the required secrets and build environment variables.
7. Select **Save and Deploy**.

After setup, every push to `main` triggers a new production build and deploy on Cloudflare Pages. Pull requests and other branches can produce preview deployments depending on the branch settings in Cloudflare.

## Local Build Check

```bash
npm install
npm run check
```

## Post-Deploy Tests

1. Visit `/admin`.
2. Confirm the login page appears.
3. Confirm `GET /api/admin/session` returns `{ "authenticated": false }` before login.
4. Login with the admin password.
5. Create a test unpublished Recent Event without newsletter.
6. Publish.
7. Confirm the GitHub commit appears.
8. Confirm Cloudflare rebuilds.
9. Confirm the Recent Events page updates.
10. Create a test event with `notifySubscribers` enabled only after a Brevo test list is configured.
11. Confirm newsletter status changes to `sent` or `failed` with a clear error.
