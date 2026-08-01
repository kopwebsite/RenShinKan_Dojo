# Monitoring and alerting

Status: implemented locally; not deployed. External notifications are **not configured or active**.

## What the application records

`wrangler.toml` enables persisted Workers Logs at 100% head sampling and traces at 5%. The site is expected to be low traffic; review log volume after the first production week and lower log sampling only if cost or quota requires it. Reducing sampling can hide rare authentication or storage failures.

Every application event is a closed, structured object containing only:

- timestamp, event, category, correlation/request ID;
- route template, method, and status;
- environment and build ID;
- validated administrator account ID and dojo scope when the handler has them.

Never add query strings, raw URLs with identifiers, IP addresses, cookies, authorization headers, request/response bodies, names, email addresses, payment data, object keys, KV values, D1 rows, uploaded content, error messages, or stack traces to `operationalEvent`. Dynamic student, proof, examination, share, and upload paths are replaced by route placeholders.

The `/api` and `/uploads` Pages middleware:

1. accepts a valid caller `X-Request-ID` or creates a UUID;
2. passes the same ID to every downstream function;
3. adds `X-Correlation-ID` to every response;
4. adds `correlationId` to JSON 5xx bodies;
5. logs 401/403 authentication denials, 429 rate limits, API 5xx responses, and uncaught exceptions;
6. converts uncaught exceptions to a private, understandable JSON error without exposing the exception.

Publishing logs safe stage-specific events for KV version writes, D1 confirmation, and KV pointer activation. Workers traces provide sampled automatic timing for D1, KV, R2, and outbound requests.

## Health endpoints

### Public

`GET /api/diagnostics/health` returns only:

- `ok` or `degraded` status;
- time, environment, and public build ID;
- booleans for Worker, D1, KV, R2, migrations, and publishing consistency;
- a correlation ID.

It never returns binding IDs, bucket or database names, record or object counts, identities, migration history, object keys, contents, error text, or stack traces. `503` means at least one check is degraded. D1 runs `SELECT 1`; KV performs a read of the published pointer; R2 performs a `head` against a deliberately absent diagnostic key; migration and publish-state queries verify schema and consistency. These prove reachability and expected schema, not the physical identity of KV/R2; `scripts/validate-cloudflare-config.mjs` verifies environment isolation before release.

### Authenticated administrator

`GET /api/admin/diagnostics` requires a selected, second-factor-verified RenShinKan central administrator. It returns the safe check details and aggregate consistency counts. It still never returns resource IDs, object keys, student identities, request bodies, or storage contents.

`POST /api/admin/diagnostics` is always rejected with `405`. No automatic repair implementation exists.

## First response in Cloudflare

1. Open **Workers & Pages → renshinkan-dojo → Observability**.
2. Set environment/build filters first.
3. Search the exact `correlationId` supplied by the reporter.
4. If no ID is available, filter `category` and a narrow time window.
5. For runtime exceptions, use `$metadata.error EXISTS` or `$workers.outcome = "exception"`.
6. Correlate a custom event to its invocation and trace. Do not copy private request data into incident notes.

Useful category filters are `unexpected_error`, `api_failure`, `authentication_denied`, `rate_limit_denied`, `database_failure`, `kv_failure`, `r2_failure`, `publishing_failure`, `upload_failure`, and `payment_proof_failure`.

## Alert plan

The source-of-truth thresholds are in `docs/operations/alert-policy.json`. They are intentionally marked `planned_not_active`.

| Condition                       | Suggested trigger                                                              | Severity | First action                                                            |
| ------------------------------- | ------------------------------------------------------------------------------ | -------- | ----------------------------------------------------------------------- |
| Uncaught exception or 5xx       | 3 in 5 minutes, or any continuous health failure for 5 minutes                 | Critical | Check build, health booleans, correlation events, and Cloudflare status |
| Administrator auth failures     | 10 in 15 minutes; rate limit is immediate review                               | High     | Look for credential attack, then rotate/revoke if suspicious            |
| Student verification failures   | 20 in 15 minutes and above normal baseline                                     | Medium   | Check Turnstile, D1, and UI changes; do not inspect entered names       |
| D1/KV/R2 operational event      | Any event twice in 10 minutes                                                  | High     | Check binding health and Cloudflare product status                      |
| Failed/stuck publishing         | Any failed operation or publishing state older than 15 minutes                 | High     | Stop retries; reconcile the operation after verifying D1/KV state       |
| Payment-proof/upload errors     | 3 in 15 minutes                                                                | High     | Set `UPLOADS_ENABLED=false` if errors risk partial state                |
| Abnormal traffic                | More than 3× the four-hour baseline for 10 minutes, with at least 200 requests | Medium   | Check WAF/traffic analytics and rate limiting                           |
| Missing migration/wrong binding | Any degraded health after release                                              | Critical | Stop rollout or roll back frontend; do not mutate production data       |
| Deployment/build failure        | Any failed authorized release job or unexpected build ID                       | Critical | Leave current deployment active and inspect CI/release logs             |

Cloudflare-native setup after owner approval:

- Create an HTTP Error Rate Notification when the account plan exposes it. Use medium/low sensitivity for this low-traffic site to avoid one-error noise; Cloudflare notes that high sensitivity performs poorly on low traffic.
- Add a monitor that requests `/api/diagnostics/health` every five minutes from outside the site. This requires an approved external service or a separately reviewed Cloudflare Worker; neither exists now.
- Workers Logs and Query Builder provide queries, not confirmed delivery for these custom thresholds. A Tail Worker can implement notifications, but it requires a Workers Paid or Enterprise plan and has not been enabled.
- Cloudflare Notifications delivery availability depends on the zone/account plan. Email is the lowest-dependency destination. Webhook/PagerDuty must not be claimed until a test notification is received.

After configuration, record the owner, destination, test date, plan/cost, and screenshot or notification ID in this document. Test each channel with a preview-only synthetic event; never cause a destructive production fault.

Official references: [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/), [Workers Query Builder](https://developers.cloudflare.com/workers/observability/query-builder/), [Workers errors](https://developers.cloudflare.com/workers/observability/errors/), [HTTP Traffic Alerts](https://developers.cloudflare.com/notifications/reference/traffic-alerts/), and [Tail Workers](https://developers.cloudflare.com/workers/observability/logs/tail-workers/).
