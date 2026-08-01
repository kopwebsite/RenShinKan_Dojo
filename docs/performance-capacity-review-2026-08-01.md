# RenShinKan Dojo performance and capacity review

Review date: 2026-08-01 (Asia/Bangkok)

## Outcome

The application was exercised with deterministic, sanitized capacity data using isolated local Cloudflare Pages, D1, KV, and R2 emulation plus an isolated Cloudflare preview project. Production was not load-tested. The final bundle, browser, cache, API, query-plan, migration, and application-test gates pass.

The largest improvements were:

- Public bootstrap JSON fell from 2,079,034 to 76,872 bytes (-96.3%).
- Public downloads JSON fell from 237,324 to 26,598 bytes (-88.8%).
- The newsletter editor's initial JavaScript transfer fell from 311,444 to 187,677 bytes (-39.7%); the rich editor is now interaction-loaded.
- The admin website route's built JavaScript fell from 289.45 to 167.85 KiB gzip (-42.0%).
- Examination, monthly-contribution, AAT-membership, and payment-proof API medians improved by 59.0% to 87.9%.
- Gallery, dashboard, and audit-log layout shift fell from 0.420, 0.178, and 0.135 respectively to 0.
- A full public gallery response was replaced with four-album incremental pages; its tested transfer fell 21.7% while a load-more interaction measured 120 ms.

No accessibility, authorization, dojo-scope, publishing-safety, or data-correctness check was relaxed.

## Controlled test environment

- Browser profile: Chromium, 390x844, DPR 3, 4x CPU slowdown, 1.6 Mbps download, 750 Kbps upload, 150 ms RTT, cold browser cache, service workers blocked.
- API profile: seven sequential samples per endpoint after authentication; values below are local end-to-end response times.
- Capacity profile: bounded concurrent traffic to `127.0.0.1` only.
- Data: `sanitized-capacity-v1`; every person, identifier, note, payment, and file record is synthetic.
- Baseline and optimized D1 states were separate. Concurrent mutation checks used invalid isolated requests and did not publish, upload, or change valid records.
- `productionTouched` is `false` in every generated browser, API, D1, cache, and concurrency report.
- The isolated preview used project `renshinkan-dojo-release-preview`, a preview-only D1 database/KV namespace/R2 bucket, and bounded sanitized content (50 newsletters, 12 galleries, and 96 gallery images). The complete 54-test browser matrix passed at the immutable preview deployment `https://6c70f374.renshinkan-dojo-release-preview.pages.dev`.

### Fixture inventory

| Data set | Count |
| --- | ---: |
| Students | 2,000 |
| Dojos | 6 |
| Training records (36 months) | 72,000 |
| Examination history | 8,000 |
| Examination applications | 6,000 |
| Monthly payment records | 12,024 |
| AAT payment records | 6,000 |
| Payment-proof metadata | 18,024 |
| Newsletters | 500 |
| Gallery albums / photos | 120 / 2,400 |
| Generated downloads | 400 |
| Audit entries | 100,000 |

The fixture also includes a deterministic synthetic shared-passport capability so the complete passport can be measured without Turnstile or real student data. Fixture generation is deliberately marked local-only and not production-safe.

## Before and after

### API responses

Seven-run local results. Payload size is the response body before HTTP transfer encoding.

| Endpoint | Before median | After median | After p95 | Before bytes | After bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| Public content | 130.16 ms | 82.98 ms | 98.68 ms | 2,079,034 | 76,872 |
| Public downloads | 31.96 ms | 19.52 ms | 22.23 ms | 237,324 | 26,598 |
| Admin student list | 29.80 ms | 33.04 ms | 48.11 ms | 4,769 | 4,769 |
| Student workspace | 26.86 ms | 31.56 ms | 35.55 ms | 31,562 | 31,562 |
| Training requests | 26.17 ms | 31.46 ms | 35.39 ms | 4,781 | 4,781 |
| Examination applications | 213.49 ms | 73.67 ms | 84.31 ms | 20,061 | 20,061 |
| Monthly contributions | 412.38 ms | 153.37 ms | 194.38 ms | 19,641 | 19,641 |
| AAT memberships | 215.72 ms | 26.12 ms | 30.40 ms | 44,097 | 44,097 |
| Payment proofs | 228.68 ms | 93.69 ms | 105.77 ms | 15,900 | 15,900 |
| Newsletter status | 88.49 ms | 12.79 ms | 16.80 ms | 96 | 96 |
| Scoped gallery manager | 107.60 ms | 66.53 ms | 85.12 ms | 2,312,974 | 771,212 |
| Admin downloads | 29.78 ms | 23.48 ms | 26.39 ms | 274,415 | 34,448 |
| Audit page | 65.97 ms | 83.63 ms | 154.50 ms | 32,160 | 32,124 |

