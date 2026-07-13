import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle, Archive, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Eye, GraduationCap,
  History, LoaderCircle, Lock, LogOut, Plus, RotateCcw, Save, Search, ShieldCheck, UserRound, Users, X,
} from "lucide-react";
import { Link } from "react-router-dom";
import { RANKS } from "../../shared/ranks";
import { BeltMark } from "../components/BeltMark";

type StudentSummary = {
  id: string; public_student_id: string; display_name: string; current_belt: string; profile_image_url: string | null;
  active: number; dojo_name: string; updated_at: string; profile_status: string; total_hours: number;
  examination_status: string; payment_status: string; pending_hours: number; sharing_active: number;
};
type Student = StudentSummary & {
  belt_color: string; profile_image_consent: number; guardian_consent: number; public_visible: number; admin_notes: string;
  practice_duration: string; profile_bio: string; pending_profile_image_url?: string; profile_review_note: string;
};
type Examination = { id: string; rank_before: string; rank_attempted: string; passed: number; examination_location: string; rank_after: string; examination_timestamp: string };
type TrainingHour = { id: string; verified_hours: number; source: string; created_at: string };
type HourRequest = { id: string; submitted_hours: number; previous_total: number; requested_total: number; status: string; submitted_at: string; review_note?: string };
type Application = {
  id: string; status: string; payment_status: string; attempted_rank: string; current_rank: string; submitted_at: string;
  administrator_notes: string; cycle_name: string; answers: Record<string, string>; history: Array<Record<string, string>>;
};
type Detail = { student: Student; examinations: Examination[]; trainingHours: TrainingHour[]; hourRequests: HourRequest[]; applications: Application[] };
type ListResponse = {
  students: StudentSummary[]; pagination: { page: number; pageSize: number; total: number; totalPages: number };
  summary: { total: number; active: number; archived: number; pending_profiles: number }; ranks: string[]; suggestedStudentId: string;
};
type BulkDraft = { type: "hours" | "promotion"; hours: string; levels: string; location: string; preview: boolean };

const EMPTY_PAGE = { page: 1, pageSize: 20, total: 0, totalPages: 1 };
const EMPTY_SUMMARY = { total: 0, active: 0, archived: 0, pending_profiles: 0 };

