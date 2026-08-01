import { CheckCircle2, Clock3, FileImage, GraduationCap, HandCoins, ReceiptText, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";

type CountKey = "pendingProfiles" | "pendingExams" | "pendingAatPayments" | "pendingHours" | "pendingMonthlyContributions" | "pendingPayslips";
type Dashboard = {
  counts: Record<CountKey, number>;
  capabilities: { allDojos: boolean; monthlyContributions: boolean };
};

const cards: Array<{ key: CountKey; label: string; icon: typeof UserPlus; destination: string; renshinkanOnly?: boolean }> = [
  { key: "pendingProfiles", label: "Profile requests", icon: UserPlus, destination: "/admin/profile-requests" },
  { key: "pendingExams", label: "Exam applications", icon: GraduationCap, destination: "/admin/exam-applications?status=unpaid" },
  { key: "pendingAatPayments", label: "AAT annual fees", icon: ReceiptText, destination: "/admin/aat-contributions?status=pending_payment" },
  { key: "pendingHours", label: "Training hour requests", icon: Clock3, destination: "/admin/training-requests" },
  { key: "pendingMonthlyContributions", label: "Monthly contributions", icon: HandCoins, destination: "/admin/monthly-contributions?status=awaiting_payment", renshinkanOnly: true },
  { key: "pendingPayslips", label: "Payment proofs", icon: FileImage, destination: "/admin/payment-proofs" },
];

export function AdminAlerts() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  useEffect(() => {
    fetch("/api/admin/dashboard", { credentials: "include", cache: "no-store" }).then(async (response) => {
      if (response.ok) setDashboard(await response.json() as Dashboard);
    }).catch(() => undefined);
  }, []);
  if (!dashboard) return <section className="admin-alerts admin-alerts--loading" aria-busy="true" aria-label="Loading approval center">
    <header><div><p className="eyebrow">Approval center</p><h2>Loading approvals…</h2><p>Checking work for the selected dojo.</p></div></header>
    <div aria-hidden="true">{cards.map((card) => <span key={card.key} />)}</div>
  </section>;

  const visibleCards = cards.filter((card) => !card.renshinkanOnly || dashboard.capabilities.monthlyContributions);
  const total = visibleCards.reduce((sum, card) => sum + dashboard.counts[card.key], 0);

  return <section className="admin-alerts" aria-labelledby="admin-alert-title">
    <header><div><p className="eyebrow">Approval center</p><h2 id="admin-alert-title">{total ? `${total} approval${total === 1 ? "" : "s"} waiting` : "No approvals waiting"}</h2><p>{dashboard.capabilities.allDojos ? "Showing approval work across every dojo." : "Showing approval work for your selected dojo only."}</p></div>{total === 0 ? <CheckCircle2 /> : null}</header>
    <div>{visibleCards.map(({ key, label, icon: Icon, destination }) => <Link key={key} to={destination}><Icon /><strong>{dashboard.counts[key]}</strong><span>{label}</span></Link>)}</div>
  </section>;
}
