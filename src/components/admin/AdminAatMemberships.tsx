import { FormEvent, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  History,
  LoaderCircle,
  ReceiptText,
  RotateCcw,
  Search,
  UserRound,
  X,
} from "lucide-react";
import type { AdminDojo, AdminIdentity } from "./AdminAccess";
import { adminApi } from "./adminApi";
import { GregorianDateInput } from "../GregorianDateInput";
import {
  bangkokCanonicalDate,
  formatGregorianDate,
} from "../../../shared/date";
import { RANKS } from "../../../shared/ranks";

type PaymentEntry = {
  id: string;
  paymentDate: string;
  amount: number | null;
  currency: string;
  recordedBy: string;
  notes: string;
  paymentStatus: "paid" | "cancelled" | "refunded";
};

type Membership = {
  id: string;
  display_name: string;
  public_student_id: string;
  profile_image_url: string | null;
  dojo_id: string;
  dojo_name: string;
  current_belt: string;
  aatDisplay: string;
  aat_number: string | null;
  aat_last_paid_date: string | null;
  aat_notes: string;
  payment_awaiting_review: number;
  membership: {
    state: "new" | "unpaid" | "current" | "expiring" | "expired";
    label: string;
    dueDate: string | null;
    days: number | null;
  };
  history: PaymentEntry[];
};

