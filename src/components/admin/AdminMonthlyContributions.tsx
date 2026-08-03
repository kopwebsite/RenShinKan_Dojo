import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, History, LoaderCircle, ReceiptText, Search, UserRound, X } from "lucide-react";
import { adminApi, adminStatusLabel } from "./adminApi";
import { formatGregorianDate, formatGregorianMonth } from "../../../shared/date";
import { RANKS } from "../../../shared/ranks";

type ContributionStatus = "no_submission" | "awaiting_payment" | "paid";
type Contribution = {
  student_id: string;
  student_name: string;
  public_student_id: string;
  profile_image_url: string | null;
  current_rank: string;
  contribution_id: string | null;
  status: ContributionStatus;
  submitted_at: string | null;
  paid_at: string | null;
  paid_by: string | null;
  status_updated_at: string | null;
  last_paid_month: string | null;
  last_paid_at: string | null;
  consecutiveMonths: number;
  renewal: { state: "not_paid" | "current" | "overdue"; label: string; dueDate: string | null; days: number | null };
  history: Array<{ id: string; month_key: string; paid_at: string | null; paid_by: string | null }>;
};
type GraphPoint = { month: string; totalActive: number; paid: number; paidPercentage: number };
type Response = {
  month: string;
  currentMonth: string;
  months: string[];
  contributions: Contribution[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  summary: { total: number; submitted: number; awaiting: number; paid: number; paidPercentage: number };
  graph: GraphPoint[];
};
type PendingChange = { status: ContributionStatus; studentIds: string[]; amount: string; reference: string };

const EMPTY: Response = {
  month: "", currentMonth: "", months: [], contributions: [],
  pagination: { page: 1, pageSize: 50, total: 0, totalPages: 1 },
  summary: { total: 0, submitted: 0, awaiting: 0, paid: 0, paidPercentage: 0 }, graph: [],
};

function monthLabel(value: string) {
  return formatGregorianMonth(value, value);
}

function contributionStatus(value: string): ContributionStatus | "" {
  return value === "no_submission" || value === "awaiting_payment" || value === "paid"
    ? value
    : "";
}

function MonthlySummary({ row, month }: { row: Contribution; month: string }) {
  return <span className="admin-aat-membership-cell">
    <span className={`admin-status ${row.status === "paid" ? "is-active" : row.status === "awaiting_payment" ? "is-pending" : "is-neutral"}`}>{row.status === "paid" ? <CheckCircle2 size={13} /> : <ReceiptText size={13} />}{adminStatusLabel(row.status)}</span>
    <small className="admin-table-subline">{monthLabel(month)}</small>
  </span>;
}

export function AdminMonthlyContributions({ report }: { report: (message: string, isError?: boolean) => void }) {
  const [data, setData] = useState<Response>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState("");
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ContributionStatus | "">(() => {
    const value = new URLSearchParams(window.location.search).get("status") || "";
    return value === "no_submission" || value === "awaiting_payment" ||
      value === "paid"
      ? value
      : "";
  });
  const [rank, setRank] = useState("");
  const [lastPaid, setLastPaid] = useState("");
  const [sort, setSort] = useState("name");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (month) params.set("month", month);
      if (query) params.set("query", query);
      if (status) params.set("status", status);
      if (rank) params.set("rank", rank);
      if (lastPaid) params.set("lastPaid", lastPaid);
      params.set("sort", sort);
      const body = await adminApi<Response>(
        `/api/admin/contributions?${params}`);
      setData(body);
      if (!month) setMonth(body.month);
      setSelected((current) => new Set([...current].filter((id) => body.contributions.some((row) => row.student_id === id))));
    } catch (reason) {
      report(reason instanceof Error ? reason.message : "Could not load monthly contributions.", true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [page, month, query, status, rank, lastPaid, sort]);

  const allVisibleSelected =
    data.contributions.length > 0 && data.contributions.every((row) => selected.has(row.student_id));
  const pendingNames = useMemo(() => data.contributions.filter((row) => pending?.studentIds.includes(row.student_id)), [data.contributions, pending]);

  async function updateStatus() {
    if (!pending) return;
    setSaving(true);
    try {
      await adminApi("/api/admin/contributions", {
        method: "POST",
        body: JSON.stringify({ action: "update_status", confirmed: true, contributionType: "renshinkan_monthly", month: data.month, status: pending.status, studentIds: pending.studentIds, amount: pending.amount, reference: pending.reference }),
      });
      report(`${pending.studentIds.length} contribution record${pending.studentIds.length === 1 ? "" : "s"} marked ${adminStatusLabel(pending.status).toLowerCase()} for ${monthLabel(data.month)}.`);
      setPending(null);
      setSelected(new Set());
      await load();
    } catch (reason) {
      report(reason instanceof Error ? reason.message : "Could not update contribution status.", true);
    } finally {
      setSaving(false);
    }
  }

  return <section className="admin-workspace-section" aria-busy={loading}>
    <header className="admin-workspace-heading"><div><p className="eyebrow">Monthly ledger</p><h2>Monthly Contributions</h2><p>Track submissions and confirm payments without treating the QR display as proof of payment.</p></div></header>

    <div className="admin-workspace-toolbar">
      <label>Contribution month<select value={month} onChange={(event) => { setMonth(event.target.value); setPage(1); setSelected(new Set()); }}>{data.months.map((value) => <option key={value} value={value}>{monthLabel(value)}{value === data.currentMonth ? " — Current" : ""}</option>)}</select></label>
      {data.month ? <p className="admin-cycle-context"><strong>{monthLabel(data.month)}</strong><span>{data.month === data.currentMonth ? "Current active roster" : "Historical monthly snapshot"}</span></p> : null}
    </div>

    <div className="admin-summary admin-summary--five">
      <div><strong>{data.summary.total}</strong><span>Total active students</span></div>
      <div><strong>{data.summary.submitted}</strong><span>Submitted</span></div>
      <div><strong>{data.summary.awaiting}</strong><span>Awaiting payment</span></div>
      <div><strong>{data.summary.paid}</strong><span>Paid</span></div>
      <div><strong>{data.summary.paidPercentage}%</strong><span>Paid rate</span></div>
    </div>

    <section className="contribution-chart" aria-labelledby="contribution-chart-title">
      <header><div><p className="eyebrow">Recent periods</p><h3 id="contribution-chart-title">Paid contribution progress</h3></div><span>Paid / active roster</span></header>
      <div className="contribution-chart__plot">{data.graph.map((point) => <div className="contribution-chart__point" key={point.month}>
        <span className="contribution-chart__value">{point.paidPercentage}%</span>
        <span className="contribution-chart__track" aria-hidden="true"><span style={{ height: `${Math.max(point.paidPercentage, point.paid ? 4 : 0)}%` }} /></span>
        <span>{point.month.slice(5)}</span><small>{point.paid}/{point.totalActive}</small>
      </div>)}{!data.graph.length ? <p>No monthly periods have been recorded yet.</p> : null}</div>
      <table className="sr-only"><caption>Accessible monthly contribution totals</caption><thead><tr><th>Month</th><th>Paid</th><th>Active roster</th><th>Paid percentage</th></tr></thead><tbody>{data.graph.map((point) => <tr key={point.month}><td>{monthLabel(point.month)}</td><td>{point.paid}</td><td>{point.totalActive}</td><td>{point.paidPercentage}%</td></tr>)}</tbody></table>
    </section>

    <form className="admin-record-filters" role="search" aria-label="Search and filter monthly contributions" onSubmit={(event) => { event.preventDefault(); setPage(1); setQuery(queryInput.trim()); }}>
      <label className="admin-search-wide">Search students<div><Search size={17} /><input value={queryInput} onChange={(event) => setQueryInput(event.target.value)} placeholder="Name or Student ID" /><button className="btn-secondary">Search</button></div></label>
      <label>Status<select value={status} onChange={(event) => { setStatus(contributionStatus(event.target.value)); setPage(1); }}><option value="">All statuses</option><option value="no_submission">No submission</option><option value="awaiting_payment">Awaiting payment</option><option value="paid">Paid</option>
          </select>
        </label>
        <label>
          Current rank
          <select
            value={rank}
            onChange={(event) => {
              setRank(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All ranks</option>
            {RANKS.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Last paid
          <select
            value={lastPaid}
            onChange={(event) => {
              setLastPaid(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Any date</option>
            <option value="recorded">Date recorded</option>
            <option value="never">Not paid</option>
          </select>
        </label>
        <label>
          Sort order
          <select
            value={sort}
            onChange={(event) => {
              setSort(event.target.value);
              setPage(1);
            }}
          >
            <option value="name">Name</option>
            <option value="studentId">Student ID</option>
            <option value="rank">Current rank</option>
            <option value="lastPaid">Last paid</option>
          </select>
        </label>
        <button
          type="button"
          className="btn-secondary admin-clear"
          disabled={!query && !status && !rank && !lastPaid && sort === "name"}
          onClick={() => {
            setQueryInput("");
            setQuery("");
            setStatus("");
            setRank("");
            setLastPaid("");
            setSort("name");
            setPage(1);
          }}
        >
          Clear filters
        </button>
    </form>

    {selected.size ? <aside className="admin-bulk-toolbar"><strong>{selected.size} selected</strong>{(["no_submission", "awaiting_payment", "paid"] as ContributionStatus[]).map((value) => <button key={value} className="btn-secondary" onClick={() => setPending({ status: value, studentIds: [...selected], amount: "", reference: "" })}>{adminStatusLabel(value)}</button>)}<button className="text-link" onClick={() => setSelected(new Set())}>Clear selection</button></aside> : null}

    <div className="admin-table-scroll"><table className="admin-record-table"><thead><tr>
      <th><label className="admin-select-box"><input type="checkbox" aria-label="Select all visible students" checked={allVisibleSelected} onChange={(event) => setSelected(event.target.checked ? new Set(data.contributions.map((row) => row.student_id)) : new Set())} /><span aria-hidden="true" /></label></th>
      <th>Student</th><th>Contribution</th><th>Last paid</th><th>Renewal</th><th>Consecutive</th><th>History</th><th>Actions</th>
    </tr></thead><tbody>{data.contributions.map((row) => <tr key={row.student_id} className={selected.has(row.student_id) ? "is-selected" : ""}>
      <td><label className="admin-select-box"><input type="checkbox" aria-label={`Select ${row.student_name}`} checked={selected.has(row.student_id)} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(row.student_id); else next.delete(row.student_id); return next; })} /><span aria-hidden="true" /></label></td>
      <th><span className="admin-student-identity">{row.profile_image_url ? <img src={row.profile_image_url} alt="" /> : <span aria-hidden="true"><UserRound size={18} /></span>}<span>{row.student_name}<code className="admin-table-subline">{row.public_student_id}</code><small className="admin-table-subline">{row.current_rank}</small></span></span></th><td><MonthlySummary row={row} month={data.month} /></td><td>{row.last_paid_month ? monthLabel(row.last_paid_month) : "Not yet paid"}{row.last_paid_at ? <small className="admin-table-subline">{formatGregorianDate(row.last_paid_at, row.last_paid_at)}</small> : null}</td><td>{row.renewal.dueDate ? formatGregorianDate(row.renewal.dueDate, row.renewal.dueDate) : "Unknown"}{row.renewal.days != null ? <small className="admin-table-subline">{Math.abs(row.renewal.days)} day{Math.abs(row.renewal.days) === 1 ? "" : "s"} {row.renewal.days < 0 ? "overdue" : "remaining"}</small> : <small className="admin-table-subline">30 days after payment</small>}</td><td><strong>{row.consecutiveMonths}</strong><small className="admin-table-subline">month{row.consecutiveMonths === 1 ? "" : "s"} paid</small></td><td>{row.history.length ? <details className="admin-aat-history"><summary><History size={14} /> {row.history.length} payment{row.history.length === 1 ? "" : "s"}</summary><ol>{row.history.map((entry) => <li key={entry.id}><strong>{monthLabel(entry.month_key)}</strong> · {entry.paid_at ? formatGregorianDate(entry.paid_at, entry.paid_at) : "Date unavailable"}{entry.paid_by ? ` · by ${entry.paid_by}` : ""}<span className="admin-status is-active">Paid</span></li>)}</ol></details> : <span className="admin-aat-history-empty">No payments</span>}</td>
      <td><select className="admin-row-action-select" aria-label={`Set contribution status for ${row.student_name}`} value={row.status} onChange={(event) => setPending({ status: event.target.value as ContributionStatus, studentIds: [row.student_id], amount: "", reference: "" })}>{(["no_submission", "awaiting_payment", "paid"] as ContributionStatus[]).map((value) => <option key={value} value={value}>{adminStatusLabel(value)}</option>)}</select></td>
    </tr>)}{!data.contributions.length && !loading ? <tr><td colSpan={8}><div className="admin-empty-inline"><ReceiptText size={22} /> No contribution records match these filters.</div></td></tr> : null}</tbody></table></div>

    <footer className="admin-pagination"><span>{data.pagination.total} record{data.pagination.total === 1 ? "" : "s"}</span><div><button className="btn-secondary" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft size={16} /> Previous</button><span>Page {data.pagination.page} of {data.pagination.totalPages}</span><button className="btn-secondary" disabled={page >= data.pagination.totalPages || loading} onClick={() => setPage((value) => value + 1)}>Next <ChevronRight size={16} /></button></div></footer>
    {loading ? <div className="admin-loading-overlay"><LoaderCircle className="spin" /><span>Loading contributions</span></div> : null}

    {pending ? <div className="admin-confirm-backdrop" role="presentation"><section className="admin-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="contribution-status-title">
      <header><div><p className="eyebrow">Confirm ledger change</p><h2 id="contribution-status-title">Mark {pending.studentIds.length} contribution{pending.studentIds.length === 1 ? "" : "s"} {adminStatusLabel(pending.status).toLowerCase()}?</h2></div><button aria-label="Close" onClick={() => setPending(null)}><X /></button></header>
      <p>This updates {monthLabel(data.month)} only and adds a permanent audit entry. “Paid” should be selected only after verifying payment.</p>
      {pending.studentIds.length <= 5 ? <ul>{pendingNames.map((row) => <li key={row.student_id}>{row.student_name} · {row.public_student_id}</li>)}</ul> : null}
      <label>Contribution type<select value="renshinkan_monthly" disabled><option value="renshinkan_monthly">Monthly RenShinKan Student Contribution</option></select></label>
      <label>Amount in THB <small>Optional.</small><input type="number" min="0" step="0.01" value={pending.amount} onChange={(event) => setPending({ ...pending, amount: event.target.value })} /></label>
      <label>Payment reference <small>Optional.</small><input maxLength={200} value={pending.reference} onChange={(event) => setPending({ ...pending, reference: event.target.value })} /></label>
      <footer><button className="btn-secondary" onClick={() => setPending(null)}>Cancel</button><button className="btn-primary" disabled={saving} onClick={() => void updateStatus()}>{saving ? <LoaderCircle className="spin" size={16} /> : <CheckCircle2 size={16} />} Confirm status change</button></footer>
    </section></div> : null}
  </section>;
}
