# RenShinKan persistent help center

Last reviewed: 2026-07-31

## Architecture and integration

`HelpLauncher` is mounted once in the public application frame and once inside the admin language/session frame. It owns the persistent bottom-right trigger and loads `HelpPanel` only after a user opens help or follows a direct `?help=<topic-id>` link. A local error boundary contains a failed help chunk so the public or admin application remains usable.

`HelpPanel` uses the shared `AccessibleDialog` primitive for dialog semantics, focus containment, Escape handling, focus restoration, background inertness, and body scroll lock. On desktop it is a right-side dialog; at 640 px and below it uses the complete dynamic viewport. Safe-area insets protect the trigger, header, and scrollable body. The panel has no analytics, feedback capture, or user-data persistence.

Content is separate from the main interface dictionaries:

- `src/help/types.ts` defines the versioned article, step, troubleshooting, screenshot, catalog, category, audience, route, keyword, locale, and UI-copy contracts.
- `src/help/content/public.ts` contains complete English, Thai, Japanese, and Simplified Chinese public/student catalogs.
- `src/help/content/admin.ts` contains complete English and Thai administrator catalogs.
- `src/help/search.ts` performs Unicode NFKC localized full-text matching without a DOM observer. Thai phrases work with or without spaces because matching is substring based.
- `src/help/context.ts` maps the current route to ordered, audience-safe suggestions. Full category browsing remains available from every route.

The existing top-bar admin help drawer was removed. “Open Auggie help” is now the single persistent admin help affordance. Auggie is explicitly described as the name of the administration guide, not a person or AI assistant.

## Topics delivered

Public/student content has ten complete guides:

1. Navigation and language selection.
2. Student lookup and profile-update approval.
3. Recorded hours and missing-training requests.
4. Exam eligibility, application, results, and certificates.
5. Monthly/AAT contributions, proof upload, statuses, and receipts.
6. Digital passport sections and verification.
7. Safe limited sharing, expiry, and revocation.
8. Published news, newsletters, and older pages.
9. Public downloads and browser download handling.
10. Dojo contact and privacy-safe website problem reporting.

Administrator content has eleven complete guides:

1. Sign-in, central verification, session safety, and sign-out.
2. Permission levels, data scope, and dojo switching.
3. Dashboard alerts, queues, and post-action confirmation.
4. Student search, duplicate prevention, create/edit, and archive.
5. Training-hour request verification and decisions.
6. Examination applications, results, and certificates.
7. Monthly/AAT contributions, proof matching, decisions, and receipts.
8. Newsletter draft, preview, publish, retry, and recovery.
9. Galleries, image accessibility, preview, and publishing.
10. Approved public document upload, metadata, publish, and testing.
11. Dojo/membership least privilege and audit investigation.

Every guide states the outcome first, uses numbered steps with exact control names, explains the expected result of each step, suggests what to do next through related topics, and includes troubleshooting that does not encourage duplicate or unsafe actions.

## Localization and maintenance

Public help must keep the same topic IDs in `en`, `th`, `ja`, and `zh-CN`. Admin help must keep the same topic IDs in `en` and `th`. Tests fail when an ID, related link, structured field, audience, or locale is missing. Add new wording directly to the typed catalogs; do not add a mutation observer or translate rendered DOM.

When a workflow changes:

1. Update the relevant article in every supported locale.
2. Increase the article version when instructions materially change.
3. Update its keywords and route mapping if discovery changed.
4. Regenerate any affected screenshot with `npm run help:screenshots`.
5. Review `public/help/screenshots/manifest.json` and run the help and full test suites.

## Screenshot workflow and privacy

`npm run help:screenshots` builds the site and runs a controlled Playwright capture against the local Pages runtime. It creates six versioned WebP assets in `public/help/screenshots/` and refreshes manifest build/test metadata. Numbered badges are added in the browser immediately before capture; they do not alter production UI.

The current set covers the public header/language selector, mobile student-record entry, news, downloads, and English/Thai admin sign-in. Captures use only public pages, blank private forms, and empty demonstration state. The script never signs in, fills a student field, loads a shared-record token, or reads production data. Each referenced image has localized nearby guidance, alternative text, a caption, and a written-step fallback. The test suite verifies local existence, dimensions, WebP format, size, metadata, and obvious private-value patterns.

Screenshot paths include `v2026-07`; changing a screenshot should use a new versioned name so the seven-day static cache cannot serve mismatched guidance. The dedicated `_headers` rule permits stale-while-revalidate without caching HTML, API, student, or admin responses.

## Accessibility behavior

- Persistent controls and dialog controls have a minimum 44 by 44 CSS-pixel target.
- The dialog has an accessible name and description, is modal, traps Tab/Shift+Tab, closes with Escape, restores the launcher focus, locks body scroll, and makes the application root inert.
- Search receives initial focus, has a visible label, and reports localized result counts through a polite status region.
- Headings, numbered lists, breadcrumb/back navigation, category labels, current-page text, related-topic buttons, image alt text, and failure messages remain semantic.
- Mobile uses `100dvh`; safe-area insets protect all four edges. Desktop uses a bounded side panel.
- Text controls allow 90–130% guide-only scaling. Layout is also tested at a narrow viewport representative of 400% browser zoom.
- `prefers-reduced-motion: reduce` removes panel entrance animation. Written instructions remain complete if a screenshot fails.
- The browser test runs axe against the open dialog and checks focus, Escape, viewport containment, overflow, inertness, enlarged text, and reduced motion.

## Bundle and resilience impact

The pre-help baseline main JavaScript was 326.63 kB raw. The current main chunk is 328.21 kB raw (about +1.58 kB); the persistent launcher and load/error boundary are the only meaningful eager addition. Help article content, search, routing, and panel behavior are isolated in an 82.80 kB raw / 24.29 kB gzip lazy chunk, with 6.21 kB raw / 1.99 kB gzip lazy CSS. Main CSS moved from about 320.97 kB to 322.88 kB raw for the fixed trigger and loading/error dialog.

Content and guide images are loaded only when required. A content chunk failure produces a local retry/close dialog. An image failure produces localized fallback text. Neither condition replaces, submits, or mutates the current public/student/admin workflow.

## Verification commands

- `npm run typecheck`
- `npx vitest run tests/help-center.test.ts tests/help-center-runtime.test.tsx`
- `npx playwright test e2e/help-center.spec.ts --project=chromium`
- `npm run help:screenshots`
- `npm test`
- `npm run test:migrations`
- `npm run build`

The help tests cover trigger naming, route suggestions, audience boundaries, locale completeness, Unicode/Thai search, topic completeness, related-link integrity, manifest/privacy constraints, dialog semantics, initial focus, Escape/focus restoration, scroll lock/inertness, safe-area/viewport fit, text enlargement, reduced motion, image fallback, direct links, and automated accessibility rules.

## Release status

No commit, push, pull request, deployment, production migration, backup, or production-data action is part of this implementation. Existing production-release safeguards and preflight requirements remain unchanged.
