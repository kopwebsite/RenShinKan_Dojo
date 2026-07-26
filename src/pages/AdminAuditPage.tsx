import { ChevronLeft, ChevronRight, History, Search } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { AdminCheckingSession, AdminDojoSelector, AdminLoginFields, AdminRenshinKanVerification } from "../components/admin/AdminAccess";
import { useAdminSession } from "../components/admin/useAdminSession";

type Entry = {
  id: string; actor_type: string; actor_identifier: string; action: string; entity_type: string; student_name?: string;
  public_student_id?: string; previous_values?: string; new_values?: string; source: string; bulk_operation_id?: string;
  request_id: string; administrator_note?: string; action_summary: string; created_at: string; exam_cycle_id?: string; contribution_month?: string;
  administrator_name?: string; administrator_role?: string; selected_dojo_id?: string; ip_address?: string; country_code?: string; user_agent?: string; entity_id?: string; outcome?: "success" | "failure";
};
type ResponseBody = { entries: Entry[]; pagination: { page: number; total: number; totalPages: number } };

function pretty(value?: string) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return Object.entries(parsed).map(([key, item]) => `${key.replace(/([A-Z])/g, " $1")}: ${String(item)}`).join(" · ");
  } catch { return value; }
}

function actorLabel(value: string) {
  if (value === "administrator") return "Administrator";
  if (value === "student") return "Student";
  return "System";
}

