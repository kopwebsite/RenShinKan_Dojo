import { CheckCircle2, Clock3, FileImage, GraduationCap, HandCoins, ReceiptText, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

type CountKey = "pendingProfiles" | "pendingExams" | "pendingAatPayments" | "pendingHours" | "pendingMonthlyContributions" | "pendingPayslips";
type Dashboard = {
  counts: Record<CountKey, number>;
  capabilities: { allDojos: boolean; monthlyContributions: boolean };
};

const cards: Array<{ key: CountKey; label: string; icon: typeof UserPlus; destination: string; renshinkanOnly?: boolean }> = [
  { key: "pendingProfiles", label: "Profile requests", icon: UserPlus, destination: "/admin/students?profileStatus=pending_admin_approval" },
  { key: "pendingExams", label: "Exam applications", icon: GraduationCap, destination: "/admin/students?section=exams&status=unpaid" },
  { key: "pendingAatPayments", label: "AAT annual fees", icon: ReceiptText, destination: "/admin/students?section=memberships&status=pending_payment" },
  { key: "pendingHours", label: "Training hour requests", icon: Clock3, destination: "/admin/students?hoursStatus=pending" },
  { key: "pendingMonthlyContributions", label: "Monthly contributions", icon: HandCoins, destination: "/admin/students?section=contributions&status=awaiting_payment", renshinkanOnly: true },
  { key: "pendingPayslips", label: "Submitted payslips", icon: FileImage, destination: "/admin/students?section=payslips" },
];

export function AdminAlerts() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  useEffect(() => {
    fetch("/api/admin/dashboard", { credentials: "include", cache: "no-store" }).then(async (response) => {
      if (response.ok) setDashboard(await response.json() as Dashboard);
    }).catch(() => undefined);
  }, []);
  if (!dashboard) return null;

  const visibleCards = cards.filter((card) => !card.renshinkanOnly || dashboard.capabilities.monthlyContributions);
  const total = visibleCards.reduce((sum, card) => sum + dashboard.counts[card.key], 0);

  return <section className="admin-alerts" aria-labelledby="admin-alert-title">
    <header><div><p className="eyebrow">Approval center</p><h2 id="admin-alert-title">{total ? `${total} approval${total === 1 ? "" : "s"} waiting` : "No approvals waiting"}</h2><p>{dashboard.capabilities.allDojos ? "Showing approval work across every dojo." : "Showing approval work for your selected dojo only."}</p></div>{total === 0 ? <CheckCircle2 /> : null}</header>
    <div>{visibleCards.map(({ key, label, icon: Icon, destination }) => <Link key={key} to={destination}><Icon /><strong>{dashboard.counts[key]}</strong><span>{label}</span></Link>)}</div>
  </section>;
}
