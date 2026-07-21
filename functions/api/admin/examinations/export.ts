import { canAccessDojo, getAdminSession, jsonResponse } from "../../../_lib/auth";
import { buildExamPdf, buildExamXlsx, type ExamExportCycle, type ExamExportRow } from "../../../_lib/examExports";
import { adminAuditMetadata, auditStatement, requestIdentifier, requireStudentDb, type StudentEnv } from "../../../_lib/studentRecords";

type Env = StudentEnv & { SESSION_SECRET?: string; ASSETS?: { fetch(request: Request | string): Promise<Response> } };
function clean(value: string | null, max = 100) { return (value || "").trim().slice(0, max); }
function filename(value: string) { return value.normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "exam-report"; }

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const session = await getAdminSession(request, env);
  if (!session) return jsonResponse({ error: "Unauthorized" }, 401);
  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : url.searchParams.get("format") === "pdf" ? "pdf" : "";
  if (!format) return jsonResponse({ error: "Choose PDF or Excel format." }, 400);
  const db = requireStudentDb(env);
  const cycleId = clean(url.searchParams.get("cycleId"));
  const cycle = cycleId
    ? await db.prepare(`SELECT title, name, rank_category, examination_at, venue, instructions FROM examination_cycles WHERE id = ? LIMIT 1`).bind(cycleId).first<ExamExportCycle>()
    : await db.prepare(`SELECT title, name, rank_category, examination_at, venue, instructions FROM examination_cycles WHERE status = 'active' ORDER BY created_at DESC LIMIT 1`).first<ExamExportCycle>();
  if (!cycle) return jsonResponse({ error: "Examination cycle not found." }, 404);
  const requestedDojo = clean(url.searchParams.get("dojoId"));
  if (requestedDojo && !canAccessDojo(session, requestedDojo)) return jsonResponse({ error: "You cannot export another dojo's records." }, 403);
  const dojoId = session.role === "dojo" ? session.allowedDojoIds[0] || "__none__" : requestedDojo;
  if (dojoId && !canAccessDojo(session, dojoId)) return jsonResponse({ error: "You cannot export another dojo's records." }, 403);
  const scope = dojoId ? await db.prepare("SELECT id, official_name FROM dojos WHERE id = ? LIMIT 1").bind(dojoId).first<{ id: string; official_name: string }>() : null;
  if (dojoId && !scope) return jsonResponse({ error: "Dojo not found." }, 404);
  const rows = ((await db.prepare(`SELECT s.public_student_id, s.display_name AS student_name,
      d.official_name AS dojo_name, d.code AS dojo_code, s.aat_number, s.aat_last_paid_date,
      ea.current_rank, ea.attempted_rank, COALESCE(ea.last_examination_date,
        (SELECT MAX(be.examination_date) FROM belt_examinations be WHERE be.student_id = s.id)) AS last_examination_date,
      ea.practice_period, ea.grade_given, ea.exam_fee, ea.aat_annual_fee, ea.other_fees, ea.total_fee,
      COALESCE(NULLIF(ea.application_notes, ''), ea.administrator_notes) AS notes, ea.answers_json
    FROM examination_applications ea
    JOIN students s ON s.id = ea.student_id
    JOIN dojos d ON d.id = s.dojo_id
    WHERE ea.cycle_id = (SELECT id FROM examination_cycles WHERE (id = ? OR (? = '' AND status = 'active')) ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END LIMIT 1)
      AND ea.status <> 'archived' ${dojoId ? "AND s.dojo_id = ?" : ""}
    ORDER BY ea.attempted_rank COLLATE NOCASE, s.display_name COLLATE NOCASE`)
    .bind(cycleId, cycleId, cycleId, ...(dojoId ? [dojoId] : [])).all<ExamExportRow>()).results || []);
  const scopeLabel = scope?.official_name || "All Dojos";
  let bytes: Uint8Array; let contentType: string; let extension: string;
  if (format === "xlsx") {
    bytes = buildExamXlsx(cycle, rows, scopeLabel); contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"; extension = "xlsx";
  } else {
    const fontRequest = new Request(new URL("/fonts/NotoSansThai.ttf", request.url));
    const fontResponse = env.ASSETS ? await env.ASSETS.fetch(fontRequest) : await fetch(fontRequest);
    if (!fontResponse.ok) return jsonResponse({ error: "The Unicode report font is unavailable." }, 503);
    bytes = await buildExamPdf(cycle, rows, scopeLabel, new Uint8Array(await fontResponse.arrayBuffer()), url.searchParams.get("monochrome") === "1");
    contentType = "application/pdf"; extension = "pdf";
  }
  const now = new Date().toISOString();
  await auditStatement(db, {
    actorType: "administrator", ...adminAuditMetadata(session, request), action: "exam_report_exported",
    entityType: "examination_cycle", entityId: cycleId || "active", examCycleId: cycleId || null,
    newValues: { format, dojoId: dojoId || null, rowCount: rows.length }, source: "admin_exam_export",
    requestId: requestIdentifier(request), summary: `Exported ${format.toUpperCase()} report for ${scopeLabel} (${rows.length} applications)`, createdAt: now,
  }).run();
  return new Response(bytes, { headers: { "Content-Type": contentType, "Content-Disposition": `attachment; filename="${filename(cycle.title || cycle.name)}-${filename(scopeLabel)}.${extension}"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
};
