# RenShinKan admin and student UX audit

Audit date: 23 July 2026

This document records the implementation baseline before the unified admin and
student-workflow redesign. It is intentionally implementation-facing. The
reference pack is treated as interaction guidance, not as a visual template.

## Application architecture

- React 18, React Router, TypeScript, and Vite render the public, student, and
  administrator experiences.
- Cloudflare Pages Functions under `functions/` serve every API and guard direct
  `/admin` navigation.
- D1 (`STUDENT_DB`) contains dojos, students, training hours and requests,
  examinations and applications, contributions, payment proofs, sessions,
  revisions, idempotency claims, and audit history.
- R2 (`MEDIA_BUCKET`) contains private payment proofs and student/site media.
- KV (`CONTENT_KV`) contains published editable public-site content.
- The public visual system uses parchment, editorial typography, and RenShinKan
  imagery. Admin-specific CSS is layered into the same global stylesheet.

## Existing routes

### Administrator routes

- `/admin` — central-only combined website updater and administration landing
  page. Local-dojo administrators are redirected to Students.
- `/admin/students` — student database plus examination applications, AAT
  annual contributions, RenShinKan monthly contributions, and payment proofs.
- `/admin/memberships` — redirects to the AAT section of Students.
- `/admin/audit` — scoped permanent audit history.
- `/admin/dojos` — central-only dojo settings.
- `/admin/site-editor` — central-only multilingual structured page editor,
  revision history, rollback, and publishing.

### Student and public record routes

- `/student-records` — choose Find my record, Create a profile, or Apply for an
  exam.
- `/records` — redirects to `/student-records`.
- `/records/share/:token` — usable pending or approved public student record.
- `/support` — contribution and payment-proof workflows.
- Public content routes remain `/`, `/aikido`, `/classes`, `/community`,
  `/contact`, `/instructors`, `/newsletter`, `/newsletter/:slug`,
  `/workshops`, and `/support`.

## Roles, dojo scope, and session model

### RenShinKan central administrator

- Authenticates with the central administrator secret.
- Starts without a selected dojo.
- May select any active dojo.
- Selecting `dojo-rsk` with an authenticated central account immediately
  establishes the RenShinKan context.
- Only a central session whose server-validated selection is `dojo-rsk`
  becomes `renshinkan_super_admin`.
- Super-admin scope may cross dojos only where an endpoint explicitly permits
  it. Website content, publishing, dojo configuration, RenShinKan monthly
  contributions, and broad audit access remain central-only.

### Individual dojo administrator

- Authenticates with a dojo-specific verifier and receives explicit
  `allowedDojoIds`.
- Can select only a non-RenShinKan dojo contained in `allowedDojoIds`.
- Becomes `dojo_admin`.
- APIs scope list queries to `selectedDojoId`.
- Detail and mutation APIs call `assertStudentAccess` or `canAccessDojo`.
- Website content, publishing, site media, dojo configuration, and
  RenShinKan-monthly records remain unavailable.

### Preserved session fields and checks

- `allowedDojoIds`
- `selectedDojoId`
- `permissionLevel`
- signed Secure/HttpOnly/SameSite session cookie
- server-side session revocation and rotation
- same-origin checks on mutations
- request IDs and audit metadata

## API inventory

### Authentication and dojo context

- `/api/admin/login`, `/logout`, `/session`, `/select-dojo`, `/switch-dojo`

### Dashboard, records, and audit

- `/api/admin/dashboard`
- `/api/admin/audit`, `/audit-cleanup`
- `/api/admin/students`, `/students/suggested-id`, `/students/upload`,
  `/students/bulk`
- `/api/admin/students/:id`, `/inline`, `/hours`, `/hours-requests`, `/exam`,
  `/application`, `/profile-status`, `/pending-image`, `/share`

### Examinations and payments

- `/api/admin/examinations`, `/examinations/:applicationId`,
  `/examinations/export`
- `/api/admin/memberships`
- `/api/admin/contributions`
- `/api/admin/payment-proofs`, `/payment-proofs/:id`

### Website management