export function AdminAuditPage() {
  const session = useAdminSession();
  const [entries, setEntries] = useState<Entry[]>([]); const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });
  const [page, setPage] = useState(1); const [filters, setFilters] = useState({ search: "", student: "", administrator: "", dojoId: "", actorType: "", action: "", source: "", bulkOperationId: "", examCycleId: "", month: "", dateFrom: "", dateTo: "" });
  const [applied, setApplied] = useState(filters); const [error, setError] = useState("");
  useEffect(() => {
    if (!session.admin?.selectedDojoId || session.admin.renshinkanVerificationRequired) return;
    const params = new URLSearchParams({ page: String(page) }); Object.entries(applied).forEach(([key, value]) => { if (value) params.set(key, value); });
    fetch(`/api/admin/audit?${params}`, { credentials: "include", cache: "no-store" }).then(async (response) => {
      const body = await response.json() as ResponseBody & { error?: string }; if (!response.ok) throw new Error(body.error || "Could not load the audit log."); setEntries(body.entries); setPagination(body.pagination);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load the audit log."));
  }, [session.admin?.selectedDojoId, session.admin?.renshinkanVerificationRequired, page, applied]);
  function submit(event: FormEvent) { event.preventDefault(); setPage(1); setApplied(filters); }
  if (!session.checked) return <AdminCheckingSession />;
  if (!session.admin) return <main className="admin-gate"><form onSubmit={session.login}><AdminLoginFields name={session.name} password={session.password} error={session.error} busy={session.busy} setName={session.setName} setPassword={session.setPassword} /></form></main>;
  if (!session.admin.selectedDojoId) return <AdminDojoSelector dojos={session.dojos} admin={session.admin} busyId={session.selecting} error={session.error} onSelect={(id) => void session.selectDojo(id)} />;
  if (session.admin.renshinkanVerificationRequired) return <AdminRenshinKanVerification password={session.secondaryPassword} error={session.error} busy={session.verifying} setPassword={session.setSecondaryPassword} onSubmit={session.verifyRenshinKan} onCancel={() => void session.switchDojo()} />;
  const superAdmin = session.admin.permissionLevel === "renshinkan_super_admin";
  const dojos = session.dojos;
  return <section className="container-shell admin-audit-page"><header><div><p className="eyebrow">Permanent history</p><h1>Audit log</h1><p>{superAdmin ? "All dojo and student changes, with before-and-after values retained for investigation." : "Changes to this dojo and its students, with before-and-after values retained for investigation."}</p></div></header>
    <form className="admin-audit-filters" onSubmit={submit}><div className="admin-audit-filters__primary"><label>Search activity<input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Example: profile approved" /></label><label>Student<input value={filters.student} onChange={(event) => setFilters({ ...filters, student: event.target.value })} placeholder="Name or Student ID" /></label>{superAdmin ? <label>Dojo<select value={filters.dojoId} onChange={(event) => setFilters({ ...filters, dojoId: event.target.value })}><option value="">All dojos</option>{dojos.map((dojo) => <option key={dojo.id} value={dojo.id}>{dojo.official_name}</option>)}</select></label> : null}<button className="btn-primary"><Search size={16} /> Search</button></div><details className="admin-audit-filters__advanced"><summary>Advanced filters</summary><div><label>Administrator<input value={filters.administrator} onChange={(event) => setFilters({ ...filters, administrator: event.target.value })} /></label><label>Changed by<select value={filters.actorType} onChange={(event) => setFilters({ ...filters, actorType: event.target.value })}><option value="">Anyone</option><option value="administrator">Administrator</option><option value="student">Student</option><option value="system">System</option></select></label><label>Action code<input value={filters.action} onChange={(event) => setFilters({ ...filters, action: event.target.value })} placeholder="rank_changed" /></label><label>Source<input value={filters.source} onChange={(event) => setFilters({ ...filters, source: event.target.value })} /></label><label>Exam cycle ID<input value={filters.examCycleId} onChange={(event) => setFilters({ ...filters, examCycleId: event.target.value })} /></label><label>Contribution month<input type="month" value={filters.month} onChange={(event) => setFilters({ ...filters, month: event.target.value })} /></label><label>Bulk operation ID<input value={filters.bulkOperationId} onChange={(event) => setFilters({ ...filters, bulkOperationId: event.target.value })} /></label><label>From<input type="date" value={filters.dateFrom} onChange={(event) => setFilters({ ...filters, dateFrom: event.target.value })} /></label><label>To<input type="date" value={filters.dateTo} onChange={(event) => setFilters({ ...filters, dateTo: event.target.value })} /></label></div></details></form>
    {error ? <p className="form-error">{error}</p> : null}<div className="admin-audit-list"><div className="admin-table-meta"><span><History size={15} /> {pagination.total} permanent entries</span></div>{entries.map((entry) => <article key={entry.id}><header><div><strong>{entry.action_summary || entry.action.replace(/_/g, " ")}</strong><span>{new Date(entry.created_at).toLocaleString()}</span></div><span className="admin-status is-neutral">{actorLabel(entry.actor_type)}</span></header><p className="admin-audit-subject">{entry.student_name ? `Student: ${entry.student_name} (${entry.public_student_id})` : entry.administrator_name ? `Administrator: ${entry.administrator_name}` : "System activity"}</p>{pretty(entry.previous_values) || pretty(entry.new_values) ? <dl><div><dt>Before</dt><dd>{pretty(entry.previous_values) || "—"}</dd></div><div><dt>After</dt><dd>{pretty(entry.new_values) || "—"}</dd></div></dl> : null}{entry.administrator_note ? <p><strong>Administrator note:</strong> {entry.administrator_note}</p> : null}<details className="admin-audit-technical"><summary>Technical details</summary><p>Action: {entry.action} · Source: {entry.source} · Actor: {entry.actor_identifier}</p>{entry.administrator_name ? <p>{entry.administrator_name} / {entry.administrator_role || "administrator"}{entry.selected_dojo_id ? ` / ${dojos.find((dojo) => dojo.id === entry.selected_dojo_id)?.official_name || entry.selected_dojo_id}` : ""}{entry.country_code ? ` / ${entry.country_code}` : ""}</p> : null}{entry.ip_address || entry.user_agent ? <p>{entry.ip_address ? `IP ${entry.ip_address}` : "IP unavailable"}{entry.user_agent ? ` / ${entry.user_agent}` : ""}</p> : null}<footer><code>Request {entry.request_id}</code>{entry.entity_id ? <code>{entry.entity_type} {entry.entity_id}</code> : null}{entry.bulk_operation_id ? <code>Bulk {entry.bulk_operation_id}</code> : null}</footer></details></article>)}</div><nav className="admin-pagination"><button className="btn-secondary" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={16} /> Previous</button><span>Page {pagination.page} of {pagination.totalPages}</span><button className="btn-secondary" disabled={page >= pagination.totalPages} onClick={() => setPage((value) => value + 1)}>Next <ChevronRight size={16} /></button></nav>
  </section>;
}
