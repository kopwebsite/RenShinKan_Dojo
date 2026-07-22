import { getAuthorizedAdminSession, isRenShinKanSuperAdmin, jsonResponse } from "../../_lib/auth";
import { requireStudentDb, type StudentEnv } from "../../_lib/studentRecords";

type Env = StudentEnv & { SESSION_SECRET?: string };

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const session = await getAuthorizedAdminSession(request, env);
  if (!session) return jsonResponse({ error: "Unauthorized" }, 401);

  const db = requireStudentDb(env);
  const superAdmin = isRenShinKanSuperAdmin(session);
  const selectedDojoId = session.selectedDojoId || "__none__";
  const scope = superAdmin ? "" : " AND s.dojo_id = ?";
  const payslipScope = superAdmin ? "" : " AND s.dojo_id = ? AND p.payment_type <> 'renshinkan_monthly'";
  const scopeBindings = superAdmin ? [] : [selectedDojoId];
  const countsResult = await db.prepare(`SELECT
    (SELECT COUNT(*) FROM students s
      WHERE s.deleted_at IS NULL AND s.profile_status = 'pending_admin_approval' ${scope}) AS pending_profiles,
    (SELECT COUNT(*) FROM examination_applications ea
      JOIN examination_cycles ec ON ec.id = ea.cycle_id AND ec.status = 'active'
      JOIN students s ON s.id = ea.student_id
      WHERE s.deleted_at IS NULL AND ea.status = 'application_submitted' AND ea.payment_status = 'payment_pending' ${scope}) AS pending_exams,
    (SELECT COUNT(*) FROM payments p JOIN students s ON s.id = p.student_id
      WHERE s.deleted_at IS NULL AND p.payment_type = 'aat_annual' AND p.status = 'awaiting_payment' ${scope}) AS pending_aat_payments,
    (SELECT COUNT(*) FROM training_hour_requests r JOIN students s ON s.id = r.student_id
      WHERE s.deleted_at IS NULL AND r.status = 'pending' ${scope}) AS pending_hours,
    ${superAdmin ? `(SELECT COUNT(*) FROM monthly_contributions c JOIN students s ON s.id = c.student_id
      WHERE s.deleted_at IS NULL AND s.dojo_id = 'dojo-rsk' AND c.status = 'awaiting_payment')` : "0"} AS pending_monthly_contributions,
    (SELECT COUNT(*) FROM payment_proofs p JOIN students s ON s.id = p.student_id
      WHERE s.deleted_at IS NULL AND p.status = 'pending_review' AND p.object_key IS NOT NULL
        ${payslipScope}) AS pending_payslips`)
    .bind(
      ...scopeBindings,
      ...scopeBindings,
      ...scopeBindings,
      ...scopeBindings,
      ...scopeBindings,
    )
    .first<Record<string, number>>();

  return jsonResponse({
    counts: {
      pendingProfiles: Number(countsResult?.pending_profiles || 0),
      pendingExams: Number(countsResult?.pending_exams || 0),
      pendingAatPayments: Number(countsResult?.pending_aat_payments || 0),
      pendingHours: Number(countsResult?.pending_hours || 0),
      pendingMonthlyContributions: Number(countsResult?.pending_monthly_contributions || 0),
      pendingPayslips: Number(countsResult?.pending_payslips || 0),
    },
    capabilities: {
      allDojos: superAdmin,
      monthlyContributions: superAdmin,
    },
  }, 200, { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" });
};
