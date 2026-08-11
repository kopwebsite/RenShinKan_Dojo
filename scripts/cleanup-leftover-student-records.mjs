/**
 * Finds leftover records from earlier mistakes and writes a plain-language
 * report plus a reviewable SQL file. It NEVER changes anything on its own.
 *
 *   node scripts/cleanup-leftover-student-records.mjs                 (local)
 *   node scripts/cleanup-leftover-student-records.mjs --env production
 *
 * Reading is always safe. Applying is a separate, deliberate step:
 *
 *   node scripts/cleanup-leftover-student-records.mjs --env production \
 *     --apply --i-have-a-backup
 *
 * Nothing here drops a table, resets a database, or deletes a student. Every
 * statement is a narrow DELETE or UPDATE of rows that point at a student who
 * is already gone, or a recount of a stored total that drifted.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repository = resolve(fileURLToPath(new URL("..", import.meta.url)));
const wranglerCli = join(repository, "node_modules", "wrangler", "bin", "wrangler.js");

const args = process.argv.slice(2);
const envIndex = args.indexOf("--env");
const targetEnv = envIndex === -1 ? "" : args[envIndex + 1] || "";
const apply = args.includes("--apply");
const backupConfirmed = args.includes("--i-have-a-backup");
const isProduction = targetEnv === "production";

if (apply && !backupConfirmed) {
  console.error(
    "\nRefusing to change anything.\n" +
      "Take a backup first, then repeat the command with --i-have-a-backup.\n",
  );
  process.exit(1);
}

const LIVE_ROSTER =
  "s.active = 1 AND s.archived_at IS NULL AND s.deleted_at IS NULL " +
  "AND s.profile_status IN ('pending_admin_approval', 'approved')";

/**
 * Each check explains itself in plain words, counts the problem rows, and
 * carries the exact statement that would fix it.
 */
const CHECKS = [
  {
    id: "audit_entries_for_missing_students",
    title: "History entries pointing at a student who no longer exists",
    why: "These are left over from older deletions. The name and Student ID are cleared and the entry stops pointing at a missing record.",
    count: `SELECT COUNT(*) AS count FROM audit_log a
      WHERE a.student_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM students s WHERE s.id = a.student_id)`,
    fix: `UPDATE audit_log SET student_id = NULL, student_public_id_snapshot = NULL,
        student_name_snapshot = NULL, previous_values = NULL, new_values = NULL,
        administrator_note = NULL,
        action_summary = 'Student details erased by permanent deletion'
      WHERE student_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM students s WHERE s.id = audit_log.student_id)`,
  },
  {
    id: "month_roster_for_missing_students",
    title: "Month roster lines for a student who no longer exists",
    why: "A roster line without a student makes the monthly contributions totals wrong.",
    count: `SELECT COUNT(*) AS count FROM contribution_period_students r
      WHERE NOT EXISTS (SELECT 1 FROM students s WHERE s.id = r.student_id)`,
    fix: `DELETE FROM contribution_period_students
      WHERE NOT EXISTS (SELECT 1 FROM students s WHERE s.id = contribution_period_students.student_id)`,
  },
  {
    id: "exam_roster_for_missing_students",
    title: "Examination cycle lines for a student who no longer exists",
    why: "Same problem on the examination screens.",
    count: `SELECT COUNT(*) AS count FROM exam_cycle_student_status e
      WHERE NOT EXISTS (SELECT 1 FROM students s WHERE s.id = e.student_id)`,
    fix: `DELETE FROM exam_cycle_status_history
      WHERE cycle_status_id IN (SELECT id FROM exam_cycle_student_status e
        WHERE NOT EXISTS (SELECT 1 FROM students s WHERE s.id = e.student_id));
      DELETE FROM exam_cycle_student_status
      WHERE NOT EXISTS (SELECT 1 FROM students s WHERE s.id = exam_cycle_student_status.student_id)`,
  },
  {
    id: "failed_operation_notes_for_missing_students",
    title: "Failed-job notes about a student who no longer exists",
    why: "The note can no longer be acted on and still holds a pointer to the missing record.",
    count: `SELECT COUNT(*) AS count FROM operation_failures o
      WHERE o.student_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM students s WHERE s.id = o.student_id)`,
    fix: `UPDATE operation_failures SET student_id = NULL
      WHERE student_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM students s WHERE s.id = operation_failures.student_id)`,
  },
  {
    id: "empty_payment_requests",
    title: "Payment requests with nothing left in them",
    why: "Every student on the request was removed, so the request is an empty shell.",
    count: `SELECT COUNT(*) AS count FROM payment_requests p
      WHERE NOT EXISTS (SELECT 1 FROM payment_request_items i WHERE i.payment_request_id = p.id)`,
    fix: `DELETE FROM payment_requests
      WHERE NOT EXISTS (SELECT 1 FROM payment_request_items i WHERE i.payment_request_id = payment_requests.id)`,
  },
  {
    id: "stale_month_totals",
    title: "Saved month totals that no longer match the roster",
    why: "The number shown on the monthly contributions summary drifted away from the students actually on the roster.",
    count: `SELECT COUNT(*) AS count FROM contribution_periods p
      WHERE p.active_student_count_snapshot <> (
        SELECT COUNT(*) FROM contribution_period_students r
        JOIN students s ON s.id = r.student_id
        WHERE r.month_key = p.month_key AND r.active_at_period_start = 1
          AND s.dojo_id = 'dojo-rsk' AND ${LIVE_ROSTER})`,
    fix: `UPDATE contribution_periods SET active_student_count_snapshot = (
        SELECT COUNT(*) FROM contribution_period_students r
        JOIN students s ON s.id = r.student_id
        WHERE r.month_key = contribution_periods.month_key AND r.active_at_period_start = 1
          AND s.dojo_id = 'dojo-rsk' AND ${LIVE_ROSTER})`,
  },
  {
    id: "orphan_share_links",
    title: "Share links for a student who no longer exists",
    why: "A share link with no student behind it should not stay in the list.",
    count: `SELECT COUNT(*) AS count FROM share_tokens t
      WHERE NOT EXISTS (SELECT 1 FROM students s WHERE s.id = t.student_id)`,
    fix: `DELETE FROM share_tokens
      WHERE NOT EXISTS (SELECT 1 FROM students s WHERE s.id = share_tokens.student_id)`,
  },
];

