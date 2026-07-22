import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2, ChevronLeft, ChevronRight, FileImage, LoaderCircle, Search, ShieldCheck, UserRound, X, XCircle,
} from "lucide-react";
import { adminApi, adminStatusLabel, formatAdminDate } from "./adminApi";

type ProofStatus = "pending_review" | "approved" | "denied";
type PaymentType = "exam" | "aat_annual" | "renshinkan_monthly";
type PaymentProof = {
  id: string;
  student_id: string;
  dojo_id: string;
  payment_type: PaymentType;
  payment_reference_id: string;
  status: ProofStatus;
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_note: string;
  expires_at: string;
  original_filename: string;
  student_name: string;
  public_student_id: string;
  profile_image_url: string | null;
  dojo_name: string;
  covered_student_count: number;
  covered_students: string;
};
type ProofResponse = {
  proofs: PaymentProof[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  summary: { total: number; pending: number; approved: number; denied: number };
};
type ReviewDraft = { action: "approve" | "deny"; proofIds: string[]; note: string };

const EMPTY: ProofResponse = {
  proofs: [], pagination: { page: 1, pageSize: 25, total: 0, totalPages: 1 },
  summary: { total: 0, pending: 0, approved: 0, denied: 0 },
};

function purposeLabel(value: PaymentType) {
  if (value === "exam") return "Examination fee";
  if (value === "aat_annual") return "AAT annual contribution";
  return "Monthly contribution";
}

function ProofStatusBadge({ value }: { value: ProofStatus }) {
  const tone = value === "approved" ? "is-active" : value === "denied" ? "is-error" : "is-pending";
  return <span className={`admin-status ${tone}`}>{adminStatusLabel(value)}</span>;
}

export function AdminPaymentProofs({ showAllDojos, report }: { showAllDojos: boolean; report: (message: string, isError?: boolean) => void }) {
  const [data, setData] = useState<ProofResponse>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ProofStatus | "">("pending_review");
  const [paymentType, setPaymentType] = useState<PaymentType | "">("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [opened, setOpened] = useState<PaymentProof | null>(null);
  const [review, setReview] = useState<ReviewDraft | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (query) params.set("query", query);
      if (status) params.set("status", status);
      if (paymentType) params.set("paymentType", paymentType);
      const body = await adminApi<ProofResponse>(`/api/admin/payment-proofs?${params}`);
      setData(body);
      setSelected((current) => new Set([...current].filter((id) => body.proofs.some((proof) => proof.id === id && proof.status === "pending_review"))));
      setOpened((current) => current ? body.proofs.find((proof) => proof.id === current.id) || null : null);
    } catch (reason) {
      report(reason instanceof Error ? reason.message : "Could not load submitted payslips.", true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [page, query, status, paymentType]);

  const pendingRows = useMemo(() => data.proofs.filter((proof) => proof.status === "pending_review"), [data.proofs]);
  const allPendingSelected = pendingRows.length > 0 && pendingRows.every((proof) => selected.has(proof.id));

  async function submitReview() {
    if (!review || (review.action === "deny" && !review.note.trim())) return;
    setSaving(true);
    try {
      const result = await adminApi<{ count: number }>("/api/admin/payment-proofs", {
        method: "POST",
        body: JSON.stringify({ action: review.action, proofIds: review.proofIds, note: review.note }),
      });
      report(`${result.count} payslip${result.count === 1 ? "" : "s"} ${review.action === "approve" ? "approved" : "denied"}.`);
      setReview(null);
      setOpened(null);
      setSelected(new Set());
      await load();
    } catch (reason) {
      report(reason instanceof Error ? reason.message : "Could not review the selected payslip.", true);
    } finally {
      setSaving(false);
    }
  }

  function toggle(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  }

  return <section className="admin-workspace-section admin-payment-proofs" aria-busy={loading}>
    <header className="admin-workspace-heading"><div><p className="eyebrow">Private payment review</p><h2>Submitted Payslips</h2><p>Review recent proof of payment for examinations, AAT annual contributions, and monthly contributions. Images are automatically removed after 60 days.</p></div></header>

    <div className="admin-summary admin-payment-proof-summary">
      <div><strong>{Number(data.summary.total || 0)}</strong><span>Recent</span></div>
      <div><strong>{Number(data.summary.pending || 0)}</strong><span>Needs review</span></div>
      <div><strong>{Number(data.summary.approved || 0)}</strong><span>Approved</span></div>
      <div><strong>{Number(data.summary.denied || 0)}</strong><span>Denied</span></div>
    </div>

    <form className="admin-record-filters admin-payment-proof-filters" onSubmit={(event) => { event.preventDefault(); setPage(1); setQuery(queryInput.trim()); }}>
      <label className="admin-search-wide">Search students<div><Search size={17} /><input value={queryInput} onChange={(event) => setQueryInput(event.target.value)} placeholder="Name or Student ID" /><button className="btn-secondary">Search</button></div></label>
      <label>Review status<select value={status} onChange={(event) => { setStatus(event.target.value as ProofStatus | ""); setPage(1); setSelected(new Set()); }}><option value="">All statuses</option><option value="pending_review">Needs review</option><option value="approved">Approved</option><option value="denied">Denied</option></select></label>
      <label>Payment for<select value={paymentType} onChange={(event) => { setPaymentType(event.target.value as PaymentType | ""); setPage(1); setSelected(new Set()); }}><option value="">All payment types</option><option value="exam">Examination fee</option><option value="aat_annual">AAT annual contribution</option><option value="renshinkan_monthly">Monthly contribution</option></select></label>
      {(query || status !== "pending_review" || paymentType) ? <button type="button" className="btn-secondary" onClick={() => { setQueryInput(""); setQuery(""); setStatus("pending_review"); setPaymentType(""); setPage(1); setSelected(new Set()); }}>Reset filters</button> : null}
    </form>

    {selected.size ? <aside className="admin-bulk-toolbar admin-payment-proof-bulk"><strong>{selected.size} pending payslip{selected.size === 1 ? "" : "s"} selected</strong><button className="btn-secondary" onClick={() => setReview({ action: "approve", proofIds: [...selected], note: "" })}><CheckCircle2 size={16} /> Approve</button><button className="btn-secondary is-danger" onClick={() => setReview({ action: "deny", proofIds: [...selected], note: "" })}><XCircle size={16} /> Deny</button><button className="text-link" onClick={() => setSelected(new Set())}>Clear selection</button></aside> : null}

    <div className="admin-table-scroll"><table className="admin-record-table admin-payment-proof-table"><thead><tr>
      <th><label className="admin-select-box"><input type="checkbox" aria-label="Select every pending payslip on this page" checked={allPendingSelected} onChange={(event) => setSelected(event.target.checked ? new Set(pendingRows.map((proof) => proof.id)) : new Set())} /><span aria-hidden="true" /></label></th>
      <th>Student</th><th>Student ID</th>{showAllDojos ? <th>Dojo</th> : null}<th>Payment for</th><th>Submitted</th><th>Expires</th><th>Status</th><th>Actions</th>
    </tr></thead><tbody>{data.proofs.map((proof) => <tr key={proof.id} className={selected.has(proof.id) ? "is-selected" : ""}>
      <td>{proof.status === "pending_review" ? <label className="admin-select-box"><input type="checkbox" aria-label={`Select payslip from ${proof.student_name}`} checked={selected.has(proof.id)} onChange={(event) => toggle(proof.id, event.target.checked)} /><span aria-hidden="true" /></label> : null}</td>
      <th><span className="admin-student-identity">{proof.profile_image_url ? <img src={proof.profile_image_url} alt="" /> : <span aria-hidden="true"><UserRound size={18} /></span>}<span>{proof.student_name}{proof.covered_student_count > 1 ? <small> + {proof.covered_student_count - 1} more</small> : null}</span></span></th><td><code>{proof.public_student_id}</code></td>{showAllDojos ? <td>{proof.dojo_name}</td> : null}<td>{purposeLabel(proof.payment_type)}{proof.covered_student_count > 1 ? <small className="admin-table-subline">{proof.covered_student_count} students</small> : null}</td><td>{formatAdminDate(proof.submitted_at)}</td><td>{formatAdminDate(proof.expires_at)}</td><td><ProofStatusBadge value={proof.status} /></td><td><div className="admin-row-actions"><button type="button" onClick={() => setOpened(proof)}><FileImage size={14} /> {proof.status === "pending_review" ? "Review" : "View"}</button></div></td>
    </tr>)}{!data.proofs.length && !loading ? <tr><td colSpan={showAllDojos ? 9 : 8}><div className="admin-empty-inline"><FileImage size={24} /><strong>No submitted payslips match these filters.</strong></div></td></tr> : null}</tbody></table></div>

    <footer className="admin-pagination"><span>{data.pagination.total} payslip{data.pagination.total === 1 ? "" : "s"}</span><div><button className="btn-secondary" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft size={16} /> Previous</button><span>Page {data.pagination.page} of {data.pagination.totalPages}</span><button className="btn-secondary" disabled={page >= data.pagination.totalPages || loading} onClick={() => setPage((value) => value + 1)}>Next <ChevronRight size={16} /></button></div></footer>
    {loading ? <div className="admin-loading-overlay"><LoaderCircle className="spin" /><span>Loading submitted payslips</span></div> : null}

    {opened ? <div className="admin-confirm-backdrop" role="presentation"><section className="admin-confirm-dialog admin-payment-proof-dialog" role="dialog" aria-modal="true" aria-labelledby="payment-proof-title">
      <header><div><p className="eyebrow">{purposeLabel(opened.payment_type)}</p><h2 id="payment-proof-title">{opened.student_name}</h2><p>{opened.public_student_id}{showAllDojos ? ` / ${opened.dojo_name}` : ""}</p></div><button aria-label="Close payslip" onClick={() => setOpened(null)}><X /></button></header>
      <div className="admin-payment-proof-image"><img src={`/api/admin/payment-proofs/${opened.id}`} alt={`Payslip submitted by ${opened.student_name}`} /></div>
      <dl className="admin-payment-proof-details"><div><dt>Payment for</dt><dd>{purposeLabel(opened.payment_type)}</dd></div>{opened.covered_student_count > 1 ? <div className="admin-payment-proof-details__wide"><dt>Students covered ({opened.covered_student_count})</dt><dd>{opened.covered_students}</dd></div> : null}<div><dt>Submitted</dt><dd>{formatAdminDate(opened.submitted_at)}</dd></div><div><dt>Available until</dt><dd>{formatAdminDate(opened.expires_at)}</dd></div><div><dt>Status</dt><dd><ProofStatusBadge value={opened.status} /></dd></div>{opened.reviewed_at ? <div><dt>Reviewed</dt><dd>{formatAdminDate(opened.reviewed_at)} by {opened.reviewed_by || "administrator"}</dd></div> : null}{opened.review_note ? <div><dt>Review note</dt><dd>{opened.review_note}</dd></div> : null}</dl>
      <p className="admin-payment-proof-privacy"><ShieldCheck size={16} /> Private image. Do not download or share it unless required for the payment review.</p>
      <footer><button className="btn-secondary" onClick={() => setOpened(null)}>Close</button>{opened.status === "pending_review" ? <><button className="btn-secondary is-danger" onClick={() => setReview({ action: "deny", proofIds: [opened.id], note: "" })}><XCircle size={16} /> Deny</button><button className="btn-primary" onClick={() => setReview({ action: "approve", proofIds: [opened.id], note: "" })}><CheckCircle2 size={16} /> Approve</button></> : null}</footer>
    </section></div> : null}

    {review ? <div className="admin-confirm-backdrop admin-payment-review-backdrop" role="presentation"><section className="admin-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="payment-review-title">
      <header><div><p className="eyebrow">Confirm payment review</p><h2 id="payment-review-title">{review.action === "approve" ? "Approve" : "Deny"} {review.proofIds.length} payslip{review.proofIds.length === 1 ? "" : "s"}?</h2></div><button aria-label="Close confirmation" onClick={() => setReview(null)}><X /></button></header>
      <p>{review.action === "approve" ? "Approving confirms the related payment and records a permanent audit entry." : "Denying leaves the related payment unconfirmed and records the reason for the student record."}</p>
      <label>Administrator note <small>Private admin-only note—never shown to students or the public. {review.action === "deny" ? "Required for denial." : "Optional."}</small><textarea value={review.note} maxLength={2000} onChange={(event) => setReview({ ...review, note: event.target.value })} /></label>
      <footer><button className="btn-secondary" onClick={() => setReview(null)}>Cancel</button><button className={`btn-primary${review.action === "deny" ? " is-danger" : ""}`} disabled={saving || (review.action === "deny" && !review.note.trim())} onClick={() => void submitReview()}>{saving ? <LoaderCircle className="spin" size={16} /> : review.action === "approve" ? <CheckCircle2 size={16} /> : <XCircle size={16} />} {review.action === "approve" ? "Approve payslip" : "Deny payslip"}</button></footer>
    </section></div> : null}
  </section>;
}
