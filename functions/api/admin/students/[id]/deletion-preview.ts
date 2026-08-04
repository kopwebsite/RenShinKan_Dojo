import { getAuthorizedAdminSession, jsonResponse } from "../../../../_lib/auth";
import { requireStudentDb, type StudentEnv } from "../../../../_lib/studentRecords";
import {
  buildStudentDeletionPlan,
  canPermanentlyDeleteStudent,
  loadDeletionTarget,
} from "../../../../_lib/studentDeletion";

type Env = StudentEnv & { SESSION_SECRET?: string };

/**
 * Read-only. Shows the administrator the name, the Student ID and every record
 * that "delete forever" would erase, before anything is deleted.
 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const session = await getAuthorizedAdminSession(request, env);
  if (!session) return jsonResponse({ error: "Unauthorized" }, 401);
  const db = requireStudentDb(env);
  const id = String(params.id);
  const target = await loadDeletionTarget(db, id);
  if (!target) return jsonResponse({ error: "Student not found" }, 404);
  if (!canPermanentlyDeleteStudent(session, target.dojo_id)) {
    return jsonResponse({ error: "You may only delete students in a dojo you administer." }, 403);
  }
  const plan = await buildStudentDeletionPlan(db, id, target);
  return jsonResponse(
    {
      student: {
        id: target.id,
        publicStudentId: target.public_student_id,
        name: target.display_name,
        englishName: target.english_name,
        thaiName: target.thai_name,
        currentRank: target.current_belt,
        dojoName: target.dojo_name,
        archivedAt: target.archived_at,
      },
      canDelete: Boolean(target.archived_at),
      blockedReason: target.archived_at
        ? ""
        : "Archive this student first. Deleting forever is only for records created by mistake.",
      confirmationPhrase: `DELETE ${target.public_student_id}`,
      records: plan.groups.filter((group) => group.count > 0),
      emptyGroups: plan.groups.filter((group) => group.count === 0).map((group) => group.label),
      totals: {
        studentRecords: 1,
        relatedRecords: plan.relatedRecords,
        totalRecords: plan.totalRecords,
        storedFiles: plan.objectKeys.length,
        auditEntriesRedacted: plan.auditEntriesRedacted,
        contributionMonths: plan.contributionMonths.length,
      },
    },
    200,
    { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
  );
};
