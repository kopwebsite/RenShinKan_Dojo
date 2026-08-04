# Backup and disaster recovery

Status: recovery tooling is implemented and tested locally. No production restore was performed. Scheduled export code is present but gated and **not active**.

## Verified D1 production facts — 2026-08-01

- Read-only `wrangler d1 info` succeeded for `renshinkan-student-records`.
- The database did not report the legacy `alpha` marker, and a current Time Travel bookmark lookup succeeded. It therefore uses the production storage model with Time Travel, not the removed legacy snapshot system.
- `0024_production_hardening.sql` is pending in production. Do not release the new diagnostics/publishing code until the normal release workflow backs up D1, applies this migration, and verifies health. This task did not apply it.
- The bookmark itself was intentionally not printed or stored in documentation.

D1 Time Travel is always on for production-backend databases. Retention is currently up to 7 days on Free and 30 days on Paid. Confirm the actual account plan before promising a recovery window. Time Travel is the fast short-window recovery mechanism; encrypted exports provide longer retention.

## Safe D1 point-in-time workflow

Read-only inspection:

```text
npx wrangler d1 time-travel info renshinkan-student-records --env production
npx wrangler d1 time-travel info renshinkan-student-records --env production --timestamp=<ISO-8601>
```

The first command returns the current bookmark. The timestamp form returns the bookmark representing the database at that time. Put bookmarks only in the restricted incident record; never in source, a ticket visible to the public, or application logs.

In-place Time Travel restore commands are destructive. Do not run one as an experiment. Required sequence:

1. Declare an incident, identify incident owner, UTC/Bangkok time, and affected writes.
2. Disable risky writes or place the site in maintenance using the approved release path.
3. Capture a fresh encrypted export of the current damaged state for forensics and rollback.
4. Resolve the target timestamp to a bookmark and have a second administrator verify database, environment, timestamp, and bookmark.
5. Restore an isolated recovery-test database first when the export path is usable.
6. Obtain explicit production-restore approval.
7. Run exactly one Time Travel restore by verified bookmark or timestamp.
8. Run health, migration, foreign-key, aggregate consistency, login, student lookup, publish, upload, and payment-proof checks.
9. Record the audit event and incident timeline. Re-enable writes only after sign-off.

Official commands and cautions are in [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/).

## Export and isolated restore

Manual production export (read-only against D1, but it writes a sensitive local file):

```text
npx wrangler d1 export renshinkan-student-records --remote --env production --skip-confirmation --output=<restricted-path>/production-<UTC>.sql
```

Immediately restrict permissions, encrypt it, calculate SHA-256, verify decryption, and remove the plaintext from the controlled temporary location. Never put an export in the repository, build output, Pages assets, a public R2 bucket, email, or chat.

The project recovery proof is:

```text
npm run test:recovery
```

It creates two separate D1 local persistence roots under an OS temporary directory, migrates the source, inserts one non-personal fixture, exports through Wrangler, restores into the independent target, verifies required schema, the fixture, and `PRAGMA foreign_key_check`, prints only a SHA-256 and safe counts, then deletes the validated temporary directory. The script contains no `--remote` path and reports `productionTouched:false`.