The audit endpoint remains bounded to 40 rows, but its optimized local run was slower than baseline. This is retained as a budget-edge warning rather than hidden; the 100,000-row p95 was 154.50 ms against a 160 ms budget.

### Browser improvements

| Page / metric | Before | After |
| --- | ---: | ---: |
| Homepage LCP | 3,521 ms DevTools trace | 2,876 ms |
| Homepage API transfer | 59,963 B | 4,999 B |
| Homepage used heap | 7.90 MB | 5.76 MB |
| Gallery transfer | 1,177,855 B | 1,002,623 B after loading another page |
| Gallery image transfer | 817,903 B | 701,668 B after loading another page |
| Gallery CLS | 0.4197 | 0 |
| Downloads DOM nodes | 13,897 | 1,665 |
| Downloads API transfer | 69,288 B | 5,584 B |
| Dashboard CLS | 0.1785 | 0 |
| Newsletter editor JavaScript | 311,444 B | 187,677 B |
| Newsletter editor API transfer | 103,459 B | 5,443 B |
| Newsletter editor DOM nodes | 1,417 | 618 |
| Gallery manager API transfer | 42,303 B | 14,637 B |
| Audit CLS | 0.1349 | 0 |

### Final page traces

These are exact single cold mobile traces. The targeted final reruns replace the earlier optimized gallery, dashboard, audit, homepage, and newsletter-index traces after CLS and duplicate-request corrections.

| Page | FCP | LCP | CLS | Transfer | JS | Used heap |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Public homepage | 1,800 ms | 2,876 ms | 0 | 1,926,016 B | 152,517 B | 5.76 MB |
| Newsletter index | 1,576 ms | 7,028 ms | 0 | 1,260,034 B | 165,467 B | 4.54 MB |
| Newsletter article | 1,700 ms | 5,828 ms | 0 | 1,015,433 B | 165,449 B | 3.96 MB |
| Presentation viewer | 1,592 ms | 6,008 ms | 0 | 1,061,217 B | 165,449 B | 4.46 MB |
| Gallery, after load more | 1,668 ms | 5,492 ms | 0 | 1,002,623 B | 154,166 B | 5.03 MB |
| Downloads | 1,580 ms | 2,072 ms | 0.0012 | 618,786 B | 153,299 B | 4.71 MB |
| Student-record lookup | 1,608 ms | 3,144 ms | 0 | 676,716 B | 208,228 B | 4.56 MB |
| Student passport | 1,600 ms | 3,508 ms | 0.0093 | 664,454 B | 195,002 B | 4.85 MB |
| Admin dashboard | 2,060 ms | 2,428 ms | 0 | 295,643 B | 154,213 B | 4.98 MB |
| Student database | 2,096 ms | 3,300 ms | 0.0003 | 334,070 B | 191,224 B | 4.87 MB |
| Student workspace | 1,936 ms | 2,832 ms | 0 | 337,457 B | 191,224 B | 6.61 MB |
| Training requests | 1,972 ms | 2,960 ms | 0 | 334,067 B | 191,224 B | 4.82 MB |
| Examination applications | 1,944 ms | 2,700 ms | 0.0995 | 315,954 B | 171,386 B | 4.94 MB |
| Payments | 1,952 ms | 2,652 ms | 0 | 313,580 B | 171,386 B | 4.27 MB |
| Newsletter editor | 2,012 ms | 2,980 ms | 0 | 1,709,310 B | 187,677 B | 4.96 MB |
| Gallery manager | 2,008 ms | 4,588 ms | 0.0008 | 505,620 B | 166,641 B | 6.97 MB |
| Audit log | 2,036 ms | 2,640 ms | 0 | 300,074 B | 155,608 B | 4.31 MB |

Interaction and main-thread details:

- Homepage Help/Auggie open: 323.88 ms wall time; 136 ms event-timing maximum. Six long tasks, 310 ms longest, 876 ms total.
- Gallery incremental load: 981.40 ms including network and render; 120 ms event-timing maximum. Three long tasks, 180 ms longest, 399 ms total.
- Admin dashboard Help/Auggie open: 197 ms wall time; 64 ms event-timing maximum.
- The fixture pages produced no duplicate resource URL in the final targeted traces.

The event-timing maximum is used as the controlled INP proxy. A production field INP cannot be inferred from a local synthetic trace.

## Database work

### Fixed query behavior

- Examination and monthly-contribution lists now filter, count, summarize, order, and paginate in D1. They no longer load complete rosters into the Worker and then filter in JavaScript.
- AAT membership history is loaded only for the current 40-row page, removing an N+1 pattern across the entire student population.
- Student lists remain bounded to 20 rows by default and at most 100; the browser never receives all 2,000 students.
- Audit remains server-paginated at 40 rows and never loads all 100,000 entries.
- Public/admin downloads use 40/50-row pages. Galleries use four-album incremental pages. Newsletter archive pages return nine summaries.
- Exact dojo predicates are part of the initial D1 selection on scoped student, exam, contribution, payment, and audit paths.
- Admin text search uses prefix matching with escaped input rather than a leading-wildcard scan.
- Counts and status summaries use aggregate SQL instead of counting full result arrays.
- Payment-reference and proof paths have covering/partial indexes for their actual join and ordering predicates.

