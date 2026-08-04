import { isCanonicalDate } from "../../../shared/date";
import { getAuthorizedAdminSession, isRenShinKanSuperAdmin, jsonResponse } from "../../_lib/auth";
import { requireStudentDb, type StudentEnv } from "../../_lib/studentRecords";

type Env = StudentEnv & { SESSION_SECRET?: string };

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const session = await getAuthorizedAdminSession(request, env);
  if (!session) return jsonResponse({ error: "Unauthorized." }, 401);
  const db = requireStudentDb(env);
  const url = new URL(request.url);
  const page = Math.max(1, Math.min(1_000_000, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1));
  const pageSize = 40;
  const conditions: string[] = [];
  const bindings: unknown[] = [];
  if (!isRenShinKanSuperAdmin(session)) {
    const selectedDojoId = session.selectedDojoId!;
    conditions.push(`(
      a.selected_dojo_id = ?
      OR EXISTS (
        SELECT 1 FROM students scoped_student
        WHERE scoped_student.id = a.student_id AND scoped_student.dojo_id = ?
      )
      OR (a.entity_type = 'dojo' AND a.entity_id = ?)
    )`);
    bindings.push(selectedDojoId, selectedDojoId, selectedDojoId);
  }
  const exactFilters = [
    ["actorType", "a.actor_type"], ["action", "a.action"], ["source", "a.source"], ["bulkOperationId", "a.bulk_operation_id"],
    ["examCycleId", "a.exam_cycle_id"], ["month", "a.contribution_month"], ["dojoId", "a.selected_dojo_id"], ["outcome", "a.outcome"],
  ] as const;
  for (const [parameter, column] of exactFilters) {
    const value = (url.searchParams.get(parameter) || "").trim().slice(0, 160);
    if (value) { conditions.push(`${column} = ?`); bindings.push(value); }
  }
  const admin = (url.searchParams.get("administrator") || "").trim().slice(0, 160);
  if (admin) { conditions.push("COALESCE(a.administrator_name, a.actor_identifier) LIKE ? ESCAPE '\\' COLLATE NOCASE"); bindings.push(`%${escapeLike(admin)}%`); }
  const search = (url.searchParams.get("search") || "").trim().slice(0, 160);
  if (search) { const value = `%${escapeLike(search)}%`; conditions.push("(a.action_summary LIKE ? ESCAPE '\\' COLLATE NOCASE OR a.entity_id LIKE ? ESCAPE '\\' COLLATE NOCASE OR COALESCE(a.administrator_note, '') LIKE ? ESCAPE '\\' COLLATE NOCASE)"); bindings.push(value, value, value); }
  const student = (url.searchParams.get("student") || "").trim().slice(0, 120);
  if (student) {
    conditions.push("(COALESCE(a.student_name_snapshot, s.display_name) LIKE ? ESCAPE '\\' COLLATE NOCASE OR COALESCE(a.student_public_id_snapshot, s.public_student_id) LIKE ? ESCAPE '\\' COLLATE NOCASE)");
    const value = `%${escapeLike(student)}%`; bindings.push(value, value);
  }
  const dateFrom = url.searchParams.get("dateFrom") || "";
  const dateTo = url.searchParams.get("dateTo") || "";
  if (isCanonicalDate(dateFrom)) { conditions.push("a.created_at >= ?"); bindings.push(`${dateFrom}T00:00:00.000Z`); }
  if (isCanonicalDate(dateTo)) { conditions.push("a.created_at <= ?"); bindings.push(`${dateTo}T23:59:59.999Z`); }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const [rows, count] = await db.batch([
    db.prepare(`SELECT a.id, a.actor_type, a.actor_identifier, a.action, a.entity_type, a.entity_id, a.student_id,
      a.previous_values, a.new_values, a.source, a.bulk_operation_id, a.request_id, a.administrator_note,
      a.action_summary, a.created_at, a.administrator_name, a.administrator_role, a.selected_dojo_id,
      a.ip_address, a.country_code, a.user_agent, a.outcome,
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
