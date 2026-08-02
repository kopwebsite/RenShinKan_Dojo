# RenShinKan administration redesign handoff

## Outcome

The administration area now uses one role-aware shell with persistent dojo
context, a task-first dashboard, labelled mobile navigation, and page-aware
help. Existing Cloudflare Pages Functions, D1 data, R2 media, audit history,
primary authentication, dojo-scoped authorization, and public QR routes remain
the source of truth.

## Route map

- `/admin` — task-first dashboard
- `/admin/students` — student database
- `/admin/students?profileStatus=pending_admin_approval` — profile requests
- `/admin/students?section=exams` — examination applications
- `/admin/students?section=exams&view=records` — examination record guidance
- `/admin/students?section=memberships` — AAT annual contributions
- `/admin/students?section=contributions` — RenShinKan monthly contributions
- `/admin/students?section=payslips` — payment proofs
- `/admin/dojo-updates` — public dojo updates
- `/admin/dojo-updates#media-library` — media library
- `/admin/site-editor` — structured site pages and publishing
- `/admin/dojos` — dojo settings
- `/admin/audit` — permanent audit log

## Role and security behavior

- Central administrators see all authorized dojos in the persistent context
  selector and enter RenShinKan directly after selecting it.
- Dojo administrators receive only their server-authorized dojo and never see
  central-only website, monthly-contribution, or dojo-settings destinations.
- Direct routes and every read/write API remain server-protected.
- Destructive actions retain explicit confirmations, audit entries, and
  student-visible versus administrator-only note separation.
- Payment proof files remain private, authenticated, dojo-scoped, and
  `no-store`.

## Interaction changes

- The dashboard displays only non-zero attention queues, quick actions, recent
  activity, and central website status.
- Student search is always visible. Advanced filters are collapsible, tables
  become compact mobile cards, and the focused student workspace shows one of
  Overview, Profile, Training, Examinations, Payments, or History at a time.
- Quick actions preserve their intent: training and examination shortcuts open
  the correct student-workspace section after a student is chosen.
- Examination recording presents a readable review summary before mutation.
- Sparse contribution data uses a compact current-period progress summary
  instead of an empty 12-month chart.
- Audit entries lead with plain-language summaries. Action codes, request IDs,
  IP/device details, and bulk identifiers are collapsed under Technical
  details.
- The site editor shows a persistent unpublished-changes bar with Discard,
  Save draft, Preview changes, and Review & publish.

## Localization

New shell navigation, contextual Help, dashboard, and owner task-list copy was
added to English, Thai, Japanese, and Simplified Chinese resources. Automated
parity checks prevent missing keys or empty fallbacks. The non-English wording
is a functional translation and should receive native-speaker review before
future copy expansion.

## Verification

- TypeScript typecheck
- Full Vitest security, authorization, workflow, and UI-contract suite
- Production Vite build
- Browser testing with real local Pages Functions and D1 data
- Responsive checks at 320, 390, 768, 1024, and desktop widths
- Keyboard verification for labelled navigation and the focus-trapped Help
  drawer, including Escape and focus restoration
- Direct-link verification for each preserved administration destination,
  including central-only monthly contributions
