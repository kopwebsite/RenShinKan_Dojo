import { AlertTriangle, CheckCircle2, Clock3, CreditCard, FileCheck2, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

type Dashboard = {
  counts: { pendingProfiles: number; newApplications: number; paymentPending: number; pendingHours: number; failedOperations: number };
  alerts: Record<string, Array<{ id: string; student_id?: string; display_name?: string; public_student_id?: string; error_summary?: string }>>;
};

const cards = [
  { key: "pendingProfiles", label: "Profile approvals", icon: UserPlus, filter: "profileStatus=pending_admin_approval" },
  { key: "newApplications", label: "Exam applications", icon: FileCheck2, filter: "examinationStatus=application_submitted" },
  { key: "paymentPending", label: "Payment confirmations", icon: CreditCard, filter: "paymentStatus=payment_pending" },
  { key: "pendingHours", label: "Student hours", icon: Clock3, filter: "" },
  { key: "failedOperations", label: "Failed operations", icon: AlertTriangle, filter: "" },
] as const;

export function AdminAlerts() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  useEffect(() => {
    fetch("/api/admin/dashboard", { credentials: "include", cache: "no-store" }).then(async (response) => {
      if (response.ok) setDashboard(await response.json() as Dashboard);
    }).catch(() => undefined);
  }, []);
  if (!dashboard) return null;
  const total = Object.values(dashboard.counts).reduce((sum, count) => sum + count, 0);
  return <section className="admin-alerts" aria-labelledby="admin-alert-title"><header><div><p className="eyebrow">Action center</p><h2 id="admin-alert-title">{total ? `${total} item${total === 1 ? "" : "s"} need attention` : "Everything is up to date"}</h2></div>{total === 0 ? <CheckCircle2 /> : null}</header><div>{cards.map(({ key, label, icon: Icon, filter }) => <Link key={key} to={`/admin/students${filter ? `?${filter}` : ""}`}><Icon /><strong>{dashboard.counts[key]}</strong><span>{label}</span></Link>)}</div></section>;
}