async function api<T>(url: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (options.method && options.method !== "GET") headers.set("X-Request-ID", crypto.randomUUID());
  const response = await fetch(url, { ...options, headers, credentials: "include", cache: "no-store" });
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error || "The request could not be completed.");
  return body;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function label(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function Status({ value }: { value: string }) {
  const tone = value.includes("pending") || value === "application_submitted" ? "is-pending" : value === "approved" || value === "paid" || value === "examination_completed" ? "is-active" : value === "rejected" ? "is-error" : "is-neutral";
  return <span className={`admin-status ${tone}`}>{label(value === "none" ? "No current application" : value === "not_applicable" ? "—" : value)}</span>;
}

export function AdminStudentsPage() {
  const [checked, setChecked] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [pagination, setPagination] = useState(EMPTY_PAGE);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [suggestedId, setSuggestedId] = useState("RSK-0001");
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [rank, setRank] = useState("");
  const [profileStatus, setProfileStatus] = useState(() => new URLSearchParams(window.location.search).get("profileStatus") || "");
  const [examinationStatus, setExaminationStatus] = useState(() => new URLSearchParams(window.location.search).get("examinationStatus") || "");
  const [paymentStatus, setPaymentStatus] = useState(() => new URLSearchParams(window.location.search).get("paymentStatus") || "");
  const [status, setStatus] = useState("active");
  const [sort, setSort] = useState("name");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [hoursEdit, setHoursEdit] = useState<{ id: string; value: string; previous: number } | null>(null);
  const [rowBusy, setRowBusy] = useState("");
  const [bulk, setBulk] = useState<BulkDraft | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetStep, setResetStep] = useState(1);
  const [resetPhrase, setResetPhrase] = useState("");
  const [resetCount, setResetCount] = useState(0);
  const skipHoursBlur = useRef(false);

  const filtersActive = Boolean(query || rank || profileStatus || examinationStatus || paymentStatus || status !== "active");
  const selectedRows = useMemo(() => students.filter((student) => selected.has(student.id)), [students, selected]);

  async function load(targetPage = page) {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ page: String(targetPage), pageSize: "20", sort, status });
      if (query) params.set("query", query);
      if (rank) params.set("rank", rank);
      if (profileStatus) params.set("profileStatus", profileStatus);
      if (examinationStatus) params.set("examinationStatus", examinationStatus);
      if (paymentStatus) params.set("paymentStatus", paymentStatus);
      const body = await api<ListResponse>(`/api/admin/students?${params}`);
      setStudents(body.students); setPagination(body.pagination); setSummary(body.summary); setSuggestedId(body.suggestedStudentId);
      setSelected((current) => new Set([...current].filter((id) => body.students.some((student) => student.id === id))));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load students."); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    api<{ authenticated: boolean }>("/api/admin/session").then((body) => setAuthed(body.authenticated)).catch(() => setAuthed(false)).finally(() => setChecked(true));
  }, []);
  useEffect(() => { if (authed) void load(page); }, [authed, page, query, rank, profileStatus, examinationStatus, paymentStatus, status, sort]);

  async function login(event: FormEvent) {
    event.preventDefault(); setError("");
    try { await api("/api/admin/login", { method: "POST", body: JSON.stringify({ password }) }); setPassword(""); setAuthed(true); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Sign in failed."); }
  }

  async function logout() { await api("/api/admin/logout", { method: "POST" }); setAuthed(false); setStudents([]); }

  function clearFilters() {
    setQueryInput(""); setQuery(""); setRank(""); setProfileStatus(""); setExaminationStatus(""); setPaymentStatus(""); setStatus("active"); setPage(1);
  }

  async function openStudent(id: string) {
    setDetail(null); setDetailLoading(true); setError("");
    try { setDetail(await api<Detail>(`/api/admin/students/${id}`)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not open the student."); }
    finally { setDetailLoading(false); }
  }

  function patchRow(id: string, patch: Partial<StudentSummary>) {
    setStudents((current) => current.map((student) => student.id === id ? { ...student, ...patch } : student));
  }

  async function saveHoursEdit(edit = hoursEdit) {
    if (!edit) return;
    const value = Number(edit.value);
    if (!Number.isFinite(value) || value < 0) { setError("Training hours must be zero or a positive number."); setHoursEdit(null); return; }
    if (value === edit.previous) { setHoursEdit(null); return; }
    setRowBusy(edit.id); setError("");
    try {
      await api(`/api/admin/students/${edit.id}/inline`, { method: "PATCH", body: JSON.stringify({ field: "total_hours", value }) });
      patchRow(edit.id, { total_hours: value, updated_at: new Date().toISOString() }); setNotice("Training hours saved."); setHoursEdit(null);
    } catch (reason) { patchRow(edit.id, { total_hours: edit.previous }); setHoursEdit(null); setError(reason instanceof Error ? reason.message : "Hours were restored because saving failed."); }
    finally { setRowBusy(""); }
  }

  async function saveRank(student: StudentSummary, value: string) {
    if (value === student.current_belt) return;
    const previous = student.current_belt; setRowBusy(student.id); patchRow(student.id, { current_belt: value });
    try { await api(`/api/admin/students/${student.id}/inline`, { method: "PATCH", body: JSON.stringify({ field: "current_rank", value }) }); setNotice("Rank saved."); }
    catch (reason) { patchRow(student.id, { current_belt: previous }); setError(reason instanceof Error ? reason.message : "Rank was restored because saving failed."); }
    finally { setRowBusy(""); }
  }

  async function archive(student: StudentSummary) {
    setRowBusy(student.id);
    try { await api(`/api/admin/students/${student.id}`, { method: "DELETE" }); setNotice(`${student.display_name} was archived. Historical data remains intact.`); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not archive the student."); }
    finally { setRowBusy(""); }
  }

  async function runBulk() {
    if (!bulk || !bulk.preview) return;
    setLoading(true); setError("");
    try {
      const body = bulk.type === "hours"
        ? { action: "add_hours", studentIds: [...selected], hours: Number(bulk.hours) }
        : { action: "mass_promotion", studentIds: [...selected], levels: Number(bulk.levels), location: bulk.location };
      await api("/api/admin/students/bulk", { method: "POST", body: JSON.stringify(body) });
      setNotice(`${selected.size} student${selected.size === 1 ? "" : "s"} updated in one audited operation.`); setBulk(null); setSelected(new Set()); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The bulk operation failed without applying a partial batch."); }
    finally { setLoading(false); }
  }

  async function openReset() {
    try { const body = await api<{ affectedStudents: number }>("/api/admin/examination/reset"); setResetCount(body.affectedStudents); setResetStep(1); setResetPhrase(""); setResetOpen(true); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load reset details."); }
  }

  async function runReset() {
    try {
      await api("/api/admin/examination/reset", { method: "POST", body: JSON.stringify({ confirmed: true, phrase: resetPhrase }) });
      setResetOpen(false); setNotice(`The examination cycle was closed for ${resetCount} student${resetCount === 1 ? "" : "s"}; all history was preserved.`); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Reset failed."); }
  }

  if (!checked) return <div className="admin-gate"><LoaderCircle className="spin" /><p>Checking administrator session…</p></div>;
  if (!authed) return <section className="container-shell student-admin"><form className="admin-login-card" onSubmit={login}><Lock size={30} /><p className="eyebrow">Administrator access</p><h1>Student records</h1><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>{error ? <p className="form-error">{error}</p> : null}<button className="btn-primary"><ShieldCheck size={17} /> Sign in</button></form></section>;

  return <section className="container-shell student-admin student-admin--table">
    <header className="student-admin__header"><div><p className="eyebrow">Administrator workspace</p><h1>Student records</h1><p>Inline edits, approvals, examinations, and bulk updates—all changes are audited.</p></div><div className="admin-header-actions"><Link className="btn-secondary" to="/admin"><ChevronLeft size={16} /> Content dashboard</Link><Link className="btn-secondary" to="/admin/audit"><History size={16} /> Audit log</Link><button className="btn-secondary" onClick={openReset}><RotateCcw size={16} /> Reset exam cycle</button><button className="btn-primary" onClick={() => setCreateOpen(true)}><Plus size={16} /> Add student</button><button className="btn-secondary" onClick={logout}><LogOut size={16} /> Sign out</button></div></header>
    <div className="admin-summary"><div><strong>{summary.active}</strong><span>Active students</span></div><div><strong>{summary.pending_profiles}</strong><span>Pending profiles</span></div><div><strong>{summary.archived}</strong><span>Archived records</span></div></div>
    {notice ? <div className="admin-notice"><CheckCircle2 size={18} /><span>{notice}</span><button onClick={() => setNotice("")}><X size={15} /></button></div> : null}
    {error ? <div className="admin-page-error" role="alert"><AlertCircle size={18} /><span>{error}</span><button onClick={() => setError("")}><X size={15} /></button></div> : null}

    <form className="admin-student-controls admin-student-controls--workflow" onSubmit={(event) => { event.preventDefault(); setPage(1); setQuery(queryInput.trim()); }}>
      <label className="admin-search-wide">Search by name or ID<div><Search size={17} /><input value={queryInput} onChange={(event) => setQueryInput(event.target.value)} placeholder="Name or RSK-0001" /><button className="btn-secondary">Search</button></div></label>
      <label>Current kyu<select value={rank} onChange={(event) => { setRank(event.target.value); setPage(1); }}><option value="">All ranks</option>{RANKS.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>Profile<select value={profileStatus} onChange={(event) => { setProfileStatus(event.target.value); setPage(1); }}><option value="">All profiles</option><option value="pending_admin_approval">Pending approval</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></label>
      <label>Examination<select value={examinationStatus} onChange={(event) => { setExaminationStatus(event.target.value); setPage(1); }}><option value="">All exam states</option><option value="none">No current application</option><option value="application_submitted">Application submitted</option><option value="examination_completed">Completed</option></select></label>
      <label>Payment<select value={paymentStatus} onChange={(event) => { setPaymentStatus(event.target.value); setPage(1); }}><option value="">All payment states</option><option value="payment_pending">Payment pending</option><option value="paid">Paid</option><option value="not_applicable">Not applicable</option></select></label>
      <label>Record status<select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="active">Active</option><option value="archived">Archived</option><option value="all">All</option></select></label>
      <label>Sort<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="name">Name</option><option value="studentId">Student ID</option><option value="trainingHours">Training hours</option><option value="updated">Last updated</option></select></label>
      <button type="button" className="btn-secondary admin-clear" disabled={!filtersActive} onClick={clearFilters}>{filtersActive ? "Reset active filters" : "No active filters"}</button>
    </form>

    {selected.size ? <aside className="admin-bulk-toolbar"><strong><Users size={17} /> {selected.size} selected</strong><button className="btn-secondary" onClick={() => setBulk({ type: "hours", hours: "", levels: "", location: "", preview: false })}><Clock3 size={16} /> Add hours</button><button className="btn-secondary" onClick={() => setBulk({ type: "promotion", hours: "", levels: "1", location: "", preview: false })}><GraduationCap size={16} /> Mass promotion</button><button className="text-link" onClick={() => setSelected(new Set())}>Clear selection</button></aside> : null}

    <section className="admin-table-section" aria-busy={loading}><div className="admin-table-meta"><p>{pagination.total} student{pagination.total === 1 ? "" : "s"}{filtersActive ? " · filters active" : ""}</p>{loading ? <span><LoaderCircle className="spin" size={15} /> Loading</span> : null}</div><div className="admin-table-scroll"><table className="admin-student-table admin-student-table--workflow"><thead><tr>
      <th><input type="checkbox" aria-label="Select all visible students" checked={students.length > 0 && students.every((student) => selected.has(student.id))} onChange={(event) => setSelected(event.target.checked ? new Set(students.map((student) => student.id)) : new Set())} /></th>
      <th>Student</th><th>ID</th><th>Profile</th><th>Current kyu</th><th>Total hours</th><th>Examination</th><th>Payment</th><th>Updated</th><th>Actions</th>
    </tr></thead><tbody>{students.map((student) => <tr key={student.id} className={selected.has(student.id) ? "is-selected" : ""}>
      <td><input type="checkbox" aria-label={`Select ${student.display_name}`} checked={selected.has(student.id)} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(student.id); else next.delete(student.id); return next; })} /></td>
      <th>{student.display_name}{student.pending_hours ? <small>{student.pending_hours} hours request pending</small> : null}</th><td><code>{student.public_student_id}</code></td><td><Status value={student.profile_status} /></td>
      <td><select className="admin-inline-rank" aria-label={`Current rank for ${student.display_name}`} value={student.current_belt} disabled={rowBusy === student.id} onWheel={(event) => event.currentTarget.blur()} onChange={(event) => void saveRank(student, event.target.value)}>{RANKS.map((item) => <option key={item}>{item}</option>)}</select>{rowBusy === student.id ? <LoaderCircle className="spin admin-inline-spinner" size={13} /> : null}</td>
      <td>{hoursEdit?.id === student.id ? <span className="admin-inline-hours"><input autoFocus type="number" min="0" step="0.25" value={hoursEdit.value} onChange={(event) => setHoursEdit({ ...hoursEdit, value: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); skipHoursBlur.current = true; void saveHoursEdit(); } if (event.key === "Escape") { skipHoursBlur.current = true; setHoursEdit(null); } }} onBlur={() => { if (skipHoursBlur.current) { skipHoursBlur.current = false; return; } void saveHoursEdit(); }} /><button aria-label="Save hours" onMouseDown={(event) => event.preventDefault()} onClick={() => void saveHoursEdit()}><Save size={14} /></button></span> : <button className="admin-hours-value" onClick={() => setHoursEdit({ id: student.id, value: String(Number(student.total_hours || 0)), previous: Number(student.total_hours || 0) })}>{Number(student.total_hours || 0).toLocaleString()} hr</button>}</td>
      <td><Status value={student.examination_status} /></td><td><Status value={student.payment_status} /></td><td>{formatDate(student.updated_at)}</td><td><div className="admin-row-actions"><button onClick={() => void openStudent(student.id)}><Eye size={14} /> Open</button>{student.active ? <button onClick={() => void archive(student)}><Archive size={14} /> Archive</button> : null}</div></td>
    </tr>)}</tbody></table></div>{!loading && students.length === 0 ? <div className="admin-empty"><UserRound size={32} /><h2>No students found</h2><p>Try resetting the active filters or add a new student.</p></div> : null}
      <nav className="admin-pagination"><button className="btn-secondary" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={16} /> Previous</button><span>Page {pagination.page} of {pagination.totalPages}</span><button className="btn-secondary" disabled={page >= pagination.totalPages} onClick={() => setPage((value) => value + 1)}>Next <ChevronRight size={16} /></button></nav>
    </section>

    {(detailLoading || detail) ? <StudentDrawer detail={detail} loading={detailLoading} close={() => setDetail(null)} refresh={async () => { if (detail) await openStudent(detail.student.id); await load(); }} report={(message, isError = false) => isError ? setError(message) : setNotice(message)} /> : null}
    {bulk ? <BulkModal bulk={bulk} setBulk={setBulk} students={selectedRows} close={() => setBulk(null)} confirm={() => void runBulk()} busy={loading} /> : null}
    {createOpen ? <CreateStudentModal suggestedId={suggestedId} close={() => setCreateOpen(false)} complete={async (message) => { setCreateOpen(false); setNotice(message); await load(1); }} report={setError} /> : null}
    {resetOpen ? <div className="admin-confirm-backdrop"><section className="admin-confirm"><RotateCcw /><h2>{resetStep === 1 ? "Close the current exam cycle?" : "Type the confirmation phrase"}</h2>{resetStep === 1 ? <><p>This returns <strong>{resetCount} student{resetCount === 1 ? "" : "s"}</strong> to “No current application.” It archives statuses only; applications, answers, payment records, examinations, students, and audit history remain available.</p><div><button className="btn-secondary" onClick={() => setResetOpen(false)}>Cancel</button><button className="btn-primary is-danger" onClick={() => setResetStep(2)}>Continue</button></div></> : <><label className="admin-confirm-phrase">Enter <strong>RESET EXAM STATUS</strong><input value={resetPhrase} onChange={(event) => setResetPhrase(event.target.value)} autoFocus /></label><div><button className="btn-secondary" onClick={() => setResetStep(1)}>Back</button><button className="btn-primary is-danger" disabled={resetPhrase !== "RESET EXAM STATUS"} onClick={() => void runReset()}>Reset statuses</button></div></>}</section></div> : null}
  </section>;
}

function BulkModal({ bulk, setBulk, students, close, confirm, busy }: { bulk: BulkDraft; setBulk: (value: BulkDraft) => void; students: StudentSummary[]; close: () => void; confirm: () => void; busy: boolean }) {
  const hours = Number(bulk.hours); const levels = Number(bulk.levels);
  const valid = bulk.type === "hours" ? Number.isFinite(hours) && hours > 0 : Number.isInteger(levels) && levels > 0 && Boolean(bulk.location.trim());
  return <div className="admin-confirm-backdrop"><section className="admin-bulk-modal"><header><div><p className="eyebrow">Bulk action</p><h2>{bulk.type === "hours" ? "Add training hours" : "Record mass promotion"}</h2></div><button onClick={close}><X /></button></header>{!bulk.preview ? <div className="admin-bulk-form">{bulk.type === "hours" ? <label>Hours to add to each student<input type="number" min="0.25" step="0.25" value={bulk.hours} onChange={(event) => setBulk({ ...bulk, hours: event.target.value })} autoFocus /></label> : <><label>Examination location<input value={bulk.location} onChange={(event) => setBulk({ ...bulk, location: event.target.value })} autoFocus /></label><label>Rank levels promoted<input type="number" min="1" step="1" value={bulk.levels} onChange={(event) => setBulk({ ...bulk, levels: event.target.value })} /></label></>}<p>{students.length} selected student{students.length === 1 ? "" : "s"}</p><footer><button className="btn-secondary" onClick={close}>Cancel</button><button className="btn-primary" disabled={!valid} onClick={() => setBulk({ ...bulk, preview: true })}>Review changes</button></footer></div> : <div className="admin-bulk-preview"><p>Confirm this single atomic operation. Every student receives an individual audit entry sharing one bulk-operation ID.</p><table><thead><tr><th>Student</th><th>Current</th><th>Change</th><th>Result</th></tr></thead><tbody>{students.map((student) => <tr key={student.id}><td>{student.display_name}</td><td>{bulk.type === "hours" ? `${student.total_hours} hr` : student.current_belt}</td><td>{bulk.type === "hours" ? `+${hours} hr` : `+${levels} level${levels === 1 ? "" : "s"}`}</td><td>{bulk.type === "hours" ? `${Number(student.total_hours) + hours} hr` : "Validated by official progression on save"}</td></tr>)}</tbody></table><footer><button className="btn-secondary" onClick={() => setBulk({ ...bulk, preview: false })}>Back</button><button className="btn-primary" disabled={busy} onClick={confirm}>{busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />} Confirm {students.length} updates</button></footer></div>}</section></div>;
}

function CreateStudentModal({ suggestedId, close, complete, report }: { suggestedId: string; close: () => void; complete: (message: string) => void; report: (message: string) => void }) {
  const [draft, setDraft] = useState({ name: "", studentId: suggestedId, rank: "Unranked", hours: "0", pin: "", notes: "" }); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); try { const result = await api<{ studentId: string }>("/api/admin/students", { method: "POST", body: JSON.stringify({ displayName: draft.name, studentId: draft.studentId, manualStudentId: draft.studentId !== suggestedId, currentBelt: draft.rank, currentTrainingHours: Number(draft.hours), studentPin: draft.pin || undefined, adminNotes: draft.notes }) }); await complete(`Created ${result.studentId}.`); } catch (reason) { report(reason instanceof Error ? reason.message : "Could not create student."); } finally { setBusy(false); } }
  return <div className="admin-confirm-backdrop"><section className="admin-bulk-modal"><header><div><p className="eyebrow">Official profile</p><h2>Add student</h2></div><button onClick={close}><X /></button></header><form className="admin-bulk-form" onSubmit={submit}><label>Name<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /></label><label>Student ID<input value={draft.studentId} onChange={(event) => setDraft({ ...draft, studentId: event.target.value.toUpperCase() })} required /></label><label>Current kyu<select value={draft.rank} onChange={(event) => setDraft({ ...draft, rank: event.target.value })}>{RANKS.map((item) => <option key={item}>{item}</option>)}</select></label><label>Current total hours<input type="number" min="0" step="0.25" value={draft.hours} onChange={(event) => setDraft({ ...draft, hours: event.target.value })} /></label><label>Student PIN <small>Optional now; 6–12 digits enables verified self-service.</small><input type="password" inputMode="numeric" pattern="[0-9]{6,12}" value={draft.pin} onChange={(event) => setDraft({ ...draft, pin: event.target.value })} /></label><label>Administrator note<textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label><footer><button type="button" className="btn-secondary" onClick={close}>Cancel</button><button className="btn-primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />} Create student</button></footer></form></section></div>;
}

function StudentDrawer({ detail, loading, close, refresh, report }: { detail: Detail | null; loading: boolean; close: () => void; refresh: () => Promise<void>; report: (message: string, error?: boolean) => void }) {
  const [hours, setHours] = useState(""); const [exam, setExam] = useState({ current: "", attempted: "", passed: true, location: "" }); const [reviewNote, setReviewNote] = useState(""); const [busy, setBusy] = useState(false); const [applicationNote, setApplicationNote] = useState("");
  useEffect(() => { if (detail) setExam((value) => ({ ...value, current: detail.student.current_belt, attempted: RANKS[Math.min(RANKS.length - 1, Math.max(1, RANKS.indexOf(detail.student.current_belt as (typeof RANKS)[number]) + 1))] })); }, [detail?.student.id, detail?.student.current_belt]);
  async function mutate(path: string, body: Record<string, unknown>, success: string) { if (!detail) return; setBusy(true); try { await api(path, { method: "POST", body: JSON.stringify(body) }); report(success); await refresh(); } catch (reason) { report(reason instanceof Error ? reason.message : "The change could not be saved.", true); } finally { setBusy(false); } }
  if (loading || !detail) return <div className="admin-drawer-backdrop"><section className="admin-drawer"><header><h2>Student record</h2><button onClick={close}><X /></button></header><div className="admin-drawer-loading"><LoaderCircle className="spin" /> Loading complete record…</div></section></div>;
  const student = detail.student; const currentApp = detail.applications[0]; const pendingRequests = detail.hourRequests.filter((request) => request.status === "pending");
  return <div className="admin-drawer-backdrop"><section className="admin-drawer admin-drawer--workflow"><header><div><p className="eyebrow">Student workspace</p><h2>{student.display_name}</h2><p><code>{student.public_student_id}</code> · <BeltMark rank={student.current_belt} /> {student.current_belt}</p></div><button className="admin-icon-button" onClick={close}><X /></button></header><div className="admin-drawer__body">
    <div className="admin-profile-review"><div>{student.pending_profile_image_url ? <img src={student.pending_profile_image_url} alt="Pending profile" /> : student.profile_image_url ? <img src={student.profile_image_url} alt="Profile" /> : <UserRound />}</div><dl><div><dt>Profile</dt><dd><Status value={student.profile_status} /></dd></div><div><dt>Total hours</dt><dd>{Number(student.total_hours).toLocaleString()} hr</dd></div><div><dt>Practice duration</dt><dd>{student.practice_duration || "Not supplied"}</dd></div><div><dt>Profile information</dt><dd>{student.profile_bio || "Not supplied"}</dd></div></dl></div>
    <StudentDetailsEditor student={student} refresh={refresh} report={report} />
    {student.profile_status === "pending_admin_approval" ? <section className="admin-workflow-card"><h3>Review profile request</h3><p>Pending profiles remain inactive and private until approval.</p><label>Internal review note<textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} /></label><div><button className="btn-primary" disabled={busy} onClick={() => void mutate(`/api/admin/students/${student.id}/profile-status`, { action: "approve", note: reviewNote }, "Profile approved and public QR activated.")}><Check size={16} /> Approve</button><button className="btn-secondary is-danger" disabled={busy || !reviewNote.trim()} onClick={() => void mutate(`/api/admin/students/${student.id}/profile-status`, { action: "reject", note: reviewNote }, "Profile rejected; the private history was retained.")}>Reject</button></div></section> : null}
    <div className="admin-record-entry-grid"><section className="admin-workflow-card"><h3><Clock3 size={18} /> Add training hours</h3><label>Number of hours to add<input type="number" min="0.25" step="0.25" value={hours} onChange={(event) => setHours(event.target.value)} /></label><dl className="admin-preview-math"><div><dt>Current</dt><dd>{student.total_hours} hr</dd></div><div><dt>Add</dt><dd>{Number(hours || 0)} hr</dd></div><div><dt>Result</dt><dd>{Number(student.total_hours) + Number(hours || 0)} hr</dd></div></dl><button className="btn-primary" disabled={busy || !(Number(hours) > 0)} onClick={() => void mutate(`/api/admin/students/${student.id}/hours`, { hours: Number(hours) }, "Training hours added.")}>Add hours</button></section>
      <section className="admin-workflow-card"><h3><GraduationCap size={18} /> Record examination</h3><label>Current kyu<select value={exam.current} onChange={(event) => setExam({ ...exam, current: event.target.value })}>{RANKS.map((item) => <option key={item}>{item}</option>)}</select></label><label>Attempting<select value={exam.attempted} onChange={(event) => setExam({ ...exam, attempted: event.target.value })}>{RANKS.map((item) => <option key={item}>{item}</option>)}</select></label><label>Did they pass?<select value={exam.passed ? "yes" : "no"} onChange={(event) => setExam({ ...exam, passed: event.target.value === "yes" })}><option value="yes">Yes</option><option value="no">No</option></select></label><label>Examination location<input value={exam.location} onChange={(event) => setExam({ ...exam, location: event.target.value })} /></label><button className="btn-primary" disabled={busy || !exam.location.trim()} onClick={() => void mutate(`/api/admin/students/${student.id}/exam`, { currentRank: exam.current, attemptedRank: exam.attempted, passed: exam.passed, location: exam.location }, `Examination ${exam.passed ? "pass" : "attempt"} recorded.`)}>Record examination</button></section></div>
    {pendingRequests.length ? <section className="admin-workflow-card"><h3>Student-submitted training hours</h3>{pendingRequests.map((request) => <article className="admin-request-row" key={request.id}><div><strong>+{request.submitted_hours} hours</strong><span>{formatDate(request.submitted_at)} · pending review</span><small>{request.previous_total} → {request.requested_total} hours requested</small></div><div><button className="btn-primary" onClick={() => void mutate(`/api/admin/students/${student.id}/hours-requests`, { hourRequestId: request.id, action: "approve" }, "Student hours approved.")}>Approve</button><button className="btn-secondary is-danger" onClick={() => void mutate(`/api/admin/students/${student.id}/hours-requests`, { hourRequestId: request.id, action: "reject" }, "Student hours rejected.")}>Reject</button></div></article>)}</section> : null}
    {currentApp ? <section className="admin-workflow-card admin-application"><header><div><h3>Examination application</h3><p>{currentApp.cycle_name} · submitted {formatDate(currentApp.submitted_at)}</p></div><Status value={currentApp.payment_status} /></header><dl className="admin-detail-grid"><div><dt>Current rank</dt><dd>{currentApp.current_rank}</dd></div><div><dt>Attempting</dt><dd>{currentApp.attempted_rank}</dd></div><div><dt>Status</dt><dd><Status value={currentApp.status} /></dd></div><div><dt>Payment</dt><dd><Status value={currentApp.payment_status} /></dd></div></dl><details><summary>View every PDF questionnaire answer</summary><dl className="admin-answer-list">{Object.entries(currentApp.answers).map(([key, value]) => <div key={key}><dt>{label(key)}</dt><dd>{value || "—"}</dd></div>)}</dl></details><label>Administrator note<textarea value={applicationNote || currentApp.administrator_notes} onChange={(event) => setApplicationNote(event.target.value)} /></label><div className="admin-inline-actions">{currentApp.payment_status === "paid" ? <button className="btn-secondary is-danger" onClick={() => { if (window.confirm("Reverse this payment confirmation? The reversal will be logged.")) void mutate(`/api/admin/students/${student.id}/application`, { applicationId: currentApp.id, action: "reverse_payment", confirmed: true }, "Payment confirmation reversed."); }}>Undo payment confirmation</button> : <button className="btn-primary" onClick={() => void mutate(`/api/admin/students/${student.id}/application`, { applicationId: currentApp.id, action: "mark_paid" }, "Payment confirmed.")}>Mark paid</button>}<button className="btn-secondary" onClick={() => void mutate(`/api/admin/students/${student.id}/application`, { applicationId: currentApp.id, action: "update_note", note: applicationNote || currentApp.administrator_notes }, "Administrator note saved.")}>Save note</button></div>{currentApp.history?.length ? <details><summary>Status and payment history</summary><ol className="admin-status-history">{currentApp.history.map((entry, index) => <li key={String(entry.id || index)}>{formatDate(String(entry.createdAt))} · {label(String(entry.newStatus || entry.newPaymentStatus || "updated"))}</li>)}</ol></details> : null}</section> : null}
    <section className="admin-history-grid"><section><h3>Training history</h3>{detail.trainingHours.length ? <ol>{detail.trainingHours.map((entry) => <li key={entry.id}><strong>+{entry.verified_hours} hours</strong><time>{formatDate(entry.created_at)}</time><span>{label(entry.source)}</span></li>)}</ol> : <p>No entries yet.</p>}</section><section><h3>Examination history</h3>{detail.examinations.length ? <ol>{detail.examinations.map((entry) => <li key={entry.id}><strong>{entry.rank_before ? `${entry.rank_before} → ` : ""}{entry.rank_after || entry.rank_attempted}</strong><time>{formatDate(entry.examination_timestamp)}</time><span>{entry.passed ? "Passed" : "Did not pass"}{entry.examination_location ? ` · ${entry.examination_location}` : ""}</span></li>)}</ol> : <p>No examinations yet.</p>}</section></section>
  </div></section></div>;
}