Official import/export guidance: [D1 import and export](https://developers.cloudflare.com/d1/best-practices/import-export-data/).

## Scheduled long-term D1 export

`.github/workflows/production-backup.yml` is a daily encrypted-export design. The entire job is skipped unless repository variable `ENABLE_PRODUCTION_BACKUPS` is exactly `true`. Do not set it until all items below are approved:

- a dedicated private R2 bucket with no public development URL or custom domain;
- a least-privilege Cloudflare token able to export only the needed D1 database and write only the backup bucket;
- protected GitHub environment `production-backup` and restricted maintainers;
- secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and `D1_BACKUP_ENCRYPTION_PASSWORD`;
- variable `D1_BACKUP_BUCKET` containing a non-secret bucket name;
- storage/operation cost and retention approval;
- bucket lock and lifecycle review.

Each generation is labelled `production`, timestamped in UTC, compressed, encrypted with AES-256-CBC and PBKDF2, decrypted through `gzip -t` before upload, and accompanied by a SHA-256 manifest. Filenames contain environment and time only—never a token, account/database ID, student identifier, or content. The bucket itself adds Cloudflare-managed AES-256 encryption at rest; application-side encryption protects the dump from accidental bucket read access.

Recommended policy after costs are known: keep 35 daily, 13 weekly, and 12 monthly generations. The current workflow creates daily generations but does not set lifecycle or delete anything. Add retention only after verifying the exact prefixes and add a bucket lock that prevents shortening retention accidentally. Never put a delete lifecycle on the production media bucket as a backup substitute.

Cloudflare also publishes a scheduled D1-to-R2 Workflow pattern. It is attractive for retries and streaming but requires another deployed Worker/Workflow, API token, and R2 cost. It was not enabled here. See [Export and save D1 database](https://developers.cloudflare.com/workflows/examples/backup-d1/), [R2 bucket locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/), and [R2 lifecycle rules](https://developers.cloudflare.com/r2/buckets/object-lifecycles/).

## Failed migration

1. Stop the release; D1 applies each migration transactionally and leaves earlier successful migrations applied when one fails.
2. Record the migration name and correlation/build ID, not row contents.
3. Export the current database.
4. Reproduce from an empty database and from a sanitized previous-schema fixture.
5. Prefer a new additive corrective migration. Never edit a migration already applied to any shared environment.
6. If the failed migration caused no committed changes, fix forward. If committed application writes are corrupt, use the approved point-in-time procedure.

## Accidental update or delete

Stop writes, record the earliest known bad time, export the current state, use Time Travel info to resolve a pre-incident bookmark, and restore an isolated target first. For a small incident, compare the isolated export and create an explicit, reviewed repair plan rather than rolling the whole database back and losing valid later writes. Every production repair must preview affected row counts and identifiers in a restricted channel, require a second reviewer, execute once, and create an audit event. The application includes no automatic repair mode.

## Permanent student deletion ("delete forever")

Archiving is the normal path and is fully reversible. Permanent deletion is not: it erases the student row, every related record, the stored profile photo and payment images, and strips the name and Student ID out of surviving audit entries. Nothing inside the application can bring it back. The only recovery is a backup or Time Travel restore taken **before** the deletion, so treat the daily export and the 7/30-day Time Travel window as the sole safety net.

Controls, all enforced on the server:

- the student must already be archived;
- the administrator must be able to manage that student's dojo;
- both confirmations plus the exact typed phrase `DELETE <Student ID>` are required;
- it is only ever available for one student at a time — there is no bulk permanent delete, and `students/bulk.ts` cannot perform one;
- everything happens in a single D1 batch, so a failure anywhere leaves the record untouched.

`migrations/0029_permanent_student_deletion.sql` adds `permanent_deletion_unlock`. The two immutable financial-history tables (`aat_membership_payments`, `payment_history`) still abort every delete unless that table holds a row naming **the same student** the row belongs to, and the application inserts and removes it inside the one deletion transaction. The unlock is therefore per-student, not global: a row left behind can only ever expose the single student it names, and a deletion can never reach past its own target. If a row is ever found in `permanent_deletion_unlock` outside a running deletion, still treat it as an incident and delete it — that one student's financial history is unprotected while it exists.

`student_deletion_records` is the accountable proof that a deletion happened — who, when, from which dojo, and how many records and files went. It deliberately stores no name, no Student ID and no student row ID.

## Leftover-record cleanup

`npm run cleanup:leftovers` (add `-- --env production`) only reads, prints a plain-language report, and writes a reviewable SQL file under `tmp/cleanup-review/`. It changes nothing without `--apply --i-have-a-backup`, and it refuses to run the apply step without that backup acknowledgement. It never drops a table, resets a database, or deletes a student; every statement clears rows that point at a student who is already gone, or recounts a stored total. Take the export in "Export and isolated restore" before approving an apply against production.

## KV and R2 recovery model

| Data                                       | Authoritative metadata                                    | Bytes/content                          | Recovery                                                                                                   |
| ------------------------------------------ | --------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Site pages, settings, translations         | D1 `site_revisions` plus publish operation/hash           | Versioned KV payload and pointer       | Rebuild the KV version/pointer from the verified D1 revision; keep KV encrypted export for faster recovery |
| Newsletters                                | D1 revisions and delivery rows; published site revision   | KV published payload                   | Rebuild public content from D1; never resend a delivery whose state is `sent` or `pending_verification`    |
| Gallery metadata                           | D1 gallery drafts and site revisions                      | KV published payload                   | Republish the verified revision after R2 object presence is checked                                        |
| Gallery/newsletter media and presentations | D1 `media_assets` plus KV references                      | R2 `admin/...` objects                 | Independently copy objects to a private backup bucket; restore the same immutable key and checksum         |
| Public documents                           | D1 `download_assets` or versioned repository static asset | R2 object or release artifact          | Rebuild static documents from the release; back up R2-only documents independently                         |
| Private payslips/payment proofs            | D1 `payment_proofs` metadata and audit trail              | Private R2 `payment-proofs/...` object | D1 and encrypted private R2 backup are both required; never copy to public storage                         |
| Student profile photos                     | D1 student/media metadata                                 | R2 profile object                      | Encrypted private R2 backup is required; preserve consent/status metadata and access controls              |

KV does not provide application revision history. The application’s immutable D1 site revisions and versioned KV keys are the recovery record; a scheduled encrypted KV export should list keys, bulk-read values, and store an encrypted generation after owner approval. Wrangler supports key listing and bulk get/put, but no KV backup job was activated here. See [KV list keys](https://developers.cloudflare.com/kv/api/list-keys/) and [Wrangler KV commands](https://developers.cloudflare.com/kv/reference/kv-commands/).

R2 durability protects against hardware loss, not intentional/accidental deletion. R2 does not supply general S3 object versioning for this application. Bucket locks reduce deletion risk; independent encrypted copies are still needed for irreplaceable private uploads. Repository assets and generated thumbnails can be recreated; original photos, payslips, presentations, and R2-only documents cannot. See [R2 durability](https://developers.cloudflare.com/r2/reference/durability/) and [R2 data security](https://developers.cloudflare.com/r2/reference/data-security/).

## Quarterly verification

Run the local recovery test on every release. Quarterly, after approval, select one encrypted production generation, verify its manifest hash, decrypt only in a restricted temporary runner, import to a separate recovery-test D1 database, run schema/foreign-key/consistency checks, verify a sample by aggregate only, and destroy the temporary target under a documented retention policy. Never use production as the restore target for a drill.
