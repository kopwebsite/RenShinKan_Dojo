import { ChevronLeft, ChevronRight, History, Search } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";

type Entry = {
  id: string; actor_type: string; actor_identifier: string; action: string; entity_type: string; student_name?: string;
  public_student_id?: string; previous_values?: string; new_values?: string; source: string; bulk_operation_id?: string;
  request_id: string; administrator_note?: string; action_summary: string; created_at: string; exam_cycle_id?: string; contribution_month?: string;
};
type ResponseBody = { entries: Entry[]; pagination: { page: number; total: number; totalPages: number } };

function pretty(value?: string) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return Object.entries(parsed).map(([key, item]) => `${key.replace(/([A-Z])/g, " $1")}: ${String(item)}`).join(" · ");
  } catch { return value; }
}

export function AdminAuditPage() {
  const [entries, setEntries] = useState<Entry[]>([]); const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });
  const [page, setPage] = useState(1); const [filters, setFilters] = useState({ student: "", administrator: "", actorType: "", action: "", source: "", bulkOperationId: "", examCycleId: "", month: "", dateFrom: "", dateTo: "" });
  const [applied, setApplied] = useState(filters); const [error, setError] = useState("");
  useEffect(() => {
    const params = new URLSearchParams({ page: String(page) }); Object.entries(applied).forEach(([key, value]) => { if (value) params.set(key, value); });
    fetch(`/api/admin/audit?${params}`, { credentials: "include", cache: "no-store" }).then(async (response) => {
      const body = await response.json() as ResponseBody & { error?: string }; if (!response.ok) throw new Error(body.error || "Could not load the audit log."); setEntries(body.entries); setPagination(body.pagination);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load the audit log."));
  }, [page, applied]);
  function submit(event: FormEvent) { event.preventDefault(); setPage(1); setApplied(filters); }
  return <section className="container-shell admin-audit-page"><header><div><p className="eyebrow">Permanent history</p><h1>Audit log</h1><p>Readable summaries with the structured before-and-after values retained for investigation.</p></div><Link className="btn-secondary" to="/admin/students"><ChevronLeft size={16} /> Students</Link></header>
    <form className="admin-audit-filters" onSubmit={submit}><label>Student<input value={filters.student} onChange={(event) => setFilters({ ...filters, student: event.target.value })} placeholder="Name or ID" /></label><label>Administrator<input value={filters.administrator} onChange={(event) => setFilters({ ...filters, administrator: event.target.value })} /></label><label>Actor type<select value={filters.actorType} onChange={(event) => setFilters({ ...filters, actorType: event.target.value })}><option value="">All</option><option value="administrator">Administrator</option><option value="student">Student</option><option value="system">System</option></select></label><label>Action<input value={filters.action} onChange={(event) => setFilters({ ...filters, action: event.target.value })} placeholder="rank_changed" /></label><label>Source<input value={filters.source} onChange={(event) => setFilters({ ...filters, source: event.target.value })} /></label><label>Exam cycle ID<input value={filters.examCycleId} onChange={(event) => setFilters({ ...filters, examCycleId: event.target.value })} /></label><label>Contribution month<input type="month" value={filters.month} onChange={(event) => setFilters({ ...filters, month: event.target.value })} /></label><label>Bulk operation ID<input value={filters.bulkOperationId} onChange={(event) => setFilters({ ...filters, bulkOperationId: event.target.value })} /></label><label>From<input type="date" value={filters.dateFrom} onChange={(event) => setFilters({ ...filters, dateFrom: event.target.value })} /></label><label>To<input type="date" value={filters.dateTo} onChange={(event) => setFilters({ ...filters, dateTo: event.target.value })} /></label><button className="btn-primary"><Search size={16} /> Filter</button></form>
    {error ? <p className="form-error">{error}</p> : null}<div className="admin-audit-list"><div className="admin-table-meta"><span><History size={15} /> {pagination.total} permanent entries</span></div>{entries.map((entry) => <article key={entry.id}><header><div><strong>{entry.action_summary || entry.action.replace(/_/g, " ")}</strong><span>{new Date(entry.created_at).toLocaleString()}</span></div><span className="admin-status is-neutral">{entry.actor_type}</span></header><p>{entry.student_name ? `${entry.student_name} (${entry.public_student_id}) · ` : ""}{entry.actor_identifier} · {entry.source}</p>{pretty(entry.previous_values) || pretty(entry.new_values) ? <dl><div><dt>Before</dt><dd>{pretty(entry.previous_values) || "—"}</dd></div><div><dt>After</dt><dd>{pretty(entry.new_values) || "—"}</dd></div></dl> : null}<footer><code>Request {entry.request_id}</code>{entry.bulk_operation_id ? <code>Bulk {entry.bulk_operation_id}</code> : null}{entry.administrator_note ? <span>Note: {entry.administrator_note}</span> : null}</footer></article>)}</div><nav className="admin-pagination"><button className="btn-secondary" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={16} /> Previous</button><span>Page {pagination.page} of {pagination.totalPages}</span><button className="btn-secondary" disabled={page >= pagination.totalPages} onClick={() => setPage((value) => value + 1)}>Next <ChevronRight size={16} /></button></nav>
  </section>;
}
