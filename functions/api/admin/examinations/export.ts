import { canAccessDojo, getAuthorizedAdminSession, isRenShinKanSuperAdmin, jsonResponse } from "../../../_lib/auth";
import {
  buildExamReportModel,
  renderExamReportPdf,
  renderExamReportXlsx,
  type ExamExportCycle,
  type ExamExportRow,
} from "../../../_lib/examExports";
import { adminAuditMetadata, auditStatement, requestIdentifier, requireStudentDb, type StudentEnv } from "../../../_lib/studentRecords";

type Env = StudentEnv & { SESSION_SECRET?: string; ASSETS?: { fetch(request: Request | string): Promise<Response> } };
function clean(value: string | null, max = 100) { return (value || "").trim().slice(0, max); }
function filename(value: string) { return value.normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "exam-report"; }

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const session = await getAuthorizedAdminSession(request, env);
  if (!session) return jsonResponse({ error: "Unauthorized" }, 401);
  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : url.searchParams.get("format") === "pdf" ? "pdf" : "";
  if (!format) return jsonResponse({ error: "Choose PDF or Excel format." }, 400);
  const printFriendly = url.searchParams.get("monochrome") === "1";
  const db = requireStudentDb(env);
  const cycleId = clean(url.searchParams.get("cycleId"));
  const cycle = cycleId
    ? await db.prepare(`SELECT id, title, name, rank_category, examination_at, venue, instructions FROM examination_cycles WHERE id = ? LIMIT 1`).bind(cycleId).first<ExamExportCycle & { id: string }>()
    : await db.prepare(`SELECT id, title, name, rank_category, examination_at, venue, instructions FROM examination_cycles WHERE status = 'active' ORDER BY created_at DESC LIMIT 1`).first<ExamExportCycle & { id: string }>();
  if (!cycle) return jsonResponse({ error: "Examination cycle not found." }, 404);
  const requestedDojo = clean(url.searchParams.get("dojoId"));
  if (requestedDojo && !canAccessDojo(session, requestedDojo)) return jsonResponse({ error: "You cannot export another dojo's records." }, 403);
  const dojoId = isRenShinKanSuperAdmin(session) ? requestedDojo : session.selectedDojoId || "__none__";
  if (dojoId && !canAccessDojo(session, dojoId)) return jsonResponse({ error: "You cannot export another dojo's records." }, 403);
  const scope = dojoId ? await db.prepare("SELECT id, official_name FROM dojos WHERE id = ? LIMIT 1").bind(dojoId).first<{ id: string; official_name: string }>() : null;
  if (dojoId && !scope) return jsonResponse({ error: "Dojo not found." }, 404);
  // The roster status is the single source of truth for who has paid, so a
  // student confirmed as paid is exported whether or not an application form
  // was also submitted. Every other roster status is excluded.
  const rows = ((await db.prepare(`SELECT s.public_student_id, s.display_name AS student_name,
      d.official_name AS dojo_name, d.code AS dojo_code, s.aat_number,
      COALESCE(NULLIF(s.account_created_date, ''), substr(s.created_at, 1, 10)) AS account_created_date,
      COALESCE((SELECT MAX(ap.payment_date) FROM aat_membership_payments ap WHERE ap.student_id = s.id),
        s.aat_last_paid_date) AS aat_last_paid_date,
      COALESCE(ea.current_rank, ecs.current_rank_snapshot, s.current_belt) AS current_rank,
      COALESCE(ea.attempted_rank, ecs.requested_rank_snapshot, '') AS attempted_rank,
      COALESCE((SELECT MAX(be.examination_date) FROM belt_examinations be WHERE be.student_id = s.id),
        ea.last_examination_date) AS last_examination_date,
      COALESCE(ea.grade_given, '') AS grade_given, COALESCE(ea.exam_fee, 0) AS exam_fee,
      (SELECT SUM(th.verified_hours) FROM training_hours th WHERE th.student_id = s.id) AS practice_hours,
      COALESCE(ea.answers_json, '{}') AS answers_json
    FROM exam_cycle_student_status ecs
    JOIN students s ON s.id = ecs.student_id
    JOIN dojos d ON d.id = s.dojo_id
    LEFT JOIN examination_applications ea
      ON ea.id = ecs.application_id AND ea.status <> 'archived'
    WHERE ecs.cycle_id = ?
      AND ecs.status = 'paid' ${dojoId ? "AND s.dojo_id = ?" : ""}
    ORDER BY attempted_rank COLLATE NOCASE, s.display_name COLLATE NOCASE`)
    .bind(cycle.id, ...(dojoId ? [dojoId] : [])).all<ExamExportRow>()).results || []);
  const scopeLabel = scope?.official_name || "All Dojos";
  // One normalized model feeds every format, so the exports cannot disagree.
  const model = buildExamReportModel(cycle, rows, scopeLabel);
  let bytes: Uint8Array; let contentType: string; let extension: string; let variant = format;
  if (format === "xlsx") {
    bytes = renderExamReportXlsx(model); contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"; extension = "xlsx";
  } else {
    const fontRequest = new Request(new URL("/fonts/NotoSansThai.ttf", request.url));
    const fontResponse = env.ASSETS ? await env.ASSETS.fetch(fontRequest) : await fetch(fontRequest);
    if (!fontResponse.ok) return jsonResponse({ error: "The Unicode report font is unavailable." }, 503);
    bytes = await renderExamReportPdf(model, { fontBytes: new Uint8Array(await fontResponse.arrayBuffer()), printFriendly });
    contentType = "application/pdf"; extension = "pdf"; variant = printFriendly ? "pdf-print-friendly" : "pdf";
  }
  const downloadName = [
    filename(cycle.title || cycle.name),
    filename(scopeLabel),
    model.reportDate,
    printFriendly ? "print-friendly" : "",
  ].filter(Boolean).join("-");
  const now = new Date().toISOString();
  await auditStatement(db, {
    actorType: "administrator", ...adminAuditMetadata(session, request), action: "exam_report_exported",
    entityType: "examination_cycle", entityId: cycle.id, examCycleId: cycle.id,
    newValues: { format: variant, dojoId: dojoId || null, rowCount: rows.length }, source: "admin_exam_export",
    requestId: requestIdentifier(request), summary: `Exported ${variant.toUpperCase()} report for ${scopeLabel} (${rows.length} paid students)`, createdAt: now,
  }).run();
  return new Response(bytes, { headers: { "Content-Type": contentType, "Content-Disposition": `attachment; filename="${downloadName}.${extension}"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
};
