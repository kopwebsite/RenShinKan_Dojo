import { hasValidAdminSession, jsonResponse } from "../../_lib/auth";
import { requireStudentDb, type StudentEnv } from "../../_lib/studentRecords";

type Env = StudentEnv & { SESSION_SECRET?: string };

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await hasValidAdminSession(request, env))) return jsonResponse({ error: "Unauthorized" }, 401);
  const db = requireStudentDb(env);
  const url = new URL(request.url);
  const page = Math.max(1, Math.min(1_000_000, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1));
  const pageSize = 40;
  const conditions: string[] = [];
  const bindings: unknown[] = [];
  const exactFilters = [
    ["actorType", "a.actor_type"], ["action", "a.action"], ["source", "a.source"], ["bulkOperationId", "a.bulk_operation_id"],
    ["examCycleId", "a.exam_cycle_id"], ["month", "a.contribution_month"],
  ] as const;
  for (const [parameter, column] of exactFilters) {
    const value = (url.searchParams.get(parameter) || "").trim().slice(0, 160);
    if (value) { conditions.push(`${column} = ?`); bindings.push(value); }
  }
  const admin = (url.searchParams.get("administrator") || "").trim().slice(0, 160);
  if (admin) { conditions.push("a.actor_identifier LIKE ? ESCAPE '\\' COLLATE NOCASE"); bindings.push(`%${escapeLike(admin)}%`); }
  const student = (url.searchParams.get("student") || "").trim().slice(0, 120);
  if (student) {
    conditions.push("(COALESCE(a.student_name_snapshot, s.display_name) LIKE ? ESCAPE '\\' COLLATE NOCASE OR COALESCE(a.student_public_id_snapshot, s.public_student_id) LIKE ? ESCAPE '\\' COLLATE NOCASE)");
    const value = `%${escapeLike(student)}%`; bindings.push(value, value);
  }
  const dateFrom = url.searchParams.get("dateFrom") || "";
  const dateTo = url.searchParams.get("dateTo") || "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) { conditions.push("a.created_at >= ?"); bindings.push(`${dateFrom}T00:00:00.000Z`); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) { conditions.push("a.created_at <= ?"); bindings.push(`${dateTo}T23:59:59.999Z`); }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const [rows, count] = await db.batch([
    db.prepare(`SELECT a.id, a.actor_type, a.actor_identifier, a.action, a.entity_type, a.entity_id, a.student_id,
      a.previous_values, a.new_values, a.source, a.bulk_operation_id, a.request_id, a.administrator_note,
      a.action_summary, a.created_at,
      COALESCE(a.student_name_snapshot, s.display_name) AS student_name,
      COALESCE(a.student_public_id_snapshot, s.public_student_id) AS public_student_id,
      a.exam_cycle_id, a.contribution_month
      FROM audit_log a LEFT JOIN students s ON s.id = a.student_id ${where}
      ORDER BY a.created_at DESC LIMIT ? OFFSET ?`).bind(...bindings, pageSize, (page - 1) * pageSize),
    db.prepare(`SELECT COUNT(*) AS total FROM audit_log a LEFT JOIN students s ON s.id = a.student_id ${where}`).bind(...bindings),
  ]);
  const total = Number((count.results?.[0] as { total?: number } | undefined)?.total || 0);
  return jsonResponse({ entries: rows.results || [], pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } }, 200, { "Cache-Control": "no-store" });
};
