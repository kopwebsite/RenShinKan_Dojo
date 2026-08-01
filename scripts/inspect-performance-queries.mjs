import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const state = process.argv.find((value) => value.startsWith("--state="))?.slice(8) || ".perf/optimized-state";
const output = resolve(process.argv.find((value) => value.startsWith("--output="))?.slice(9) || ".perf/query-inspection.json");
const executable = process.execPath;
const wrangler = resolve(import.meta.dirname, "..", "node_modules", "wrangler", "bin", "wrangler.js");
const queries = {
  scopedStudents: `SELECT id, display_name, public_student_id FROM students
    WHERE dojo_id = 'dojo-rsk' AND active = 1 AND profile_status = 'approved'
    ORDER BY display_name COLLATE NOCASE, public_student_id COLLATE NOCASE LIMIT 20`,
  examinations: `SELECT student_id, student_name_snapshot, status FROM exam_cycle_student_status
    WHERE cycle_id = 'perf-cycle-06' AND status = 'paid'
    ORDER BY student_name_snapshot COLLATE NOCASE, student_public_id_snapshot COLLATE NOCASE LIMIT 50`,
  monthlyContributions: `SELECT r.student_id, r.student_name_snapshot, COALESCE(c.status, 'no_submission') AS status
    FROM contribution_period_students r JOIN students s ON s.id = r.student_id AND s.dojo_id = 'dojo-rsk'
    LEFT JOIN monthly_contributions c ON c.student_id = r.student_id AND c.month_key = r.month_key
    WHERE r.month_key = '2026-07' AND r.active_at_period_start = 1
    ORDER BY r.student_name_snapshot COLLATE NOCASE, r.student_public_id_snapshot COLLATE NOCASE LIMIT 50`,
  membershipPayments: `SELECT s.id, s.display_name, EXISTS(SELECT 1 FROM payments pending
      WHERE pending.student_id = s.id AND pending.payment_type = 'aat_annual' AND pending.status = 'awaiting_payment') AS pending
    FROM students s WHERE s.dojo_id = 'dojo-rsk' AND s.deleted_at IS NULL
    ORDER BY s.display_name COLLATE NOCASE LIMIT 40`,
  auditPage: `SELECT id, action, created_at FROM audit_log
    WHERE selected_dojo_id = 'dojo-rsk' ORDER BY created_at DESC, id DESC LIMIT 40`,
  paymentReferenceJoin: `SELECT payment_request_id FROM payment_request_items
    WHERE payment_reference_id = 'perf-aat-payment-0001-0' AND student_id = 'perf-student-0001'`,
};

function execute(command) {
  const result = spawnSync(executable, [wrangler, "d1", "execute", "renshinkan-student-records-local", "--local", `--persist-to=${state}`, "--json", "--command", command], {
    cwd: resolve(import.meta.dirname, ".."), encoding: "utf8", maxBuffer: 10 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `Wrangler exited ${result.status}`);
  return JSON.parse(result.stdout);
}

const results = {};
for (const [name, sql] of Object.entries(queries)) {
  const [plan, measured] = execute(`EXPLAIN QUERY PLAN ${sql}; ${sql}`);
  results[name] = {
    durationMs: Number(measured.meta?.duration || 0),
    returnedRows: measured.results?.length || 0,
    plan: (plan.results || []).map((row) => row.detail),
  };
  console.log(JSON.stringify({ name, ...results[name] }));
}

mkdirSync(resolve(output, ".."), { recursive: true });
writeFileSync(output, `${JSON.stringify({ generatedAt: new Date().toISOString(), state, productionTouched: false, results }, null, 2)}\n`, "utf8");