- `/api/admin/publish`
- `/api/admin/site-content`
- `/api/admin/site-media`
- `/api/admin/dojos`

### Student-facing APIs

- `/api/records/lookup`, `/hours`, `/profile-requests`,
  `/examination-applications`, `/share/:token`, `/payment-proofs/:id`
- `/api/contributions`
- `/api/payment-proofs`
- `/api/dojos`

## Existing workflows and data dependencies

- Administrator sign-in, server-authorized dojo selection, context switching,
  and sign-out.
- Search/filter/paginate student records; add, edit, archive, restore, or
  permanently delete where authorized.
- Bulk profile decisions, training-hour changes, promotions, examination
  results, and archive maintenance with audit entries.
- Review profile and training-hour requests with separate student-visible and
  private notes.
- Create and review examinations, export rosters, and preserve questionnaire
  responses/history.
- Record AAT and monthly contributions; review private retained payment proofs.
- Create public dojo updates and manage media.
- Save multilingual page drafts, preview them, publish, inspect revision
  history, and roll back by creating a new revision.
- Student lookup issues a short-lived capability used for private record,
  training-hour, contribution, and proof workflows.
- Profile creation and examination application preserve Turnstile, consent,
  validation, payment, and proof-upload requirements.

## Features that must not be lost

- Six-dojo data model and server-enforced dojo isolation.
- Primary administrator authentication and server-enforced RenShinKan scope.
- All current student, examination, contribution, payment-proof, media,
  revision, translation, and audit data.
- Existing URLs, shared-record tokens, Approval Center query links, and useful
  filters.
- Review-before-submit behavior already present for bulk changes, contribution
  status, examination decisions, payment proofs, publishing, and exam
  applications.
- Separate student-visible and internal notes.
- Private/no-store delivery of payment proofs.
- English, Thai, Japanese, and Simplified Chinese resources.

## Duplicate and conflicting interface systems

- `/admin` combines landing-page actions with a very large legacy dojo-update
  and gallery editor.
- `/admin/site-editor` is a second, separate publishing system with different
  layout, terminology, draft behavior, and revision support.
- Every administrator page independently implements authentication gates,
  dojo selection, headers, switching, and sign-out.
- Admin navigation is supplied by the public navbar and exposes only a small
  subset of destinations.
- Student management uses a wide tab strip inside one route; the same route
  contains Students, examinations, memberships, contributions, and payment
  proofs.
- Student details open in a drawer containing profile editing, approval,
  training entry, examination entry, applications, and histories at once.
- The public verified record uses a visually rich passport tab system, while
  action status and next steps are split across separate panels.

## Mobile and accessibility failures observed

- Essential admin destinations are missing from persistent navigation.
- Page headers contain too many competing actions and wrap unpredictably.
- The administrator tab strip becomes a vertical list but still acts as the
  primary navigation model.
- The student table keeps a large desktop minimum width instead of becoming
  mobile summaries.
- Several custom dialogs lack a shared focus trap, Escape handling, scroll
  lock, and focus restoration.
- The student workspace creates nested page/drawer scrolling and exposes too
  many unrelated forms.
- Dense technical audit filters and request metadata are visible before the
  human-readable activity.
- Several status labels and form controls use text below the desired
  older-user size.
- Admin terminology alternates between Manage Students, Student Database,
  Submitted Payslip, Website editor, Recent Events, and public-site preview.
- The monthly contribution chart appears whenever any graph rows exist, even
  when the history is too sparse to be informative.

## Implementation direction

- Add one role-aware application shell around every authenticated admin route.
- Make `/admin` a task-first dashboard and move the legacy dojo-update editor
  to a dedicated preserved route.
- Keep existing APIs and authorization checks; compose the dashboard from
  existing dashboard, audit, and site-content responses.
- Use a labelled mobile menu, explicit dojo context, persistent Help, and
  consistent session utilities.
- Convert the student drawer into a sectioned workspace and add mobile student
  cards while preserving all mutations.
- Show the verified student record as an overview plus plain-language task
  rows, retaining the passport as the detailed record.
- Consolidate terminology and add every new shell/dashboard string to all four
  translation resources for human review.
