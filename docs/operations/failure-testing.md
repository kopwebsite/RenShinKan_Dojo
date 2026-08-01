# Failure testing evidence

All tests use local fakes, isolated local D1, or preview-style builds. No destructive production failure was injected.

| Failure                                  | Test/evidence                                                                    | Required behavior                                                                                      |
| ---------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| D1 unavailable/timeout                   | `operations-resilience.test.ts` rejects the D1 probe                             | Health is degraded; no exception text or data is returned                                              |
| KV unavailable                           | KV probe rejection                                                               | `read_failed`; no KV value is logged or returned                                                       |
| R2 unavailable/wrong binding             | R2 `head` rejection or missing method                                            | Health is degraded; safe storage message and correlation ID                                            |
| Malformed KV content                     | malformed pointer/content audit and existing hardening tests                     | Fail closed; preserve current data; report aggregate malformed state                                   |
| R2 failure during multi-file upload      | second `put` rejects                                                             | Previously written object is deleted; original failure is surfaced as safe retryable storage failure   |
| Upload metadata failure                  | site/gallery endpoints retain the new key only after atomic D1 metadata succeeds | Failed D1 confirmation attempts object cleanup; any cleanup survivor is detected as an orphan          |
| Publish reservation failure              | publishing state-machine test                                                    | No public KV write and no revision                                                                     |
| KV version write failure                 | publishing state-machine test                                                    | Operation becomes failed; no D1 revision or active pointer                                             |
| D1 confirmation failure                  | publishing state-machine test                                                    | Active KV pointer is not changed; valid public content remains active                                  |
| KV pointer activation failure            | publishing reconciliation test                                                   | Confirmed D1 revision is retained and the same operation can be reconciled without duplicate revision  |
| Expired/invalid admin or student session | existing auth and student-access tests                                           | 401/403 with no protected child/data flash; middleware records only sanitized denial metadata          |
| Missing migration                        | health probe returns the previous migration                                      | `migration_pending`/503; release must stop                                                             |
| Failed/stuck publishing                  | aggregate audit fixture                                                          | Non-zero aggregate count; no repair write                                                              |
| Uncaught route exception                 | middleware throws a private fake error                                           | Generic 500 plus correlation ID; private exception is absent from logs and response                    |
| Downstream JSON 5xx                      | middleware fixture                                                               | Original understandable response gains the same correlation ID                                         |
| Recovery export/import                   | `npm run test:recovery`                                                          | Separate source/target local D1, required schema/fixture/FK checks, SHA-256, `productionTouched:false` |

Run the focused suite:

```text
npx vitest run tests/operations-resilience.test.ts tests/production-hardening-runtime.test.ts
npm run test:recovery
npx wrangler pages functions build functions --outdir tmp/pages-functions-build --project-directory . --compatibility-date 2026-07-01
```

Then run the full repository gates. A failure test passes only if:

- logs contain no secret, private request/body/content, dynamic identity, URL query, object key, raw error message, or stack;
- existing valid D1/KV/R2 state is not overwritten;
- any completed immutable stage remains reconcilable;
- a partial R2 upload is cleaned or reported by the audit;
- the user receives a safe retry instruction and correlation ID;
- retries are idempotent, except uncertain newsletter delivery which explicitly forbids retry until provider verification.
