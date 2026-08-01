# Production incident runbook

Use this checklist in order. Record all times in UTC and Asia/Bangkok. Do not paste secrets, names, payment details, request bodies, object keys, database rows, or uploaded content into logs or incident chat.

## 1. Check site health

1. Open the home page and `GET /api/diagnostics/health`.
2. Record status, build ID, environment, boolean checks, correlation ID, and time.
3. If health is `503`, identify whether D1, KV, R2, migration, or publishing is false.
4. A public check contains no diagnostic details. A verified central administrator can open `GET /api/admin/diagnostics` for aggregate details.
5. Check Cloudflare Status before changing application data.

## 2. Find errors and use a correlation ID

Open Workers & Pages → the site → Observability. Search the exact correlation ID. Otherwise filter a five-minute window by `category`, route template, status, environment, and build. Use `$metadata.error EXISTS` and `$workers.outcome = "exception"` for runtime failures. Never search by a student's private value or add one to a new log.

Give users this wording: “The request was not completed. Your valid saved data was not intentionally removed. Please retry once; if it still fails, send the correlation ID to the administrator.” For an uncertain newsletter delivery, explicitly say **do not retry** until Brevo state is verified.

## 3. Deployment failed

Leave the last healthy Pages deployment active. Do not apply migrations by hand to make a failed build pass. Check CI, configuration validation, migration replay, build, and Pages deployment logs. Confirm preview and production bindings are isolated and `BUILD_ID` is the release commit. Fix forward in preview, rerun every gate, take a D1 export, then use only the authorized release workflow.

## 4. Roll back the frontend

Use the Cloudflare Pages deployment history to promote the last known-good production deployment through the authorized operator path. A frontend rollback does not roll D1, KV, or R2 back. Confirm the old frontend is compatible with the current schema first. After promotion, verify build ID, public health, admin login, student lookup, and content. Never pair a frontend rollback with a D1 restore unless the database itself is proven corrupt.

## 5. Recover D1

Stop risky writes; capture a fresh encrypted export; determine the earliest bad time; resolve a Time Travel bookmark; restore into an isolated target; compare; obtain production approval; then restore by verified bookmark/timestamp only if a narrow repair cannot preserve later valid writes. Follow `backup-and-recovery.md`. Never run a destructive production restore as a test.

## 6. Recover KV content

Do not overwrite the pointer first. Identify the last verified immutable D1 `site_revisions` row and its publish operation/hash, rebuild or verify the versioned KV payload, validate it with `validateEditableContent`, then activate the pointer once. Rerun health and confirm the visible revision. If D1 and KV disagree after an uncertain publish, reconcile the existing operation; do not create duplicate revisions.

## 7. Recover R2 media

Identify the required object from restricted D1 metadata, verify the backup checksum and privacy class, restore to the exact immutable key in the correct private/public bucket, then issue a `head` and rerun the aggregate audit. Payslips and profile photos must never be copied into public storage. Do not auto-delete orphan objects.

## 8. Rotate or replace a secret

Assume exposure if a secret reached source, logs, a screenshot, shell history, or an unauthorized person. Revoke/rotate it at the provider first, store the replacement in Cloudflare/GitHub protected secrets, redeploy through the authorized workflow, invalidate affected sessions/tokens, and test. Rotate `SESSION_SECRET` only with an explicit session-invalidation plan because all admin cookies become invalid. Never print a new secret to prove it works.

## 9. Revoke administrator access

For a database-backed account, set `admin_accounts.disabled=1` using a reviewed, parameterized administrative operation and insert an audit event. Add active session IDs to `revoked_admin_sessions` until expiry. If the account uses a shared environment credential, rotate that credential and its PBKDF2 hash, revoke all associated sessions, and enroll individual credentials as soon as supported. Remove the person from Cloudflare/GitHub and notification recipient lists separately.

## 10. Suspected data leak

Stop the exposed path, preserve logs and a current encrypted backup, restrict bucket/token access, rotate credentials, revoke sessions/share tokens, identify data class and time window without broad downloads, notify the owner/privacy lead, and follow applicable legal notification obligations. Do not destroy evidence or promise scope until verified.

## 11. Temporarily disable uploads

Set production variable `UPLOADS_ENABLED=false` in the controlled Pages configuration and deploy through the authorized release path. This blocks new site media, gallery media, documents, payment proofs, and profile-photo writes while preserving existing objects/content. Verify a test upload returns `503` with a correlation ID and existing media remains readable. Restore `true` only after R2/D1 health and partial-write tests pass.

## 12. Temporarily disable newsletter delivery

Set `NEWSLETTER_PUBLISHING_ENABLED=false` and deploy through the authorized path. Draft editing and existing public newsletters remain available, but test/live email delivery returns `503` and does not mutate a valid saved draft. For any `pending_verification` delivery, inspect Brevo first and never blindly resend. Restore `true` only after recipient-count, idempotency, and provider checks pass.

## 13. Post-outage verification

- public home/content, build diagnostic, and public health;
- verified admin sign-in, dojo scope, session expiry/revocation;
- student lookup and short-lived access without exposing a real record in notes;
- D1 latest migration and foreign-key check;
- KV pointer/version/hash and visible site revision;
- R2 head for representative public and private test fixtures;
- read-only consistency audit with complete R2 scan;
- upload rollback/cleanup and payment-proof metadata;
- publish idempotency/reconciliation and no failed/stuck operations;
- newsletter delivery state with no duplicate send;
- Workers Logs privacy check and expected correlation event;
- alert/monitor recovery and incident audit entry.

Close only when a second person verifies the checks, write controls are restored deliberately, and follow-up actions have owners/dates.