### Added indexes and representative plans

Migration `0025_performance_capacity_indexes.sql` adds nine justified indexes. Representative plan changes:

| Query | Before | After |
| --- | --- | --- |
| Scoped students | `idx_students_dojo_profile_active` plus temporary order B-tree | `idx_students_dojo_active_profile_name`; no temporary ordering |
| Examination roster | `idx_exam_cycle_status_cycle_status` plus temporary order B-tree | `idx_exam_cycle_status_cycle_state_name`; no temporary ordering |
| Monthly roster | period index plus temporary final-order B-tree | `idx_contribution_roster_month_active_name`; no temporary ordering |
| Pending AAT payment | non-covering student/type index | covering `idx_payments_student_type_status_date` |
| Payment reference join | student-only index, 14 ms sample | covering reference/student/request index, 1 ms sample |
| Audit page | dojo/created index, bounded 40 rows | same appropriate index; final order tie-break still uses a small temporary B-tree |

Membership and audit ordering still show a bounded temporary B-tree in the representative plan. Adding broader indexes solely to eliminate those small page-local sorts was not justified by the data.

### Query count and D1 time

Instrumentation is enabled only when `APP_ENV=local` and `PERFORMANCE_DIAGNOSTICS=true`; it cannot expose these headers in preview or production.

| API | Queries | D1 time |
| --- | ---: | ---: |
| Public content | 1 | 5 ms |
| Public downloads | 2 | 12 ms |
| Admin session | 3 | 32 ms |
| Dashboard | 3 | 65 ms |
| Student list | 7 | 47 ms |
| Student workspace | 10 | 49 ms |
| Training requests | 7 | 49 ms |
| Examinations | 6 | 74 ms |
| Monthly contributions | 8 | 223 ms |
| AAT memberships | 4 | 57 ms |
| Payment proofs | 5 | 155 ms |
| Newsletter status | 2 | 30 ms |
| Gallery manager | 3 | 70 ms |
| Admin downloads | 4 | 45 ms |
| Audit | 4 | 119 ms |

These are Wrangler local D1 timings, useful for comparison and query-count enforcement but not a prediction of Cloudflare regional latency.

## Frontend and delivery changes

- Route-level React lazy loading is retained for public and admin pages.
- The 473,268-byte `AdminPage` module was split into an 18,927-byte route shell, a 56,773-byte newsletter manager, and a 397,392-byte rich-editor interaction chunk.
- Newsletter CSS moved out of the public initial stylesheet and is loaded by newsletter/editor routes.
- Help/Auggie remains keyboard-accessible and loads its panel and content only on open.
- Admin pages share one authoritative session provider; the prior duplicate `/api/admin/session` request on the student database route is gone.
- Dedicated newsletter and gallery APIs stop transferring the full editable-content document to every visitor. Translation data is no longer repeatedly included in those API payloads.
- Responsive AVIF/WebP sources, explicit dimensions, lazy loading, and stable placeholders are retained. A gallery thumbnail no longer issues the same media URL twice.
- Stable gallery, admin-alert, and audit placeholders remove measured loading shifts without changing page design or semantics.
- The Cormorant font is preloaded; the DevTools baseline had it on the 3,467 ms critical path.
- An import inventory found every production dependency referenced; no dependency was deleted speculatively.

### Bundle result

| Artifact | Before gzip | After gzip |
| --- | ---: | ---: |
| Public initial JS (main + React) | 145.48 KiB | 165.60 KiB |
| Admin dashboard initial JS | 289.45 KiB | 167.41 KiB |
| Admin website initial JS | 289.45 KiB | 187.54 KiB |
| Initial CSS | 55.80 KiB | 49.70 KiB |
| Rich editor | part of initial AdminPage | 123.47 KiB interaction chunk |

The public-JS increase includes the hardened shared bootstrap boundary. It remains below the measured 170 KiB release budget, and all large admin-only editing code remains off public routes.

## Cache verification

The automated local cache verifier passed all six assertions:

| Resource | Verified policy |
| --- | --- |
| Public HTML | `public, max-age=0, must-revalidate` |
| Student/private HTML | `private, no-store` |
| `build.json` | `no-cache, must-revalidate` |
| Hashed `/assets/*` | `public, max-age=31536000, immutable` |
| Explicitly safe `/api/content` | `public, max-age=60, stale-while-revalidate=300` |
| Admin session API | `private, no-store` |

