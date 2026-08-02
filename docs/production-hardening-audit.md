# Production hardening audit

Date: 2026-07-31

Scope: local repository review and implementation only. No commit, push, Cloudflare deployment, production data mutation, production cache purge, or secret rotation was performed.

## Security findings and changes

- Secret-bearing local environment files exist only as ignored developer files. The tracked tree and checked Git history did not contain a confirmed live session secret, administrator password, Brevo API key, Turnstile secret, private key, or Cloudflare API token. Placeholder-only `.env.example` and `.dev.vars.example` files are retained.
- `.gitignore` and the release-archive check now exclude local environment files, credentials and keys, Wrangler state, databases, logs, temporary uploads, browser artifacts, build output, and dependency directories. CI performs a full-history secret scan.
- Local ignored files must still be treated as confidential and must not be copied, attached, archived, or shared. Retired secondary-administrator secrets should be deleted from local environments.
- Local, preview, and production bindings are explicit. Preview D1, KV, and R2 placeholders are deliberately different from production and release validation fails until real preview resources are supplied.
- Administrator authentication now uses an immutable server identity in session and audit data. A typed login name is no longer authoritative. The compatibility schema supports disabled accounts, dojo membership, last login, password-hash and MFA-ready fields.
- One shared administrator session provider owns bootstrap, retry, logout, invalidation, selected-dojo, and role state. Protected children cannot render before that state is authoritative.
- Administrator page access has a shared allowlist with default deny. Middleware checks direct URLs while APIs retain independent authorization.
- Private responses use `Cache-Control: private, no-store`. Public build assets are content-hashed and immutable. A non-sensitive build identifier is emitted in `build.json`, the DOM, and the build diagnostics endpoint.
- Student lookup uses an exact Unicode-normalized full-name check plus the current or aliased Student ID. A neutral failure does not disclose which value was wrong, and no credential is placed in a URL or operational log.
- D1-backed rate limits use a trusted Cloudflare client IP plus endpoint and, when known, student/account/session subject. Changing User-Agent or forwarding headers does not create a new identity. Locks expire and stale rows are opportunistically removed.
- Turnstile is verified server-side for the expected action and hostname. Client-supplied forwarding headers are ignored unless the request also carries Cloudflare edge provenance.
- Public publishing now reserves a unique D1 operation, writes an immutable versioned KV payload, confirms the revision/audit in a D1 batch, then activates the public version pointer. Operations are idempotent and explicitly failed/reconcilable; D1 and KV are not treated as one ACID transaction.
- Content reads fail closed for missing bindings, malformed pointers/payloads, missing versions, and storage errors. An administrator cannot unknowingly overwrite valid content after a failed read.
- Upload validation includes bounded size/type/signature checks, image re-encoding, random object names, sanitized metadata, Office ZIP structure and traversal checks, attachment headers, authorization, and pending publication. Malware scanning is only a documented integration marker; no scanner is claimed to be active.
- A shared accessible dialog primitive provides dialog semantics, naming, focus trapping/restoration, Escape handling, background inertness, and scroll locking.

## Database and migration changes

Migrations `0024_production_hardening.sql` and `0026_simplify_student_and_admin_access.sql` create or preserve:

- `admin_accounts` and `admin_account_dojos` for immutable administrator identity and scoped membership;
- `student_id_aliases` (added by migration `0026`) so corrected IDs continue to resolve to the same student;
- `security_rate_limits` for layered temporary limits and cleanup expiry;
- `publish_operations` for the draft/publishing/published/failed/superseded lifecycle and idempotency;
- query-driven indexes for student, request, proof, audit, and rate-limit access patterns.

No applied migration is edited. Local verification replays migrations from an empty D1 database and separately upgrades a sanitized previous-schema database through migration 0026. The integrity checker covers SQLite integrity, foreign keys, current/alias Student ID collisions, duplicate revisions, orphan dojo references, invalid states/dates, missing object metadata, and representative query plans.

## Rotation checklist

Rotate an item only if release staff determine that its prior value was committed, logged, attached, copied to an untrusted device, or shared outside its intended operators. Rotation is a release operation, not part of this work.

- `SESSION_SECRET`: rotate first; expect all administrator sessions and encrypted compatibility capabilities based on the previous secret to stop working.
- `ADMIN_PASSWORD_HASH` and entries in `DOJO_ADMIN_PASSWORD_HASHES`: generate new PBKDF2 verifiers from new passwords; distribute passwords out of band.
- `STUDENT_LOOKUP_PEPPER`: rotating changes the keyed rate-limit identifiers and derived name-verification hashes; rebuild the derived hashes and coordinate the rotation before release.
- Turnstile secret and corresponding public site key: replace both widget configuration and Pages secret together, then test action and hostname validation.
- Brevo API key and any sender/list credentials: rotate in Brevo, update only the environment secret, and run an authorized non-production send test.
- Cloudflare API tokens, account credentials, R2 S3 credentials, webhook secrets, and other third-party API credentials: revoke old credentials, grant least privilege, and update the relevant environment only.

Cloudflare D1/KV identifiers and public Turnstile site keys are configuration identifiers, not authentication secrets, but they must not be reused between preview and production.

## Consciously deferred architecture

- The schema and compatibility layer are ready for individual administrator credentials, password reset/recovery, and MFA enrollment, but the current shared environment credential mapping remains until a separately planned account migration. No decorative MFA control was added.
- The legacy DOM-observer translation adapters remain on records and several administrator feature pages because safely converting the full multilingual surface requires a feature-by-feature content review. New shell, session, lookup, and dialog text is covered by localized resources, but direct keyed rendering remains a future feature-by-feature migration.
- The new accessible dialog covers the administrator mobile menu and help drawer. Remaining legacy feature dialogs/drawers require incremental migration and visual regression review.
- An external malware scanner, queue, and physically separate private R2 bucket are not configured. Private objects remain random-keyed and authorization-gated; risky downloads stay pending until approval.
- Two moderate React Router advisories require a breaking React Router 7 migration. The high-severity PostCSS issue was resolved; the router migration remains a planned dependency upgrade.
- Several older source-contract tests remain for regression value, but runtime session, permission, storage, rate-limit, student access, dialog, and staged publishing fault-injection tests are now the primary hardening assurance. Role-equivalent authenticated private-browser automation should still be expanded before final release.
