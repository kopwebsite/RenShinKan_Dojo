# Production hardening release plan

This runbook is intentionally not executed by the hardening task. Replace every documented placeholder through authorized Cloudflare controls; never paste secrets into Git, command output, tickets, or chat.

## 1. Prepare isolated preview

1. Create dedicated preview D1, KV, and R2 resources plus a preview Turnstile widget. Do not clone production binding identifiers into preview.
2. Replace only the preview placeholders in `wrangler.toml`; configure preview secrets using Cloudflare secret controls.
3. Set preview `SITE_URL`, allowed origin, public Turnstile site key, and a release build ID. Run `npm run config:release` and require success.
4. Import a scrubbed or access-controlled production snapshot only when approved. Apply all migrations, then run the integrity and query-plan checks.
5. Deploy to preview through the authorized release workflow. Test anonymous, dojo administrator, central administrator, and student flows in normal and private browser contexts. Exercise invalid sessions, direct privileged URLs, storage failures, interrupted publishing/reconciliation, private downloads, and access-code reset.

## 2. Back up production and freeze writers

1. Schedule a maintenance window and temporarily stop administrator publishing and database mutations.
2. Record a D1 Time Travel bookmark and create an authorized D1 export. Verify that the backup can be read.
3. Export the current KV version pointer and referenced immutable payload, preserving keys and cryptographic hashes.
4. Inventory R2 objects, sizes, hashes/ETags, publication state, and metadata. Back up objects according to the existing retention policy.
5. Record the current Pages deployment/build ID and secret version names without recording secret values.

## 3. Configure release credentials

1. Apply the rotation checklist in `production-hardening-audit.md` only where exposure was confirmed or rotation was approved.
2. Replace the plaintext RenShinKan secondary compatibility value with its PBKDF2 hash and validate the hash before removing the plaintext value.
3. Configure all production secrets and bindings in Cloudflare. Confirm that no preview binding points at a production resource.
4. Set `BUILD_ID` to the release commit identifier. Run `npm ci`, `npm run config:release`, formatting, lint, typecheck, all tests, migration replay, the production build, and Playwright/axe tests from a clean checkout.

## 4. Apply and deploy

1. Apply migration 0024 to production before deploying code because authentication and rate limiting depend on its additive tables.
2. Run foreign-key, integrity, duplicate, orphan, status/date, media metadata, and query-plan checks. Stop on any unexpected row.
3. Deploy the exact tested artifact through the authorized Pages workflow. Do not run the disabled direct `npm run deploy` script.
4. Keep the writer freeze until build identity, authentication, publishing, and private-file checks pass.

## 5. Edge rate-limit/WAF rules

Application limits remain authoritative. Add Cloudflare WAF/rate-limiting rules as an outer layer, keying on the Cloudflare source IP and the exact method/path. Start in log mode, validate legitimate traffic, then use managed challenge or temporary block. Do not cache challenge responses.

| Endpoint class                      | Suggested edge threshold | Action after threshold                                    |
| ----------------------------------- | -----------------------: | --------------------------------------------------------- |
| `POST /api/admin/login`             |    8 per IP / 15 minutes | Managed challenge, then temporary block                   |
| `POST /api/records/lookup`          |   16 per IP / 15 minutes | Managed challenge; application also limits per student ID |
| `POST /api/admin/verify-renshinkan` |    8 per IP / 15 minutes | Temporary block; application also limits per account      |
| Payment-proof upload                |    8 per IP / 15 minutes | Managed challenge or temporary block                      |
| Administrator upload endpoints      |   20 per IP / 15 minutes | Temporary block; application also limits per account      |
| Publishing endpoints                |    30 per IP / 5 minutes | Temporary block; application also limits per account      |

Exclude verified internal health checks only by an authenticated, narrowly scoped rule. Never bypass limits based only on User-Agent or a client-supplied forwarding header. Review security events without logging passwords, access codes, Turnstile responses, or private file bodies.

## 6. Cache policy and targeted purge

- Bypass cache for `/api/*`, `/admin*`, login/session/selection responses, student records, and every response with authentication cookies or private data. Never use Cache Everything on those paths.
- Honor `private, no-store` from functions and administrator HTML. Keep public HTML revalidating rather than immutable.
- Cache only content-hashed `/assets/*` files as long-lived immutable objects. `build.json` must revalidate.
- After deployment, purge only changed public HTML routes, `index.html`, and `/build.json`. Do not purge hashed assets and do not perform a zone-wide purge unless incident response requires it.

## 7. Production verification

1. Confirm the deployed diagnostics build ID, `build.json`, and DOM build ID match. Confirm loaded JS/CSS URLs are the artifact's hashed assets.
2. Inspect headers on public HTML, `/api/*`, `/admin`, session/login/selection, private student responses, and assets. Confirm no private response is stored in browser or Cloudflare cache.
3. In equivalent normal/private sessions, verify the same role receives the same shell and allowed navigation. Confirm a dojo administrator is redirected from every central route, including nested gallery routes and unknown administrator paths.
4. Verify exactly one session bootstrap per app load, deliberate endpoint delay/error behavior, logout invalidation, and session revocation.
5. Verify exact-name legacy student access, issue a private code, verify code-required access, then reset/revoke it. Confirm partial/fuzzy names and enumeration attempts produce the same generic failure.
6. Verify rate limits survive User-Agent/forwarding-header changes, expire normally, and distinguish trusted IPv4/IPv6 Cloudflare sources. Confirm Turnstile action and hostname validation.
7. Publish a harmless previewed change, confirm D1 operation/revision/audit, versioned KV payload, and pointer order. Reconcile an approved interrupted operation and roll back to a known revision.
8. Confirm private proofs and pending downloads cannot be fetched anonymously and are served with safe attachment/type headers only to authorized roles.
9. Run the production integrity checks again and monitor sanitized request IDs, function errors, D1/KV/R2 error rates, login failures, and publish-operation stages.

## 8. Rollback

1. If code fails but data is sound, roll Pages back to the recorded prior deployment. Keep new additive tables; older code does not depend on removing them.
2. If a public pointer is wrong, restore the recorded known-good KV version pointer only after confirming its D1 revision is published.
3. If migration/data integrity fails, keep writers frozen and restore with the recorded D1 Time Travel bookmark or verified export under incident authorization.
4. Restore affected R2 objects from backup only after comparing inventory hashes and authorization metadata.
5. Re-run header/build/session/integrity checks before reopening writers. Record the incident without secret or personal-data payloads.