function d1(sql) {
  const commandArgs = [
    wranglerCli,
    "d1",
    "execute",
    "STUDENT_DB",
    "--config",
    "wrangler.toml",
    ...(targetEnv ? ["--env", targetEnv] : []),
    targetEnv ? "--remote" : "--local",
    "--json",
    "--command",
    // One line: a newline inside the argument is truncated on Windows.
    sql.replace(/\s+/g, " ").trim(),
  ];
  const output = execFileSync(process.execPath, commandArgs, {
    cwd: repository,
    encoding: "utf8",
    env: { ...process.env, CI: "true", NO_COLOR: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const parsed = JSON.parse(output.slice(output.indexOf("[")));
  return parsed[0]?.results || [];
}

const where = targetEnv || "local";
console.log(`\nChecking the ${where} database for leftover records.\n`);
if (isProduction) {
  console.log("This is the real website's database. Reading only.\n");
}

const findings = [];
let failed = 0;
for (const check of CHECKS) {
  let count = 0;
  try {
    count = Number(d1(check.count)[0]?.count || 0);
  } catch (error) {
    failed += 1;
    console.error(`[ ERROR] ${check.title}: could not be checked.`);
    const detail = `${String(error.stdout || "")}\n${String(error.stderr || "")}`.trim() || error.message;
    console.error(`         ${detail.split("\n").map((line) => line.trim()).filter(Boolean).slice(-3).join(" ")}`);
    continue;
  }
  findings.push({ ...check, count });
  console.log(`[${count === 0 ? "  ok  " : " FOUND"}] ${check.title}: ${count}`);
}

if (failed) {
  console.error(
    `\n${failed} check${failed === 1 ? "" : "s"} could not run, so this is NOT a clean bill of health.\n` +
      "Nothing was changed. Fix the errors above and run it again.\n",
  );
  process.exit(1);
}

const problems = findings.filter((finding) => finding.count > 0);
const total = problems.reduce((sum, finding) => sum + finding.count, 0);

if (!problems.length) {
  console.log("\nNothing to clean up. No changes were made.\n");
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15);
const reviewDir = join(repository, "tmp", "cleanup-review");
mkdirSync(reviewDir, { recursive: true });
const sqlPath = join(reviewDir, `cleanup-${where}-${stamp}.sql`);
const sql = [
  `-- Leftover-record cleanup for the ${where} database, prepared ${new Date().toISOString()}.`,
  "-- Review every statement before approving. Nothing here deletes a student",
  "-- or resets a database; each statement only clears rows that point at a",
  "-- student who is already gone, or recounts a stored total.",
  "",
  ...problems.flatMap((finding) => [
    `-- ${finding.title} (${finding.count} row${finding.count === 1 ? "" : "s"})`,
    `-- ${finding.why}`,
    `${finding.fix.replace(/\s+/g, " ").trim().replace(/;\s*/g, ";\n")};`,
    "",
  ]),
].join("\n");
writeFileSync(sqlPath, sql, "utf8");

console.log(`\n${total} leftover record${total === 1 ? "" : "s"} found in ${problems.length} place${problems.length === 1 ? "" : "s"}.`);
console.log(`\nA cleanup file was written for you to read first:\n  ${sqlPath}\n`);

if (!apply) {
  console.log("Nothing was changed. When you are happy with the file, run:\n");
  console.log(`  node scripts/cleanup-leftover-student-records.mjs${targetEnv ? ` --env ${targetEnv}` : ""} --apply --i-have-a-backup\n`);
  process.exit(process.exitCode || 0);
}

console.log("Applying the reviewed cleanup.\n");
for (const finding of problems) {
  for (const statement of finding.fix.split(";").map((value) => value.trim()).filter(Boolean)) {
    d1(statement);
  }
  console.log(`  done: ${finding.title}`);
}
console.log("\nCleanup finished. Run this script again to confirm everything reads ok.\n");
