# RenShinKan Dojo Website

React + TypeScript + Vite website for RenShinKan Dojo in Hang Dong, Chiang Mai.

## Run Locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.

## Build

```bash
npm run build
npm run preview
```

The production build is written to `dist/`. `public/_redirects` rewrites direct navigation for the React routes, including `/admin`, back to `index.html` on Cloudflare Pages.

## Cloudflare Pages

Use Cloudflare Pages for the static build and Pages Functions for the admin API. GitHub can still be the source-code deployment integration, but admin content edits are stored in Cloudflare KV and uploaded admin media is stored in Cloudflare R2.

In Cloudflare:

1. Go to **Workers & Pages**.
2. Select **Create application** > **Pages** > **Connect to Git**.
3. Connect the GitHub repository `kopwebsite/RenShinKan_Dojo`.
4. Use `main` as the production branch.
5. Use the **React (Vite)** framework preset, or enter these settings manually:
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Deploy command: leave blank for a Git-connected Pages project
   - Root directory: leave blank / repository root
6. Add the admin secrets, KV namespace binding, R2 bucket binding, and public build variables described in `docs/admin-setup.md`.
7. Save and deploy.

Do not create this as a Worker project and do not use `npx wrangler deploy` as the deploy command. That command is for Cloudflare Workers and fails for this Pages project with "Missing entry-point to Worker script or to assets directory". This repo uses Cloudflare Pages plus the `/functions` directory for the admin API. If Cloudflare shows a required deploy-command field, you are likely configuring a Worker build rather than a Pages Git integration. For manual/direct-upload deployments only, use `npm run deploy`, which runs `wrangler pages deploy dist`.

The repo includes `wrangler.toml` with the Cloudflare Pages project name, build output directory, Functions compatibility date, and binding names. It also includes `.nvmrc` so Cloudflare builds with Node 22. The `/functions` directory is deployed by Cloudflare Pages Functions for the admin API. GitHub Actions are not used for hosting.

## Repository Hygiene

The repository should include source files, package manifests, public site assets, Cloudflare Pages config, and Cloudflare Pages Functions. It should not include generated or local-only folders such as `node_modules/`, `dist/`, `.wrangler/`, `.logs/`, `.tools/`, `.claude/`, `screenshots/`, or the raw working image folder `Dojo pictures/`.

## Content And Launch Checks

- Edit site copy, navigation, instructors, workshops, schedule, FAQs, newsletters, and facilities in `src/data/siteContent.ts`.
- Admin-managed public content is loaded from `/api/content` after it has been saved to Cloudflare KV. The checked-in `public/content/editableContent.json` remains a static fallback for local Vite development and first deploys before KV is populated.
- Confirm instructor names, photos, ranks, and biographies before public launch.
- Confirm the class schedule, CMU practice details, workshop dates, and contact information before public launch.
- Keep source records for historical O Sensei images, Peace Culture Foundation images/logo, CMU images/logo, and other third-party visual sources referenced in the site.
- Contact, donation, and newsletter actions currently route admins and visitors to Facebook or documented backend placeholders. Add a real form or email provider before collecting visitor submissions directly on the site.
- The newsletter page uses Facebook's public Page Plugin iframe. Facebook controls which public posts are exposed and may hide the embed for users with restrictive privacy settings.

## Admin Page

Open `/admin` to enter the admin editor. Login is handled by Cloudflare Pages Functions with an HttpOnly signed session cookie. The admin API routes also verify the session server-side; the frontend page alone is not treated as a security boundary.

The current admin UI exposes:

- newsletter / dojo updates with title, article body, summary, and event images
- the examination announcement text
- edits/deletes for existing dojo updates

Photos selected in `/admin` are converted to WebP in the browser, preview locally, then upload to R2 when the admin saves. The first update photo becomes the slider's first item and the front-page image. The server stores WebP images, validates MIME type, file extension, image signature, file count, and file size, and also allows newsletter document attachments.

The public front page shows the 3 most recent published dojo updates from Cloudflare KV. The newsletter page shows the full update with title, body, date, and an image slider.

### Cloudflare Admin Publish Flow

The browser must not contain storage tokens or email provider keys. The Save / Publish button posts to `/api/admin/publish`, which is handled by Cloudflare Pages Functions in `functions/api/admin/publish.ts`.

Required Cloudflare configuration:

- `CONTENT_KV` Workers KV namespace binding
- `MEDIA_BUCKET` R2 bucket binding
- `ADMIN_PASSWORD_HASH` secret
- `SESSION_SECRET` secret
- `SITE_URL` Pages Function variable or secret
- `VITE_TURNSTILE_SITE_KEY` Pages build variable for the public `/support` Turnstile widget
- `TURNSTILE_SECRET_KEY` Pages Function secret matching that Turnstile widget
- optional Brevo secrets if newsletter sending is enabled
- `VITE_SITE_URL` and `VITE_BREVO_SIGNUP_FORM_URL` Pages build variables

Intended flow:

1. Admin fills out `/admin`.
2. Admin clicks Save / Publish Changes.
3. The serverless function receives the draft and media payload.
4. Image files are validated and stored in R2.
5. Editable content JSON is stored in KV.
6. Public pages load the updated content from `/api/content` without a source-code commit or Pages rebuild.
7. New published updates with `notifySubscribers` enabled can trigger Brevo from the backend if Brevo is configured.

## Notes

The design uses Tailwind CSS, Framer Motion, React Router, CSS custom properties, semantic landmarks, visible focus states, and reduced-motion support.
