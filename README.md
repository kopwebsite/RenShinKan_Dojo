# RenshinKan Dojo Website

React + TypeScript + Vite website for RenshinKan Dojo in Hang Dong, Chiang Mai.

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

The production build is written to `dist/`. The build also copies `dist/index.html` to `dist/404.html` so GitHub Pages can serve React Router pages on refresh.

## GitHub Pages

This repo includes `.github/workflows/pages.yml`. After pushing to GitHub:

1. Open the repository settings.
2. Go to **Pages**.
3. Set **Build and deployment** to **GitHub Actions**.
4. Push to the `main` branch, or run the workflow manually.

The workflow builds with `BASE_PATH` set to the repository name, so project pages such as `https://OWNER.github.io/REPO/` work without editing asset paths. For an `OWNER.github.io` repository, the workflow uses `/`. For a custom domain on a project repository, change `BASE_PATH` in the workflow to `/`.

## Repository Hygiene

The repository should include source files, package manifests, public site assets, and GitHub workflow files. It should not include generated or local-only folders such as `node_modules/`, `dist/`, `.logs/`, `.tools/`, `.claude/`, `screenshots/`, or the raw working image folder `Dojo pictures/`.

## Content And Launch Checks

- Edit site copy, navigation, instructors, workshops, schedule, FAQs, newsletters, and facilities in `src/data/siteContent.ts`.
- Admin-managed public content lives in `src/data/editableContent.ts`. The `/admin` page is a static editor for preparing updates until a real backend publish function is deployed.
- Confirm instructor names, photos, ranks, and biographies before public launch.
- Confirm the class schedule, CMU practice details, workshop dates, and contact information before public launch.
- Keep source records for historical O Sensei images, Peace Culture Foundation images/logo, CMU images/logo, and other third-party visual sources referenced in the site.
- Contact, donation, and newsletter actions currently route admins and visitors to Facebook or documented backend placeholders. Add a real form or email provider before collecting visitor submissions directly on the site.
- The newsletter page uses Facebook's public Page Plugin iframe. Facebook controls which public posts are exposed and may hide the embed for users with restrictive privacy settings.

## Admin Page

Open `/admin` to enter the temporary admin editor. The current temporary password is checked in the browser with a SHA-256 hash, not stored as plain text, but this is not production authentication because a fully static site cannot keep secrets. Add hosting-level auth or a backend login before treating `/admin` as secure.

Admins can prepare:

- newsletter / dojo updates with subject, article body, summary, up to 6 photos, and external video embeds
- historical media for "A Look at Our History"
- current training media for "On the Mat"
- the examination announcement text
- photos and optional captions for students who passed grading tests
- edits/deletes for existing dojo updates

Photos selected in `/admin` preview locally. The first update photo becomes the slider's first item and the front-page image. Videos must be YouTube, Vimeo, or another external HTTPS embed/player URL because direct video uploads are too large for this static-site workflow and need backend storage.

The public front page shows the 3 most recent dojo updates from `src/data/editableContent.ts`. The newsletter page shows the full update with subject, body, date, and an image/video slider.

### GitHub Publish Flow

The browser must not contain a GitHub token. The Save / Publish button posts to `/api/admin/publish`, which should be backed by a serverless function based on `serverless/admin-publish-placeholder.mjs`.

Required backend environment variables:

```bash
GITHUB_TOKEN=
GITHUB_OWNER=
GITHUB_REPO=
GITHUB_BRANCH=
```

Intended flow:

1. Admin fills out `/admin`.
2. Admin clicks Save / Publish Changes.
3. The serverless function receives the draft and media payload.
4. The function commits changed content/media to GitHub using `GITHUB_TOKEN`.
5. GitHub Pages rebuilds from the commit.
6. New updates pass their prepared newsletter payload to the future email provider hook.

`sendNewsletterUpdatePlaceholder(update)` lives in `src/data/editableContent.ts`. Connect MailerLite, Brevo, Mailchimp, Resend, SendGrid, or another provider from the backend later; do not call those APIs from frontend code.

## Notes

The design uses Tailwind CSS, Framer Motion, React Router, CSS custom properties, semantic landmarks, visible focus states, and reduced-motion support.
