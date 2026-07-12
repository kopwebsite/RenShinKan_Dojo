import { hasValidAdminSession, isSameOriginRequest, jsonResponse } from "../../../_lib/auth";
import {
  audit,
  DEFAULT_DOJO,
  DEFAULT_SHARE_FIELDS,
  isValidStudentId,
  nextStudentId,
  normalizeStudentId,
  rankColor,
  requireStudentDb,
  studentCredentialHashes,
  suggestedStudentId,
  type StudentEnv,
} from "../../../_lib/studentRecords";

type Env = StudentEnv & { SESSION_SECRET?: string };

async function allowed(request: Request, env: Env) {
  return isSameOriginRequest(request) && await hasValidAdminSession(request, env);
}

function integerParam(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

function validProfileUrl(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const url = String(value);
  return /^\/uploads\/student-profiles\/\d{4}\/\d{2}\/[a-f0-9-]{36}\.webp$/i.test(url) ? url : undefined;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await allowed(request, env))) return jsonResponse({ error: "Unauthorized" }, 401);

  const db = requireStudentDb(env);
  const url = new URL(request.url);
  const page = integerParam(url.searchParams.get("page"), 1, 1, 1_000_000);
  const pageSize = integerParam(url.searchParams.get("pageSize"), 20, 5, 100);
  const query = (url.searchParams.get("query") || "").trim().slice(0, 120);
  const rank = (url.searchParams.get("rank") || "").trim().slice(0, 80);
  const dojo = (url.searchParams.get("dojo") || "").trim().slice(0, 120);
  const status = url.searchParams.get("status") || "active";
  const sort = url.searchParams.get("sort") || "name";
  const direction = url.searchParams.get("direction") === "desc" ? "DESC" : "ASC";
  const sortColumns: Record<string, string> = {
    name: "s.display_name COLLATE NOCASE",
    studentId: "s.public_student_id COLLATE NOCASE",
    rank: "s.current_belt COLLATE NOCASE",
    trainingHours: "total_hours",
    updated: "s.updated_at",
  };
  const orderBy = sortColumns[sort] || sortColumns.name;
  const conditions: string[] = [];
  const bindings: unknown[] = [];

  if (query) {
    conditions.push("(s.display_name LIKE ? ESCAPE '\\' COLLATE NOCASE OR s.public_student_id LIKE ? ESCAPE '\\' COLLATE NOCASE)");
    const term = `%${escapeLike(query)}%`;
    bindings.push(term, term);
  }
  if (rank) {
    conditions.push("s.current_belt = ? COLLATE NOCASE");
    bindings.push(rank);
  }
  if (dojo) {
    conditions.push("s.dojo_name = ? COLLATE NOCASE");
    bindings.push(dojo);
  }
  if (status === "archived") conditions.push("s.active = 0");
  else if (status !== "all") conditions.push("s.active = 1");

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const totalExpression = "COALESCE((SELECT SUM(verified_hours) FROM training_hours h WHERE h.student_id = s.id), 0) + s.training_hours_adjustment";
  const [countResult, rowsResult, summaryResult, dojoResult, rankResult] = await db.batch([
    db.prepare(`SELECT COUNT(*) AS total FROM students s ${where}`).bind(...bindings),
    db.prepare(`SELECT s.id, s.public_student_id, s.display_name, s.current_belt, s.profile_image_url, s.active, s.dojo_name, s.updated_at,
      ${totalExpression} AS total_hours,
      EXISTS(SELECT 1 FROM share_tokens st WHERE st.student_id = s.id AND st.active = 1) AS sharing_active
      FROM students s ${where} ORDER BY ${orderBy} ${direction}, s.id ASC LIMIT ? OFFSET ?`)
      .bind(...bindings, pageSize, (page - 1) * pageSize),
    db.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) AS active, SUM(CASE WHEN active = 0 THEN 1 ELSE 0 END) AS archived FROM students"),
    db.prepare("SELECT DISTINCT dojo_name FROM students WHERE TRIM(dojo_name) <> '' ORDER BY dojo_name COLLATE NOCASE"),
    db.prepare("SELECT DISTINCT current_belt FROM students WHERE TRIM(current_belt) <> '' ORDER BY current_belt COLLATE NOCASE"),
  ]);

  const total = Number((countResult.results?.[0] as { total?: number } | undefined)?.total || 0);
  const summary = summaryResult.results?.[0] || { total: 0, active: 0, archived: 0 };

  return jsonResponse({
    students: rowsResult.results || [],
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    summary,
    dojos: (dojoResult.results || []).map((row) => (row as { dojo_name: string }).dojo_name),
    ranks: (rankResult.results || []).map((row) => (row as { current_belt: string }).current_belt),
    suggestedStudentId: await suggestedStudentId(db),
  }, 200, { "Cache-Control": "no-store" });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await allowed(request, env))) return jsonResponse({ error: "Unauthorized" }, 401);

  try {
    const body = await request.json<Record<string, unknown>>();
    const displayName = String(body.displayName || "").normalize("NFKC").trim().replace(/\s+/g, " ");
    const currentBelt = String(body.currentBelt || "Unranked").trim();
    const dojoName = String(body.dojoName || DEFAULT_DOJO).normalize("NFKC").trim().replace(/\s+/g, " ");
    const adminNotes = String(body.adminNotes || "").trim();
    const currentTrainingHours = Number(body.currentTrainingHours ?? 0);
    const profileImageUrl = validProfileUrl(body.profileImageUrl);
    const manualStudentId = body.manualStudentId === true;

    if (!displayName || displayName.length > 120) return jsonResponse({ error: "Enter a student name of 120 characters or fewer." }, 400);
    if (!currentBelt || currentBelt.length > 80) return jsonResponse({ error: "Enter a current kyu or dan rank." }, 400);
    if (!dojoName || dojoName.length > 120) return jsonResponse({ error: "Enter a dojo affiliation." }, 400);
    if (adminNotes.length > 5_000) return jsonResponse({ error: "Additional information must be 5,000 characters or fewer." }, 400);
    if (!Number.isFinite(currentTrainingHours) || currentTrainingHours < 0 || currentTrainingHours > 1_000_000) return jsonResponse({ error: "Current training hours must be zero or a positive number." }, 400);
    if (profileImageUrl === undefined) return jsonResponse({ error: "The profile image location is invalid." }, 400);

    const db = requireStudentDb(env);
    const requestedId = normalizeStudentId(String(body.studentId || ""));
    if (manualStudentId && !isValidStudentId(requestedId)) return jsonResponse({ error: "Student ID must use the format RSK-0001." }, 400);

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const shareFields = JSON.stringify(body.shareFields && typeof body.shareFields === "object" ? body.shareFields : DEFAULT_SHARE_FIELDS);
    let studentId = requestedId;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (!manualStudentId) studentId = await nextStudentId(db);
      const duplicate = await db.prepare("SELECT id FROM students WHERE UPPER(public_student_id) = ? LIMIT 1").bind(studentId).first();
      if (duplicate) {
        if (manualStudentId) return jsonResponse({ error: "That Student ID is already in use." }, 409);
        continue;
      }

      const hashes = await studentCredentialHashes(env, displayName, studentId);
      try {
        await db.prepare(`INSERT INTO students (
          id, public_student_id, lookup_code_hash, name_verification_hash, display_name, current_belt, belt_color,
          profile_image_url, profile_image_consent, guardian_consent, public_visible, active, share_fields, dojo_name,
          admin_notes, training_hours_adjustment, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`)
          .bind(
            id, studentId, hashes.codeHash, hashes.nameHash, displayName, currentBelt, rankColor(currentBelt),
            profileImageUrl, body.profileImageConsent ? 1 : 0, body.guardianConsent ? 1 : 0,
            body.publicVisible === false ? 0 : 1, shareFields, dojoName, adminNotes, currentTrainingHours, now, now,
          ).run();
        if (manualStudentId) {
          await db.prepare("UPDATE student_id_sequence SET last_number = MAX(last_number, ?) WHERE sequence_name = 'student'")
            .bind(Number(studentId.slice(4))).run();
        }
        await audit(db, "create", "student", id, `Created student record ${studentId}`);
        return jsonResponse({ ok: true, id, studentId }, 201);
      } catch (error) {
        const duplicateError = error instanceof Error && error.message.includes("UNIQUE");
        if (!duplicateError || manualStudentId || attempt === 4) throw error;
      }
    }

    return jsonResponse({ error: "A unique Student ID could not be allocated. Please try again." }, 409);
  } catch (error) {
    const duplicate = error instanceof Error && error.message.includes("UNIQUE");
    return jsonResponse({ error: duplicate ? "That Student ID is already in use." : "The student could not be added." }, duplicate ? 409 : 400);
  }
};