type Response = {
  memberships: Membership[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

function MembershipSummary({ row }: { row: Membership }) {
  const awaitingReview = Boolean(row.payment_awaiting_review);
  const paymentRequired = row.membership.state === "new" || row.membership.state === "unpaid";
  const label = awaitingReview ? "Awaiting payment review" : paymentRequired ? "Payment required" : row.membership.label;
  const tone = awaitingReview || row.membership.state === "expiring"
    ? "is-pending"
    : row.membership.state === "expired" || row.membership.state === "unpaid"
      ? "is-error"
      : row.membership.state === "current"
        ? "is-active"
        : "is-neutral";

  return <span className="admin-aat-membership-cell">
    {row.aat_number ? <code className="admin-aat-number">{row.aat_number}</code> : null}
    <span className={`admin-status admin-aat-status ${tone}`}>
      {row.membership.state === "expired" ? <AlertTriangle size={13} /> : row.membership.state === "current" ? <CheckCircle2 size={13} /> : <ReceiptText size={13} />}
      {label}
    </span>
  </span>;
}

export function AdminAatMemberships({
  admin, dojos, report,
}: {
  admin: AdminIdentity;
  dojos: AdminDojo[];
  report: (message: string, isError?: boolean) => void;
}) {
  const [rows, setRows] = useState<Membership[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 40,
    total: 0,
    totalPages: 1,
  });
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState(() => {
    const value =
      new URLSearchParams(window.location.search).get("status") || "";
    if (value === "new" || value === "unpaid") return "payment_required";
    return [
      "pending_payment",
      "payment_required",
      "current",
      "expiring",
      "expired",
    ].includes(value)
      ? value
      : "";
  });
  const [dojoId, setDojoId] = useState("");
  const [rank, setRank] = useState("");
  const [lastPaid, setLastPaid] = useState("");
  const [sort, setSort] = useState("name");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [paymentTargets, setPaymentTargets] = useState<Membership[]>([]);
  const [payment, setPayment] = useState({
    paymentDate: "",
    aatNumber: "",
    amount: "",
    notes: "",
  });
  const [reversal, setReversal] = useState<{
    row: Membership;
    entry: PaymentEntry;
    reason: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const reversalDialogRef = useRef<HTMLElement>(null);
  const reversalTriggerRef = useRef<HTMLElement | null>(null);
  const superAdmin = admin.permissionLevel === "renshinkan_super_admin";
  const selectedRows = rows.filter((row) => selectedIds.has(row.id));

  useEffect(() => {
    if (!reversal || !reversalDialogRef.current) return;
    const dialog = reversalDialogRef.current;
    const focusable = () => [...dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )];
    dialog.querySelector<HTMLTextAreaElement>("textarea")?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setReversal(null);
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    dialog.addEventListener("keydown", onKeyDown);
    return () => {
      dialog.removeEventListener("keydown", onKeyDown);
      reversalTriggerRef.current?.focus();
    };
  }, [reversal?.entry.id]);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (query) params.set("query", query);
      if (status) params.set("status", status);
      if (dojoId && superAdmin) params.set("dojoId", dojoId);
      if (rank) params.set("rank", rank);
      if (lastPaid) params.set("lastPaid", lastPaid);
      params.set("sort", sort);
      const body = await adminApi<Response>(`/api/admin/memberships?${params}`);
      setRows(body.memberships);
      setPagination(body.pagination);
      setSelectedIds(
        (current) =>
          new Set(
            [...current].filter((id) =>
              body.memberships.some((row) => row.id === id),
            ),
          ),
      );
    } catch (reason) {
      report(
        reason instanceof Error
          ? reason.message
          : "Membership records could not be loaded.",
        true,
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [admin.selectedDojoId, query, status, dojoId, rank, lastPaid, sort, page]);

  function openPayment(targets: Membership[]) {
    if (!targets.length) return;
    setPaymentTargets(targets);
    setPayment({
      paymentDate: bangkokCanonicalDate(),
      aatNumber: targets.length === 1 ? targets[0].aat_number || "" : "",
      amount: "",
      notes: targets.length === 1 ? targets[0].aat_notes || "" : "",
    });
  }

  async function markPaid(event: FormEvent) {
    event.preventDefault();
    if (!paymentTargets.length) return;
    setSaving(true);
    const failed: Array<{ row: Membership; message: string }> = [];
    let completed = 0;
    for (const row of paymentTargets) {
      try {
        await adminApi("/api/admin/memberships", {
          method: "POST",
          body: JSON.stringify({
            action: "mark_paid",
            confirmed: true,
            studentId: row.id,
            ...payment,
            aatNumber: paymentTargets.length === 1 ? payment.aatNumber : row.aat_number || "",
          }),
        });
        completed += 1;
      } catch (reason) {
        failed.push({ row, message: reason instanceof Error ? reason.message : "The AAT payment could not be recorded." });
      }
    }
    if (completed) report(`AAT payment recorded for ${completed} student${completed === 1 ? "" : "s"}.`);
    if (failed.length) report(`${failed.length} payment${failed.length === 1 ? "" : "s"} could not be recorded. ${failed[0].row.display_name}: ${failed[0].message}`, true);
    setSelectedIds(new Set(failed.map(({ row }) => row.id)));
    setPaymentTargets([]);
    await load();
    setSaving(false);
  }

  async function markUnpaid(event: FormEvent) {
    event.preventDefault();
    if (!reversal) return;
    setSaving(true);
    try {
      await adminApi("/api/admin/memberships", {
        method: "POST",
        body: JSON.stringify({
          action: "mark_unpaid",
          confirmed: true,
          studentId: reversal.row.id,
          paymentId: reversal.entry.id,
          reason: reversal.reason,
        }),
      });
      report(`Paid status removed for ${reversal.row.display_name}. The original payment history was preserved.`);
      setReversal(null);
      await load();
    } catch (reason) {
      report(reason instanceof Error ? reason.message : "The paid status could not be removed.", true);
    } finally {
      setSaving(false);
    }
  }

  return <section className="admin-workspace-section admin-aat-memberships" aria-busy={loading}>
    <header className="admin-workspace-heading"><div><p className="eyebrow">Annual membership</p><h2>AAT Annual Membership</h2><p>Review membership status, renewal dates, expiration warnings, and permanent payment history.</p></div></header>
    <form className="admin-record-filters" onSubmit={(event) => { event.preventDefault(); setPage(1); setQuery(queryInput.trim()); }}>
      <label className="admin-search-wide">Search<div><Search size={17} /><input value={queryInput} onChange={(event) => setQueryInput(event.target.value)} placeholder="Name, Student ID, or AAT number" /><button className="btn-secondary">Search</button></div></label>
      <label>
          Membership status
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            <option value="pending_payment">Payment awaiting approval</option>
            <option value="payment_required">Payment required</option>
            <option value="current">Current</option>
            <option value="expiring">Expiring soon</option>
            <option value="expired">Expired</option>
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
            <option value="never">Never paid</option>
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
        {superAdmin ? (
          <label>
            Dojo
            <select
              value={dojoId}
              onChange={(event) => {
                setDojoId(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All dojos</option>
              {dojos.map((dojo) => (
                <option key={dojo.id} value={dojo.id}>
                  {dojo.official_name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {query || status || dojoId || rank || lastPaid || sort !== "name" ? (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setQueryInput("");
              setQuery("");
              setStatus("");
              setDojoId("");
              setRank("");
              setLastPaid("");
              setSort("name");
              setPage(1);
            }}
          >
            Clear filters
          </button>
        ) : null}
      </form>
      {selectedRows.length ? (
        <aside className="admin-aat-bulk-bar">
          <strong>{selectedRows.length} selected</strong>
          <button
            className="btn-secondary"
            onClick={() => openPayment(selectedRows)}
          >
            <ReceiptText size={15} /> Record payment
          </button>
          <button
            className="text-link"
            onClick={() => setSelectedIds(new Set())}
          >
            Clear selection
          </button>
        </aside>
      ) : null}
      <div className="admin-table-scroll">
        <table className="admin-record-table admin-aat-table">
          <thead><tr><th><label className="admin-select-box"><input type="checkbox" aria-label="Select all visible AAT memberships" checked={rows.length > 0 && rows.every((row) => selectedIds.has(row.id))} onChange={(event) => setSelectedIds(event.target.checked ? new Set(rows.map((row) => row.id)) : new Set())} /><span aria-hidden="true" /></label></th><th>Student</th>{superAdmin ? <th>Dojo</th> : null}<th>Membership</th><th>Last paid</th><th>Renewal</th><th>History</th><th>Actions</th></tr></thead><tbody>
      {rows.map((row) => <tr key={row.id} className={selectedIds.has(row.id) ? "is-selected" : ""}><td><label className="admin-select-box"><input type="checkbox" aria-label={`Select AAT membership for ${row.display_name}`} checked={selectedIds.has(row.id)} onChange={(event) => setSelectedIds((current) => { const next = new Set(current); if (event.target.checked) next.add(row.id); else next.delete(row.id); return next; })} /><span aria-hidden="true" /></label></td><th><span className="admin-student-identity">{row.profile_image_url ? <img src={row.profile_image_url} alt="" /> : <span aria-hidden="true"><UserRound size={18} /></span>}<span>{row.display_name}<code className="admin-table-subline">{row.public_student_id}</code></span></span></th>{superAdmin ? <td>{row.dojo_name}</td> : null}<td><MembershipSummary row={row} /></td><td>{formatGregorianDate(row.aat_last_paid_date, "Not yet paid")}</td><td>{formatGregorianDate(row.membership.dueDate, "Unknown")}{row.membership.days != null ? <small className="admin-table-subline">{Math.abs(row.membership.days)} day{Math.abs(row.membership.days) === 1 ? "" : "s"} {row.membership.days < 0 ? "overdue" : "remaining"}</small> : null}</td><td>{row.history.length ? <details className="admin-aat-history"><summary><History size={14} /> {row.history.length} payment{row.history.length === 1 ? "" : "s"}</summary><ol>{row.history.map((entry) => <li key={entry.id} className={entry.paymentStatus !== "paid" ? "is-reversed" : ""}><strong>{formatGregorianDate(entry.paymentDate, entry.paymentDate)}</strong> · {entry.amount == null ? "Amount not recorded" : `${entry.amount.toLocaleString()} ${entry.currency}`} · by {entry.recordedBy}<span className={`admin-status ${entry.paymentStatus === "paid" ? "is-active" : "is-neutral"}`}>{entry.paymentStatus === "paid" ? "Paid" : "Paid status removed"}</span>{entry.notes ? <div>{entry.notes}</div> : null}{entry.paymentStatus === "paid" ? <button type="button" className="text-link" onClick={(event) => { reversalTriggerRef.current = event.currentTarget; setReversal({ row, entry, reason: "" }); }}><RotateCcw size={13} /> Mark as unpaid</button> : null}</li>)}</ol></details> : <span className="admin-aat-history-empty">No payments</span>}</td><td><div className="admin-row-actions"><button type="button" onClick={() => openPayment([row])}><ReceiptText size={14} /> {row.payment_awaiting_review ? "Review payment" : "Record payment"}</button></div></td></tr>)}
      {!rows.length && !loading ? <tr><td colSpan={superAdmin ? 8 : 7}>No membership records match these filters.</td></tr> : null}
    </tbody></table></div>
    <nav className="admin-pagination"><button className="btn-secondary" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={16} /> Previous</button><span>Page {pagination.page} of {pagination.totalPages}</span><button className="btn-secondary" disabled={page >= pagination.totalPages || loading} onClick={() => setPage((value) => value + 1)}>Next <ChevronRight size={16} /></button></nav>
    {loading ? <div className="admin-loading-overlay"><LoaderCircle className="spin" /> Loading memberships</div> : null}
    {paymentTargets.length ? <div className="admin-confirm-backdrop"><section className="admin-confirm-dialog" role="dialog" aria-modal="true"><header><div><p className="eyebrow">AAT annual membership</p><h2>{paymentTargets.length === 1 ? `Record payment for ${paymentTargets[0].display_name}` : `Record payment for ${paymentTargets.length} students`}</h2></div><button aria-label="Close" onClick={() => setPaymentTargets([])}><X /></button></header><form className="admin-bulk-form admin-aat-payment-form" onSubmit={markPaid}>{paymentTargets.length === 1 ? <label>AAT number (optional)<input value={payment.aatNumber} onChange={(event) => setPayment({ ...payment, aatNumber: event.target.value })} placeholder="Leave blank to keep NEW" /></label> : <p className="admin-aat-bulk-note">Each student keeps their existing AAT membership number.</p>}<label>Payment date<GregorianDateInput admin required value={payment.paymentDate} onChange={(value) => setPayment({ ...payment, paymentDate: value })} /></label><label>Amount in THB (optional)<input type="number" min="0" step="0.01" value={payment.amount} onChange={(event) => setPayment({ ...payment, amount: event.target.value })} /></label><label className="admin-aat-payment-notes">Notes<textarea maxLength={2000} value={payment.notes} onChange={(event) => setPayment({ ...payment, notes: event.target.value })} /></label><p className="admin-help">Renewal is normally due one calendar year after this payment. A permanent history entry is added for each selected student.</p><footer><button type="button" className="btn-secondary" onClick={() => setPaymentTargets([])}>Cancel</button><button className="btn-primary" disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} /> : <ReceiptText size={16} />} Confirm {paymentTargets.length} payment{paymentTargets.length === 1 ? "" : "s"}</button></footer></form></section></div> : null}
    {reversal ? <div className="admin-confirm-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setReversal(null); }}><section ref={reversalDialogRef} className="admin-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="aat-reversal-title"><header><div><p className="eyebrow">Confirmed correction</p><h2 id="aat-reversal-title">Mark this payment as unpaid?</h2></div><button type="button" aria-label="Close" disabled={saving} onClick={() => setReversal(null)}><X /></button></header><form className="admin-bulk-form" onSubmit={markUnpaid}><p><strong>{reversal.row.display_name}</strong> ({reversal.row.public_student_id})</p><dl className="admin-confirm-summary"><div><dt>Payment year</dt><dd>{reversal.entry.paymentDate.slice(0, 4)}</dd></div><div><dt>Payment date</dt><dd>{formatGregorianDate(reversal.entry.paymentDate, reversal.entry.paymentDate)}</dd></div><div><dt>Payment ID</dt><dd><code>{reversal.entry.id}</code></dd></div></dl><p className="admin-help">This removes the paid status and recalculates the student's latest paid date. The original payment record and both audit histories remain intact.</p><label>Reason or correction note (optional)<textarea autoFocus maxLength={2000} value={reversal.reason} onChange={(event) => setReversal({ ...reversal, reason: event.target.value })} /></label><footer><button type="button" className="btn-secondary" disabled={saving} onClick={() => setReversal(null)}>Cancel</button><button className="btn-primary is-danger" disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} /> : <RotateCcw size={16} />} Confirm unpaid status</button></footer></form></section></div> : null}
  </section>;
}
