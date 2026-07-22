# Student Records and Admin Audit

## Architecture inspected

- React 18, TypeScript, Vite, and React Router render the public, student-record, and admin interfaces.
- Cloudflare Pages Functions in `functions/` provide all server routes. `functions/admin/[[path]].ts` also protects direct admin page navigation before the SPA shell is returned.
- D1 binding `STUDENT_DB` stores students, dojo scope, examination workflows, contribution ledgers, payment proofs, request history, sessions, idempotency records, and the operational audit log.
- R2 binding `MEDIA_BUCKET` stores private payslips and approved/pending profile media. KV binding `CONTENT_KV` stores editable public content.
- Admin authentication uses signed Secure/HttpOnly/SameSite cookies. Every data endpoint revalidates the signed session and selected dojo; mutations also enforce same-origin Fetch Metadata/Origin checks.
- Student lookup requires normalized Student ID plus name, rate limiting, and server-side Turnstile Siteverify. A successful lookup issues a 20-minute capability for student submissions and private payslip reads.

## Important findings and changes

- The old student passport exposed only training-hour “Change Requests.” It now presents **Requests & Notices** across profiles, hours, exam applications, contributions, and payslips, with normalized pending/approved/denied states.
- Legacy review notes were ambiguous. Migration `0013_requests_notices_security.sql` adds student-visible and private internal columns. Existing ambiguous notes are backfilled to the private column only.
- Denials for profiles, hours, exam applications, and payslips require a student-visible explanation. Private notes remain in scoped admin responses and audit metadata, never owner-passport responses.
- Immutable `request_decisions` claims make profile, hour, examination, and payslip decisions single-winner operations. D1 batches roll back the losing concurrent mutation.
- Contributions now show the established AAT payment/due-date data and a RenShinKan-only expected monthly ledger. No amount or due date is synthesized from upload time. The monthly amount comes from `RENSHINKAN_MONTHLY_CONTRIBUTION_AMOUNT`, is copied into each ledger row, and is never embedded in API or component logic.
- Payslips accept validated JPEG, PNG, WebP, or PDF content up to 5 MB. R2 keys are generated internally. Files are served with private/no-store headers through student-capability or scoped-admin routes; storage keys are never returned.
- Payslips are retained as accounting records. The previous 60-day application purge and lifecycle setup script were removed.
- Turnstile uses explicit rendering and Cloudflare flexible/compact sizes, reports loading/success/expiry/timeout/error states, and resets after each lookup attempt. Siteverify checks the expected action and configured hostname with a network timeout.
- The admin bulk bar now separates record-status actions, training/rank actions, and destructive archive maintenance. Selection is page-scoped, keyboard-operable, and exposes checked/unchecked/indeterminate states.
- Primary and dojo password verifiers support PBKDF2-SHA-256. Legacy primary/dojo HMAC verifiers remain readable only for migration; rotate them. The secondary credential accepts PBKDF2 only.
- Session IDs rotate when dojo context or RenShinKan privilege changes. Logout stores server-side revocation, and protected routes reject revoked sessions.
- Login failures, private file views, request decisions, replacements, bulk operations, and cleanup summaries are audited without tokens, passwords, or file contents.
- The patched `sharp` 0.35 dependency is enforced for the direct image optimizer and Wrangler/Miniflare dependency tree; `npm audit` reports no known advisories at handoff.

## Migration and recovery

Back up D1, apply migrations, then deploy application code:

```powershell
npx wrangler d1 export renshinkan-student-records --remote --output renshinkan-student-records-backup.sql
npx wrangler d1 migrations apply renshinkan-student-records --remote
```

Migration `0013` is additive. It:

- adds public/private decision-note fields;
- conservatively copies legacy ambiguous notes to private fields;
- adds two-hour upload-token expiry metadata;
- creates immutable request-decision claims and backfills only explicit historical outcomes;
- creates session-revocation storage and permission/status indexes.

Migrations `0014` and `0015` add database triggers that prevent an examination application from being denied after payment, marked paid after an immutable denial, or completed after a denial. This closes races between simultaneous application, examination, and payslip reviewers without changing existing business records.

