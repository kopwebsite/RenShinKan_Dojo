import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { Navigate } from "react-router";
import { AdminAatMemberships } from "../components/admin/AdminAatMemberships";
import {
  AdminCheckingSession,
} from "../components/admin/AdminAccess";
import { AdminExamApplications } from "../components/admin/AdminExamApplications";
import { AdminMonthlyContributions } from "../components/admin/AdminMonthlyContributions";
import { AdminPaymentProofs } from "../components/admin/AdminPaymentProofs";
import { useAdminSession } from "../components/admin/useAdminSession";

export type AdminWorkflowKind =
  | "exam-applications"
  | "examination-records"
  | "monthly-contributions"
  | "aat-contributions"
  | "payment-proofs";

const PAGE_COPY: Record<AdminWorkflowKind, [string, string]> = {
  "exam-applications": ["Exam applications", "Review the current cycle, application details, payment status, and decisions."],
  "examination-records": ["Examination records", "Search permanent applications and results independently from the live application queue."],
  "monthly-contributions": ["Monthly contributions", "Review the monthly ledger and its contribution trend graph."],
  "aat-contributions": ["AAT annual contributions", "Review annual membership status and permanent payment history."],
  "payment-proofs": ["Payment proofs", "Review private payment files and record a clear decision."],
};

export function AdminWorkflowPage({ kind }: { kind: AdminWorkflowKind }) {
  const session = useAdminSession();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  if (!session.checked) return <AdminCheckingSession />;
  if (!session.admin?.selectedDojoId) {
    return <Navigate to="/admin" replace />;
  }
  if (kind === "monthly-contributions" && session.admin.permissionLevel !== "renshinkan_super_admin") {
    return <Navigate to="/admin/students" replace />;
  }

  const report = (message: string, isError = false) => {
    if (isError) {
      setError(message);
      setNotice("");
    } else {
      setNotice(message);
      setError("");
    }
  };
  const [title, copy] = PAGE_COPY[kind];

  return <section className="container-shell student-admin student-admin--table admin-independent-page">
    <header className="student-admin__header">
      <div><p className="eyebrow">Administration</p><h1>{title}</h1><p>{copy}</p></div>
    </header>
    {notice ? <div className="admin-notice" role="status"><CheckCircle2 size={18} /><span>{notice}</span></div> : null}
    {error ? <div className="admin-page-error" role="alert"><AlertCircle size={18} /><span>{error}</span></div> : null}
    {kind === "exam-applications"
      ? <AdminExamApplications admin={session.admin} dojos={session.dojos} report={report} mode="applications" />
      : kind === "examination-records"
        ? <AdminExamApplications admin={session.admin} dojos={session.dojos} report={report} mode="records" />
        : kind === "monthly-contributions"
          ? <AdminMonthlyContributions report={report} />
          : kind === "aat-contributions"
            ? <AdminAatMemberships admin={session.admin} dojos={session.dojos} report={report} />
            : <AdminPaymentProofs showAllDojos={session.admin.permissionLevel === "renshinkan_super_admin"} report={report} />}
  </section>;
}
