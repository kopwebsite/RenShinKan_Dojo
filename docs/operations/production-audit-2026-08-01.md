# Production read-only audit — 2026-08-01

Scope: read-only D1/KV checks allowed by the current deployed configuration. No production write, migration, restore, upload, publish, delete, or deployment was performed.

## Results

- D1 served the aggregate query from `v3-prod`; the query reported `changes: 0`, `rows_written: 0`.
- D1 foreign-key violations: 0.
- Case-insensitive duplicate public student identifiers: 0.
- Orphan training-hour, examination-application, or payment-request item references: 0.
- Invalid student-to-dojo membership references: 0.
- Payment-proof metadata gaps: 0.
- Production KV uses the legacy editable-content key rather than the new version pointer. The content parsed as JSON and all four required translation containers (`en`, `th`, `ja`, `zh-CN`) were present. Raw content and keys were not printed.
- A D1 Time Travel current-bookmark lookup succeeded; the bookmark was not printed.
- `0024_production_hardening.sql` is pending. The new `publish_operations` table and full diagnostic queries therefore must not be assumed available yet.

## Deferred checks

The full R2 inventory comparison, KV-to-completed-publish-operation check, and failed/stuck publish scan were not run against production because:

1. the authenticated diagnostics code in this repository has not been deployed;
2. production is missing migration 0024; and
3. no separate R2 list credential was introduced for this local task.

After the authorized release takes a backup, applies migration 0024, and deploys the diagnostics endpoint, run `GET /api/admin/diagnostics` as a verified central administrator. A complete result requires `r2ScanComplete:true` and all metrics zero. Do not label production fully audited until that occurs.