The application shell and deployment marker therefore revalidate, while content-addressed assets remain immutable. General API/admin responses are private or no-store unless a route explicitly declares a safe public policy.

## Performance budgets

`performance-budgets.json` records budgets chosen from these measurements:

- Public initial JS: 170 KiB gzip.
- Admin dashboard JS: 170 KiB gzip.
- Admin website JS: 190 KiB gzip.
- Largest route chunk: 135 KiB gzip.
- Initial CSS: 55 KiB gzip.
- Largest 640 px AVIF: 210 KiB.
- Homepage: LCP 3.5 s, INP proxy 200 ms, CLS 0.10, images 1.70 MB.
- Gallery: LCP 6.5 s, INP proxy 200 ms, CLS 0.10, images 1.20 MB.
- Dashboard: LCP 3.5 s, INP proxy 200 ms, CLS 0.10, JS transfer 230 KB.
- Critical API p95 budgets: 100-200 ms according to the measured endpoint.

The checker warns above 90% and fails above the limit or when a requested browser metric is missing. Static bundle checks run after the production build in CI. The full local budget run passed; expected warnings currently include public JS, initial CSS, rich-editor chunk, homepage image bytes, monthly-contribution p95, and audit p95.

## Concurrent capacity results

| Scenario | Requests / concurrency | Statuses | p50 | p95 | Maximum | Throughput | Client RSS delta |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| Public reads | 120 / 20 | 120x 200 | 406.27 ms | 1,485.96 ms | 2,602.31 ms | 19.86 req/s | +13,639,680 B |
| Student lookup/rate limit | 30 / 5 | 6x 404, 24x 429 | 82.24 ms | 166.70 ms | 180.89 ms | 43.40 req/s | -4,345,856 B |
| Admin lists | 80 / 10 | 80x 200 | 351.00 ms | 700.87 ms | 983.21 ms | 14.82 req/s | +4,620,288 B |
| Newsletter publishing safeguard | 12 / 4 | 12x 400 | 56.79 ms | 60.40 ms | 60.40 ms | 63.04 req/s | +233,472 B |
| Upload-init validation | 12 / 4 | 12x 400 | 107.24 ms | 109.94 ms | 109.94 ms | 35.76 req/s | -126,976 B |

The 24 rate-limit responses confirm enforcement. Publishing and upload cases intentionally failed validation before mutation. `destructiveConcurrentMutations` is `false`.

A second capacity sample taken while the same workstation was under heavy browser/build load produced higher p95 values (public 1,771.76 ms, lookup 1,716.20 ms, admin 3,706.31 ms, publishing safeguard 1,105.58 ms, and upload validation 1,423.01 ms) while host CPU averaged 82.34%. It is retained as a host-contention observation, not substituted for the controlled run above and not represented as Cloudflare capacity.

## Remaining bottlenecks

- The homepage still transfers 1,628,315 image bytes and produced a 310 ms longest main-thread task. Its budgets are intentionally close and should not be raised without remeasurement.
- Newsletter-index and presentation/image-led pages have 5.5-7.0 s synthetic mobile LCP. Further progress needs art-direction/compression changes to their largest media, not a structural redesign.
- The editable-content KV value is still a large document. Public responses are projected and paginated, but the Worker must parse the full KV document before producing newsletter/gallery pages. Splitting newsletters and galleries into separately keyed content is the next meaningful backend improvement.
- The selected gallery editor still transfers 771,212 raw JSON bytes because one synthetic gallery contains many photos. Media-level pagination inside the selected album is the next step if real galleries approach this fixture.
- Monthly contributions (194.38 ms p95), payment proofs (105.77 ms p95), and audit (154.50 ms p95) remain the most important D1/API watch points.
- Local Wrangler concurrency is not a Cloudflare capacity limit. A future preview-only test may validate regional D1/KV latency, but production must remain excluded.

## Reproduction and verification

Primary commands:

```text
npm run perf:fixtures
npm run perf:prepare
npm run perf:queries
npm run perf:api
npm run perf:browser
npm run perf:capacity
npm run perf:cache
npm run perf:budget
```

Safety guards in the capacity runner reject every non-local hostname by default, reject `renshinkandojo.org` unconditionally, and require an explicit flag even for a Pages preview hostname.

Final verification:

- TypeScript: passed.
- Vitest: 18 files, 198 tests passed.
- D1 empty replay and previous-schema upgrade: passed through migration 0025.
- Production Vite build: passed.
- Local Playwright release matrix: 54/54 passed across Chromium, Firefox, and WebKit.
- Isolated Cloudflare preview Playwright release matrix: 54/54 passed across Chromium, Firefox, and WebKit.
- Cache policy: 6/6 assertions passed.
- Performance budgets: passed with the documented edge warnings.
- Production load test: **not performed**.