It does not delete or rewrite student, examination, request, payment, contribution, or payslip history. Recovery is forward-only: restore the D1 backup if the migration itself fails. Rolling application code back does not require dropping the added columns, but old code will not enforce revocation or the new decision claims.

## Required secret migration

Generate PBKDF2 verifiers with `scripts/hash-password.mjs` as described in `docs/admin-setup.md`, then set:

- `ADMIN_PASSWORD_HASH`
- `DOJO_ADMIN_PASSWORD_HASHES`
- `RSK_ADMIN_SECONDARY_PASSWORD_HASH`
- existing `SESSION_SECRET`

Remove the old plaintext `RSK_ADMIN_SECONDARY_PASSWORD` after the hashed secret is confirmed. Rotate all legacy HMAC primary/dojo verifiers after deployment; compatibility exists only to avoid an immediate lockout.

## Required non-secret configuration

Set `RENSHINKAN_MONTHLY_CONTRIBUTION_AMOUNT` to the currently approved whole-THB amount. The checked-in `wrangler.toml` preserves the existing production value, while the API validates it and returns it to the contribution UI. If it is missing or invalid, monthly submissions fail closed with a respectful configuration message; AAT workflows remain available.

## Payslip retention deployment step

List the production bucket rules and remove the old expiry rule if present:

```powershell
npx wrangler r2 bucket lifecycle list renshinkan-dojo-media
npx wrangler r2 bucket lifecycle remove renshinkan-dojo-media --name payment-proofs-60-days
```

Do not remove unrelated bucket rules. Existing objects already deleted by R2 cannot be recovered by this change; retain a bucket backup if required by dojo policy.

## 90-day audit cleanup

The standalone Worker in `serverless/audit-cleanup-worker.ts` runs daily at `17 18 * * *` (18:17 UTC, 01:17 Asia/Bangkok). It deletes `audit_log` rows with UTC `created_at` strictly older than 90 days in batches of 500, deletes expired session-revocation rows, and writes one safe cleanup summary. It never touches business-history tables.

Validate and deploy it after the D1 migration:

```powershell
npm run audit:worker:types
npm run audit:worker:check
npx wrangler deploy --config wrangler.audit-cleanup.jsonc
```

An authenticated RenShinKan super administrator can also run `POST /api/admin/audit-cleanup`. It is same-origin protected and uses the identical cleanup routine.

## Manual QA checklist

- At 320, 375, 768, 1024, and 1440 CSS pixels, confirm Turnstile remains inside the lookup card and its status text is visible; repeat at 200% zoom and with keyboard-only navigation.
- Look up an approved student. Confirm a failed lookup resets Turnstile and does not reveal whether name or ID matched.
- In Requests & Notices, verify every supported workflow appears, denial text is gentle, and only student-visible notes are present in the network response.
- For a RenShinKan student, verify expected/missing monthly periods, upload or replace a payslip, view it, and see the review result. Confirm the entire monthly section/data is absent for another dojo.
- Preview both an image and PDF payslip as the submitting student, the correct dojo admin, a different dojo admin, and anonymously. Only the first two authorized cases should succeed.
- Review profile, hour, exam, and payslip denials. Confirm the public explanation is required and the private field never appears in the student response.
- Select one row and an entire student-list page. Confirm the select-all indeterminate state, exact affected-student preview, double-submit prevention, and completion/partial-failure reporting.
- Sign in, select a dojo, elevate RenShinKan access, switch dojo, and log out. Confirm each old cookie is rejected after rotation/revocation.
- Run audit cleanup twice against test data around the exact 90-day UTC cutoff. Confirm newer/boundary entries and all business history remain.

## Remaining operational risks

- There is no external malware-scanning service for payslips. The allowlist, content signatures, size limit, generated keys, no-store delivery, and non-executable formats reduce risk; add a scanning pipeline if dojo policy requires it.
- Existing files removed by the former R2 lifecycle rule are not recoverable without backups.
- Admin identities are environment-secret roles rather than database-backed individual accounts. Audit records capture the entered administrator name, session, role, and dojo, but the deployment does not provide per-person account disablement or MFA.
- Focus trapping in legacy admin dialogs remains dependent on browser modal behavior and should be revisited if the dialogs are moved to a shared accessible-dialog primitive.
