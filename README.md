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
- Confirm instructor names, photos, ranks, and biographies before public launch.
- Confirm the class schedule, CMU practice details, workshop dates, and contact information before public launch.
- Confirm reuse rights for historical O Sensei images, Peace Culture Foundation images/logo, CMU images/logo, and other third-party visual sources referenced in the site.
- Forms currently use client-side validation only. Connect contact/newsletter flows to a real email or form service before treating them as production intake.
- The newsletter page uses Facebook's public Page Plugin iframe. Facebook controls which public posts are exposed and may hide the embed for users with restrictive privacy settings.

## Notes

The design uses Tailwind CSS, Framer Motion, React Router, CSS custom properties, semantic landmarks, visible focus states, and reduced-motion support.
