# Read-only consistency audit

The authenticated `GET /api/admin/diagnostics` audit is read-only and bounded. It scans at most 10,000 R2 objects, reports whether the scan completed, and returns aggregate counts only.

Checks:

- required D1 object metadata whose R2 object is missing;
- R2 objects without D1 metadata or a published KV reference;
- published-content upload references without authoritative D1 metadata;
- a KV publish pointer without a completed matching D1 publish operation;
- malformed KV JSON/content;
- failed or publishing operations stuck for more than 15 minutes;
- payment proof rows missing required storage metadata;
- case-insensitive duplicate public student identifiers;
- orphan training-hour, examination, or payment-request records;
- invalid student or administrator dojo membership references;
- D1 foreign-key violations;
- missing required `en`, `th`, `ja`, or `zh-CN` site-settings translation objects.

Safety boundaries:

- no `put`, `delete`, `update`, `insert`, or D1 batch is called;
- no automatic deletion occurs, including for apparent orphan R2 objects;
- object keys and record identities never leave the Worker;
- an incomplete R2 listing cannot report a clean audit;
- `POST` and every repair request return `405`;
- a missing table/migration returns `audit_unavailable`, not a guessed clean result.

Production currently has migration `0024_production_hardening.sql` pending, so the complete audit cannot pass there until the authorized release applies it. Do not work around that by weakening queries.

## Repair procedure (manual only)

1. Export D1 and back up the relevant KV/R2 objects.
2. Reproduce the condition in a separate recovery-test database and private test bucket.
3. Produce a preview listing exact affected identifiers and before/after state in a restricted artifact.
4. Confirm no valid later write would be overwritten.
5. Obtain explicit repair approval and a second reviewer.
6. Execute a narrowly scoped, idempotent repair. Never delete an orphan merely because one scan cannot find metadata.
7. Insert an `audit_log` event with actor, action, entity, request/correlation ID, source, summary, and before/after metadata—never private object content.
8. Rerun the audit and functional smoke tests.

The failure-injection test suite proves malformed KV, failed/stuck publishing, unavailable bindings, and wrong/missing migration paths return safe states and perform no repair writes. Recoverable publishing tests separately prove that KV is not activated when D1 confirmation fails and that the same idempotent operation can be reconciled safely.
