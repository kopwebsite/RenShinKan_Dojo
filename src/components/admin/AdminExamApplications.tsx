import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Download, FileSpreadsheet, GraduationCap, LoaderCircle,
  Search, UserRound, X,
} from "lucide-react";
import { adminApi, adminStatusLabel, formatAdminDate } from "./adminApi";
import type { AdminDojo, AdminIdentity } from "./AdminAccess";

type ExamStatus = "not_signed_up" | "unpaid" | "paid";
type Cycle = { id: string; name: string; title: string; status: "active" | "closed"; lifecycle_status: string; rank_category: string; examination_type: string; application_opens_at: string | null; application_closes_at: string | null; examination_at: string | null; venue: string; instructions: string; rank_fee_config_json: string; annual_fee_config_json: string; created_at: string; closed_at: string | null };
type Student = {
  status_id: string | null;
  student_id: string;
  student_name: string;
  public_student_id: string;
  current_rank: string;
  requested_rank: string | null;
  application_id: string | null;
  application_date: string | null;
  status: ExamStatus;
  profile_image_url: string | null;
};
type Response = {
  cycles: Cycle[];
  selectedCycle: Cycle | null;
  students: Student[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  summary: { total: number; not_signed_up: number; unpaid: number; paid: number };
};
type PendingChange = { status: ExamStatus; studentIds: string[] };

const EMPTY: Response = {
  cycles: [], selectedCycle: null, students: [],
  pagination: { page: 1, pageSize: 50, total: 0, totalPages: 1 },
  summary: { total: 0, not_signed_up: 0, unpaid: 0, paid: 0 },
};

function feeValue(json: string, key: "kyu" | "dan" | "default") {
  try {
    const value = Number((JSON.parse(json) as Record<string, unknown>)[key]);
    return Number.isFinite(value) && value >= 0 ? String(value) : "0";
  } catch { return "0"; }
}

function Status({ value }: { value: ExamStatus }) {
  const tone = value === "paid" ? "is-active" : value === "unpaid" ? "is-pending" : "is-neutral";
  return <span className={`admin-status ${tone}`}>{adminStatusLabel(value)}</span>;
}

export function AdminExamApplications({ report, admin, dojos }: { report: (message: string, isError?: boolean) => void; admin: AdminIdentity; dojos: AdminDojo[] }) {
  const superAdmin = admin.permissionLevel === "renshinkan_super_admin";
  const [data, setData] = useState<Response>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState(() => {
    const value = new URLSearchParams(window.location.search).get("status") || "";
    return value === "not_signed_up" || value === "unpaid" || value === "paid" ? value : "";
  });
  const [cycleId, setCycleId] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [cycleDialog, setCycleDialog] = useState(false);
  const [editingCycle, setEditingCycle] = useState(false);
  const [cycleName, setCycleName] = useState("");
  const [cycleForm, setCycleForm] = useState({ lifecycleStatus: "open", examinationType: "Belt promotion", rankCategory: "Kyu and Dan", applicationOpensAt: "", applicationClosesAt: "", examinationAt: "", venue: "", instructions: "", kyuExamFee: "0", danExamFee: "0", aatAnnualFee: "0" });
  const [exportDojo, setExportDojo] = useState(superAdmin ? "" : admin.selectedDojoId || "");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (query) params.set("query", query);
      if (status) params.set("status", status);
      if (cycleId) params.set("cycleId", cycleId);
      const body = await adminApi<Response>(`/api/admin/examinations?${params}`);
      setData(body);
      if (!cycleId && body.selectedCycle) setCycleId(body.selectedCycle.id);
      setSelected((current) => new Set([...current].filter((id) => body.students.some((student) => student.student_id === id))));
    } catch (reason) {
      report(reason instanceof Error ? reason.message : "Could not load examination applications.", true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [page, query, status, cycleId]);

  const isHistorical = data.selectedCycle?.status === "closed";
  const allVisibleSelected = data.students.length > 0 && data.students.every((student) => selected.has(student.student_id));
  const selectionNames = useMemo(() => data.students.filter((student) => selected.has(student.student_id)), [data.students, selected]);

  async function updateStatus() {
    if (!pending || !data.selectedCycle) return;
    setSaving(true);
    try {
      await adminApi("/api/admin/examinations", {
        method: "POST",
        body: JSON.stringify({
          action: "update_status", confirmed: true, cycleId: data.selectedCycle.id,
          status: pending.status, studentIds: pending.studentIds,
        }),
      });
      report(`${pending.studentIds.length} student${pending.studentIds.length === 1 ? "" : "s"} marked ${adminStatusLabel(pending.status).toLowerCase()} for ${data.selectedCycle.name}.`);
      setPending(null);
      setSelected(new Set());
      await load();
    } catch (reason) {
      report(reason instanceof Error ? reason.message : "Could not update examination status.", true);
    } finally {
      setSaving(false);
    }
  }

  async function startCycle(event: FormEvent) {
    event.preventDefault();
    if (!cycleName.trim()) return;
    setSaving(true);
    try {
      const result = await adminApi<{ cycleId: string; rosterCount?: number }>("/api/admin/examinations", {
        method: "POST",
        body: JSON.stringify({
          action: editingCycle ? "update_cycle" : "start_cycle", cycleId: data.selectedCycle?.id,
          name: cycleName.trim(), confirmed: true, ...cycleForm,
          rankFees: { kyu: Number(cycleForm.kyuExamFee || 0), dan: Number(cycleForm.danExamFee || 0) },
          annualFees: { default: Number(cycleForm.aatAnnualFee || 0) },
        }),
      });
      report(editingCycle ? `Updated ${cycleName.trim()}.` : `Started ${cycleName.trim()} with ${result.rosterCount} active students. The previous cycle is now read-only history.`);
      setCycleName("");
      setCycleDialog(false);
      setEditingCycle(false);
      setCycleId(result.cycleId);
      setPage(1);
      setSelected(new Set());
      if (editingCycle) await load();
    } catch (reason) {
      report(reason instanceof Error ? reason.message : "Could not start a new examination cycle.", true);
    } finally {
      setSaving(false);
    }
  }

  function download(format: "pdf" | "xlsx", monochrome = false) {
    if (!data.selectedCycle) return;
    const params = new URLSearchParams({ format, cycleId: data.selectedCycle.id });
    if (exportDojo) params.set("dojoId", exportDojo);
    if (monochrome) params.set("monochrome", "1");
    window.location.assign(`/api/admin/examinations/export?${params}`);
  }

  return <section className="admin-workspace-section" aria-busy={loading}>
    <header className="admin-workspace-heading">
      <div><p className="eyebrow">Cycle-based workflow</p><h2>Exam Applications</h2><p>Every active student appears in the current cycle. Closed cycles remain read-only.</p></div>
      {superAdmin ? <div className="flex flex-wrap gap-2"><button className="btn-secondary" disabled={!data.selectedCycle} onClick={() => { const cycle = data.selectedCycle; if (!cycle) return; setEditingCycle(true); setCycleName(cycle.title || cycle.name); setCycleForm({ lifecycleStatus: cycle.lifecycle_status, examinationType: cycle.examination_type, rankCategory: cycle.rank_category, applicationOpensAt: cycle.application_opens_at || "", applicationClosesAt: cycle.application_closes_at || "", examinationAt: cycle.examination_at || "", venue: cycle.venue, instructions: cycle.instructions, kyuExamFee: feeValue(cycle.rank_fee_config_json, "kyu"), danExamFee: feeValue(cycle.rank_fee_config_json, "dan"), aatAnnualFee: feeValue(cycle.annual_fee_config_json, "default") }); setCycleDialog(true); }}>Edit Cycle</button><button className="btn-primary" onClick={() => { setEditingCycle(false); setCycleName(""); setCycleForm({ lifecycleStatus: "open", examinationType: "Belt promotion", rankCategory: "Kyu and Dan", applicationOpensAt: "", applicationClosesAt: "", examinationAt: "", venue: "", instructions: "", kyuExamFee: "0", danExamFee: "0", aatAnnualFee: "0" }); setCycleDialog(true); }}><GraduationCap size={17} /> Start New Exam Cycle</button></div> : null}
    </header>

    <div className="admin-workspace-toolbar">
      <label>Exam cycle<select value={cycleId} onChange={(event) => { setCycleId(event.target.value); setPage(1); setSelected(new Set()); }}>
        {data.cycles.map((cycle) => <option key={cycle.id} value={cycle.id}>{cycle.name}{cycle.status === "active" ? " — Current" : " — History"}</option>)}
      </select></label>
      {data.selectedCycle ? <p className="admin-cycle-context"><strong>{data.selectedCycle.name}</strong><span>{isHistorical ? "Read-only historical cycle" : "Current active cycle"}</span></p> : null}
    </div>

    {data.selectedCycle ? <div className="admin-workspace-toolbar" aria-label="Report export">
      {superAdmin ? <label>Report scope<select value={exportDojo} onChange={(event) => setExportDojo(event.target.value)}><option value="">All Dojos</option>{dojos.map((dojo) => <option key={dojo.id} value={dojo.id}>{dojo.official_name}</option>)}</select></label> : <p><strong>{dojos.find((dojo) => dojo.id === admin.selectedDojoId)?.official_name || "Your dojo"}</strong><br /><small>Exports are securely limited to your dojo.</small></p>}
      <button type="button" className="btn-secondary" onClick={() => download("pdf")}><Download size={16} /> PDF</button>
      <button type="button" className="btn-secondary" onClick={() => download("pdf", true)}><Download size={16} /> Print-friendly PDF</button>
      <button type="button" className="btn-secondary" onClick={() => download("xlsx")}><FileSpreadsheet size={16} /> Excel</button>
    </div> : null}

    <div className="admin-summary admin-summary--five">
      <div><strong>{data.summary.total}</strong><span>Total roster</span></div>
      <div><strong>{data.summary.not_signed_up}</strong><span>Not signed up</span></div>
      <div><strong>{data.summary.unpaid}</strong><span>Unpaid</span></div>
      <div><strong>{data.summary.paid}</strong><span>Paid</span></div>
    </div>

    <form className="admin-record-filters" onSubmit={(event) => { event.preventDefault(); setPage(1); setQuery(queryInput.trim()); }}>
      <label className="admin-search-wide">Search students<div><Search size={17} /><input value={queryInput} onChange={(event) => setQueryInput(event.target.value)} placeholder="Name or Student ID" /><button className="btn-secondary">Search</button></div></label>
      <label>Status<select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">All statuses</option><option value="not_signed_up">Not signed up</option><option value="unpaid">Unpaid</option><option value="paid">Paid</option></select></label>
      {(query || status) ? <button type="button" className="btn-secondary" onClick={() => { setQueryInput(""); setQuery(""); setStatus(""); setPage(1); }}>Clear filters</button> : null}
    </form>

    {!isHistorical && selected.size ? <aside className="admin-bulk-toolbar">
      <strong>{selected.size} selected</strong>
      {(["not_signed_up", "unpaid", "paid"] as ExamStatus[]).map((value) => <button key={value} className="btn-secondary" onClick={() => setPending({ status: value, studentIds: [...selected] })}>{adminStatusLabel(value)}</button>)}
      <button className="text-link" onClick={() => setSelected(new Set())}>Clear selection</button>
    </aside> : null}

    {!data.selectedCycle && !loading ? <div className="admin-empty"><GraduationCap size={28} /><h3>No examination cycle yet</h3><p>Start the first cycle to create a fresh roster of all active students.</p></div> : <div className="admin-table-scroll"><table className="admin-record-table"><thead><tr>
      {!isHistorical ? <th><label className="admin-select-box"><input type="checkbox" aria-label="Select all visible students" checked={allVisibleSelected} onChange={(event) => setSelected(event.target.checked ? new Set(data.students.map((student) => student.student_id)) : new Set())} /><span aria-hidden="true" /></label></th> : null}
      <th>Student</th><th>Student ID</th><th>Current kyu</th><th>Requested kyu</th><th>Application date</th><th>Status</th>{!isHistorical ? <th>Actions</th> : null}
    </tr></thead><tbody>
      {data.students.map((student) => <tr key={student.student_id} className={selected.has(student.student_id) ? "is-selected" : ""}>
        {!isHistorical ? <td><label className="admin-select-box"><input type="checkbox" aria-label={`Select ${student.student_name}`} checked={selected.has(student.student_id)} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(student.student_id); else next.delete(student.student_id); return next; })} /><span aria-hidden="true" /></label></td> : null}
        <th><span className="admin-student-identity">{student.profile_image_url ? <img src={student.profile_image_url} alt="" /> : <span aria-hidden="true"><UserRound size={18} /></span>}<span>{student.student_name}</span></span></th>
        <td><code>{student.public_student_id}</code></td><td>{student.current_rank}</td><td>{student.requested_rank || "—"}</td><td>{formatAdminDate(student.application_date)}</td><td><Status value={student.status} /></td>
        {!isHistorical ? <td><select aria-label={`Set examination status for ${student.student_name}`} value={student.status} onChange={(event) => setPending({ status: event.target.value as ExamStatus, studentIds: [student.student_id] })}>{(["not_signed_up", "unpaid", "paid"] as ExamStatus[]).map((value) => <option key={value} value={value}>{adminStatusLabel(value)}</option>)}</select></td> : null}
      </tr>)}
      {!data.students.length && !loading ? <tr><td colSpan={isHistorical ? 7 : 8}><div className="admin-empty-inline">No students match these filters.</div></td></tr> : null}
    </tbody></table></div>}

    <footer className="admin-pagination"><span>{data.pagination.total} record{data.pagination.total === 1 ? "" : "s"}</span><div><button className="btn-secondary" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft size={16} /> Previous</button><span>Page {data.pagination.page} of {data.pagination.totalPages}</span><button className="btn-secondary" disabled={page >= data.pagination.totalPages || loading} onClick={() => setPage((value) => value + 1)}>Next <ChevronRight size={16} /></button></div></footer>
    {loading ? <div className="admin-loading-overlay"><LoaderCircle className="spin" /><span>Loading cycle</span></div> : null}

    {pending ? <div className="admin-confirm-backdrop" role="presentation"><section className="admin-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="exam-status-title">
      <header><div><p className="eyebrow">Confirm status change</p><h2 id="exam-status-title">Mark {pending.studentIds.length} student{pending.studentIds.length === 1 ? "" : "s"} {adminStatusLabel(pending.status).toLowerCase()}?</h2></div><button aria-label="Close" onClick={() => setPending(null)}><X /></button></header>
      <p>This will update the current cycle and add a permanent audit entry. It will not change historical cycles.</p>
      {pending.studentIds.length <= 5 ? <ul>{selectionNames.filter((student) => pending.studentIds.includes(student.student_id)).map((student) => <li key={student.student_id}>{student.student_name} · {student.public_student_id}</li>)}</ul> : null}
      <footer><button className="btn-secondary" onClick={() => setPending(null)}>Cancel</button><button className="btn-primary" disabled={saving} onClick={() => void updateStatus()}>{saving ? <LoaderCircle className="spin" size={16} /> : <CheckCircle2 size={16} />} Confirm status change</button></footer>
    </section></div> : null}

    {cycleDialog ? <div className="admin-confirm-backdrop" role="presentation"><section className="admin-confirm-dialog admin-confirm-dialog--danger" role="dialog" aria-modal="true" aria-labelledby="new-cycle-title">
      <header><div><p className="eyebrow">{editingCycle ? "Central cycle settings" : "Strong confirmation required"}</p><h2 id="new-cycle-title">{editingCycle ? "Edit examination cycle" : "Start a new examination cycle"}</h2></div><button aria-label="Close" onClick={() => setCycleDialog(false)}><X /></button></header>
      {!editingCycle ? <div className="admin-warning-block"><AlertTriangle size={20} /><p><strong>The current cycle will close permanently.</strong> It will remain available as read-only history. Every active student in the new cycle will begin as “Not signed up.”</p></div> : null}
      <form className="admin-bulk-form" onSubmit={startCycle}>
        <label>Cycle title<input value={cycleName} onChange={(event) => setCycleName(event.target.value)} maxLength={120} placeholder="August 2026 Examination" required autoFocus /></label>
        <label>Examination type<input value={cycleForm.examinationType} onChange={(event) => setCycleForm({ ...cycleForm, examinationType: event.target.value })} maxLength={80} /></label>
        <label>Rank category<select value={cycleForm.rankCategory} onChange={(event) => setCycleForm({ ...cycleForm, rankCategory: event.target.value })}><option>Kyu and Dan</option><option>Kyu</option><option>Dan</option></select></label>
        {editingCycle ? <label>Application state<select value={cycleForm.lifecycleStatus} onChange={(event) => setCycleForm({ ...cycleForm, lifecycleStatus: event.target.value })}><option value="draft">Draft</option><option value="open">Open</option><option value="closed">Closed</option><option value="completed">Completed</option><option value="archived">Archived</option></select></label> : null}
        <label>Applications open<input type="datetime-local" value={cycleForm.applicationOpensAt} onChange={(event) => setCycleForm({ ...cycleForm, applicationOpensAt: event.target.value })} /></label>
        <label>Applications close<input type="datetime-local" value={cycleForm.applicationClosesAt} onChange={(event) => setCycleForm({ ...cycleForm, applicationClosesAt: event.target.value })} /></label>
        <label>Examination date and time<input type="datetime-local" value={cycleForm.examinationAt} onChange={(event) => setCycleForm({ ...cycleForm, examinationAt: event.target.value })} /></label>
        <label>Venue<input value={cycleForm.venue} onChange={(event) => setCycleForm({ ...cycleForm, venue: event.target.value })} maxLength={240} /></label>
        <label>Instructions<textarea value={cycleForm.instructions} onChange={(event) => setCycleForm({ ...cycleForm, instructions: event.target.value })} maxLength={4000} /></label>
        <label>Default Kyu examination fee (THB)<input type="number" min="0" max="1000000" step="0.01" value={cycleForm.kyuExamFee} onChange={(event) => setCycleForm({ ...cycleForm, kyuExamFee: event.target.value })} /></label>
        <label>Default Dan examination fee (THB)<input type="number" min="0" max="1000000" step="0.01" value={cycleForm.danExamFee} onChange={(event) => setCycleForm({ ...cycleForm, danExamFee: event.target.value })} /></label>
        <label>AAT annual fee (THB)<input type="number" min="0" max="1000000" step="0.01" value={cycleForm.aatAnnualFee} onChange={(event) => setCycleForm({ ...cycleForm, aatAnnualFee: event.target.value })} /></label>
        <p className="admin-help">These defaults are saved with this cycle, so future fee changes do not alter past examination records.</p>
        <footer><button type="button" className="btn-secondary" onClick={() => setCycleDialog(false)}>Cancel</button><button className="btn-primary" disabled={saving || !cycleName.trim()}>{saving ? <LoaderCircle className="spin" size={16} /> : <GraduationCap size={16} />} {editingCycle ? "Save cycle" : "Close current cycle and start new"}</button></footer>
      </form>
    </section></div> : null}
  </section>;
}