function StudentDetailsEditor({ student, refresh, report }: { student: Student; refresh: () => Promise<void>; report: (message: string, error?: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ name: student.display_name, studentId: student.public_student_id, rank: student.current_belt, practiceDuration: student.practice_duration || "", profileBio: student.profile_bio || "", notes: student.admin_notes || "", pin: "" });
  useEffect(() => setDraft({ name: student.display_name, studentId: student.public_student_id, rank: student.current_belt, practiceDuration: student.practice_duration || "", profileBio: student.profile_bio || "", notes: student.admin_notes || "", pin: "" }), [student.id, student.updated_at]);
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      await api(`/api/admin/students/${student.id}`, { method: "PUT", body: JSON.stringify({ displayName: draft.name, studentId: draft.studentId, currentBelt: draft.rank, practiceDuration: draft.practiceDuration, profileBio: draft.profileBio, adminNotes: draft.notes, studentPin: draft.pin || undefined }) });
      report("Student details saved with an audit entry."); setOpen(false); await refresh();
    } catch (reason) { report(reason instanceof Error ? reason.message : "Student details could not be saved.", true); }
    finally { setBusy(false); }
  }
  return <details className="admin-workflow-card" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}><summary>Edit profile details or correct a request</summary><form className="admin-bulk-form" onSubmit={save}><label>Name<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /></label><label>Student ID<input value={draft.studentId} onChange={(event) => setDraft({ ...draft, studentId: event.target.value.toUpperCase() })} required /></label><label>Current kyu<select value={draft.rank} onChange={(event) => setDraft({ ...draft, rank: event.target.value })}>{RANKS.map((rank) => <option key={rank}>{rank}</option>)}</select></label><label>Practice duration<input value={draft.practiceDuration} onChange={(event) => setDraft({ ...draft, practiceDuration: event.target.value })} /></label><label>Public profile information<textarea value={draft.profileBio} onChange={(event) => setDraft({ ...draft, profileBio: event.target.value })} /></label><label>Administrator note<textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label><label>Reset student PIN <small>Optional · enter 6–12 digits only when a reset is needed.</small><input type="password" inputMode="numeric" pattern="[0-9]{6,12}" value={draft.pin} onChange={(event) => setDraft({ ...draft, pin: event.target.value })} /></label><footer><button className="btn-primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />} Save details</button></footer></form></details>;
}
