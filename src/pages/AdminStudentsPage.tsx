import { FormEvent, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  AlertCircle, Archive, Camera, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Eye, GraduationCap,
  LoaderCircle, Plus, ReceiptText, RotateCcw, Save, Search, Trash2, UserRound, Users, X,
} from "lucide-react";
import { useLocation } from "react-router";
import { RANKS } from "../../shared/ranks";
import { BeltMark } from "../components/BeltMark";
import { AdminExamApplications } from "../components/admin/AdminExamApplications";
import { AdminAatMemberships } from "../components/admin/AdminAatMemberships";
import { AdminMonthlyContributions } from "../components/admin/AdminMonthlyContributions";
import { AdminPaymentProofs } from "../components/admin/AdminPaymentProofs";
import { AdminLoginFields, type AdminDojo, type AdminIdentity } from "../components/admin/AdminAccess";
import { useAdminSession } from "../components/admin/useAdminSession";
import { prepareProfilePhoto } from "../utils/profilePhoto";
import { bangkokCanonicalDate, formatGregorianDate, formatGregorianDateTime, isCanonicalDate } from "../../shared/date";
import { GregorianDateInput } from "../components/GregorianDateInput";
import "./AdminStudentsPage.css";

type StudentSummary = {
  id: string; public_student_id: string; display_name: string; english_name: string | null; thai_name: string | null;
  account_created_date: string | null; dojo_joined_date: string | null; current_belt: string; profile_image_url: string | null;
  active: number; archived_at: string | null; dojo_name: string; updated_at: string; profile_status: string; total_hours: number;
  dojo_id: string; aat_number?: string | null; aat_last_paid_date?: string | null;
  examination_status: string; payment_status: string; pending_hours: number; sharing_active: number;
};
type Student = StudentSummary & {
  belt_color: string; profile_image_consent: number; guardian_consent: number; public_visible: number; admin_notes: string;
  practice_duration: string; pending_profile_image_url?: string; profile_review_note: string;
  profile_student_visible_note?: string; profile_internal_note?: string;
  aat_notes?: string;
};
type Examination = { id: string; rank_before: string; rank_attempted: string; passed: number; examination_location: string; rank_after: string; examination_date: string; examination_timestamp: string };
type TrainingHour = { id: string; entry_date: string; verified_hours: number; source: string; source_type?: string | null; organization?: string | null; source_details?: string | null; notes?: string | null; internal_note?: string | null; training_location?: string | null; created_at: string };
type HourRequest = { id: string; submitted_hours: number; previous_total: number; requested_total: number; status: string; submitted_at: string; training_date?: string | null; source_type?: string | null; organization?: string | null; source_details?: string | null; student_notes?: string | null; student_visible_note?: string; internal_admin_note?: string };
type Application = {
  id: string; status: string; payment_status: string; attempted_rank: string; current_rank: string; submitted_at: string;
  administrator_notes: string; cycle_name: string; answers: Record<string, string>; history: Array<Record<string, string>>;
};
type PaymentEntry = {
  id: string; payment_type: string; amount: number | null; currency: string; payment_date: string | null; status: string;
  reference: string; notes: string; created_at: string; updated_at: string; period_key: string | null;
  proof_id: string | null; proof_status: string | null; proof_content_type: string | null; proof_filename: string | null; proof_submitted_at: string | null;
};
type PaymentProof = {
  id: string; payment_type: string; payment_reference_id: string; status: string; content_type: string | null;
  original_filename: string | null; file_size: number | null; submitted_at: string | null; reviewed_at: string | null; period_key: string | null;
};
type Detail = { student: Student; examinations: Examination[]; trainingHours: TrainingHour[]; hourRequests: HourRequest[]; applications: Application[]; payments: PaymentEntry[]; paymentProofs: PaymentProof[] };
type ListResponse = {
  students: StudentSummary[]; pagination: { page: number; pageSize: number; total: number; totalPages: number };
  summary: { total: number; active: number; archived: number; pending_profiles: number }; ranks: string[]; suggestedStudentId: string;
};
type BulkDraft = { type: "hours" | "approve_hours" | "promotion" | "exam_pass"; hours: string; levels: string; location: string; examinationDate: string; preview: boolean };
type SelectionAction = { type: "approve" | "reject" | "archive" | "restore"; studentVisibleNote: string; internalNote: string; confirmationText: string };
type DeletionPreview = {
  student: { id: string; publicStudentId: string; name: string; englishName: string | null; thaiName: string | null; currentRank: string; dojoName: string; archivedAt: string | null };
  canDelete: boolean;
  blockedReason: string;
  confirmationPhrase: string;
  records: Array<{ key: string; label: string; count: number }>;
  emptyGroups: string[];
  totals: { studentRecords: number; relatedRecords: number; totalRecords: number; storedFiles: number; auditEntriesRedacted: number; contributionMonths: number };
};
type WorkspaceSection = "overview" | "profile" | "training" | "examinations" | "payments" | "history";
type StudentPageMode = "students" | "profileRequests" | "trainingRequests";

const EMPTY_PAGE = { page: 1, pageSize: 20, total: 0, totalPages: 1 };
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
  return formatGregorianDateTime(value, value);
}

function formatDay(value: string) {
  return formatGregorianDate(value, value);
}

function todayForDateInput() {
  return bangkokCanonicalDate();
}

function label(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function Status({ value }: { value: string }) {
  const tone = value.includes("pending") || value === "application_submitted" ? "is-pending" : value === "active" || value === "restored" || value === "approved" || value === "paid" || value === "examination_completed" ? "is-active" : value === "rejected" ? "is-error" : "is-neutral";
  return <span className={`admin-status ${tone}`}>{label(value === "none" ? "No current application" : value === "not_applicable" ? "—" : value)}</span>;
}

function studentRecordStatus(student: Pick<StudentSummary, "profile_status" | "active" | "archived_at">) {
  if (student.archived_at) return "archived";
  if (student.profile_status === "pending_admin_approval") return "pending";
  if (student.profile_status === "rejected") return "rejected";
  if (student.active !== 1) return "inactive";
  return "active";
}

export function AdminStudentsPage({ mode = "students" }: { mode?: StudentPageMode }) {
  const location = useLocation();
  const session = useAdminSession();
  const checked = session.checked;
  const authed = session.status === "authenticated";
  const { admin, dojos, name: adminName, password } = session;
  const loginDojoId = session.dojoId;
  const setAdminName = session.setName;
  const setPassword = session.setPassword;
  const login = session.login;
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [pagination, setPagination] = useState(EMPTY_PAGE);
  const [suggestedId, setSuggestedId] = useState("RSK-6901");
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [rank, setRank] = useState("");
  const [hoursStatus, setHoursStatus] = useState(() => mode === "trainingRequests" || new URLSearchParams(window.location.search).get("hoursStatus") === "pending" ? "pending" : "");
  const [dojoFilters, setDojoFilters] = useState<Set<string>>(() => new Set(
    (new URLSearchParams(window.location.search).get("dojoIds") || "").split(",").filter(Boolean),
  ));
  const [status, setStatus] = useState(() => {
    if (mode === "profileRequests") return "pending";
    const params = new URLSearchParams(window.location.search);
    if (params.get("profileStatus") === "pending_admin_approval") return "pending";
    const value = params.get("status");
    return value === "all" || value === "active" || value === "pending" || value === "archived" ? value : "active";
  });
  const [section, setSectionState] = useState<"students" | "exams" | "memberships" | "contributions" | "payslips">(() => {
    const value = new URLSearchParams(window.location.search).get("section");
    return value === "exams" || value === "memberships" || value === "contributions" || value === "payslips" ? value : "students";
  });
  const [sort, setSort] = useState("name");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [bulk, setBulk] = useState<BulkDraft | null>(null);
  const [selectionAction, setSelectionAction] = useState<SelectionAction | null>(null);
  // Deleting forever is always one student at a time, never a selection.
  const [deleteTarget, setDeleteTarget] = useState<StudentSummary | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [workspaceStart, setWorkspaceStart] = useState<WorkspaceSection>("overview");
  const selectAllRef = useRef<HTMLInputElement>(null);

  const defaultStatus = mode === "profileRequests" ? "pending" : "active";
  const filtersActive = Boolean(query || rank || dojoFilters.size || (mode === "trainingRequests" ? hoursStatus !== "pending" : status !== defaultStatus));
  const selectedRows = useMemo(() => students.filter((student) => selected.has(student.id)), [students, selected]);
  const selectedActiveRows = useMemo(() => selectedRows.filter((student) => student.active === 1 && !student.archived_at && student.profile_status === "approved"), [selectedRows]);
  const selectedPendingProfiles = useMemo(() => selectedRows.filter((student) => !student.archived_at && student.profile_status === "pending_admin_approval"), [selectedRows]);
  const selectedArchivedRows = useMemo(() => selectedRows.filter((student) => Boolean(student.archived_at)), [selectedRows]);
  const selectedPendingRows = useMemo(() => selectedActiveRows.filter((student) => Number(student.pending_hours) > 0), [selectedActiveRows]);
  const allVisibleSelected = students.length > 0 && students.every((student) => selected.has(student.id));
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = selectedRows.length > 0 && !allVisibleSelected;
  }, [allVisibleSelected, selectedRows.length]);

  function selectionTargets(type: SelectionAction["type"]) {
    if (type === "approve" || type === "reject") return selectedPendingProfiles;
    if (type === "archive") return selectedActiveRows;
    return selectedArchivedRows;
  }

  function chooseSelectionAction(value: string) {
    const common = { hours: "", levels: "1", location: "", examinationDate: todayForDateInput(), preview: false };
    if (value === "change_hours") setBulk({ ...common, type: "hours" });
    else if (value === "approve_pending_hours") setBulk({ ...common, type: "approve_hours" });
    else if (value === "mass_promotion") setBulk({ ...common, type: "promotion" });
    else if (value === "mass_exam_pass") setBulk({ ...common, type: "exam_pass" });
    else if (value === "archive" || value === "approve" || value === "reject" || value === "restore") {
      setSelectionAction({ type: value, studentVisibleNote: "", internalNote: "", confirmationText: "" });
    }
  }

  async function load(targetPage = page) {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ page: String(targetPage), pageSize: "20", sort, status });
      if (query) params.set("query", query);
      if (rank) params.set("rank", rank);
      if (mode === "trainingRequests" && hoursStatus) params.set("hoursStatus", hoursStatus);
      if (dojoFilters.size) params.set("dojoIds", [...dojoFilters].sort().join(","));
      if (mode === "students") params.set("excludePending", "1");
      if (mode === "profileRequests" && status === "pending") params.set("profileStatus", "pending_admin_approval");
      const body = await api<ListResponse>(`/api/admin/students?${params}`);
      setStudents(body.students); setPagination(body.pagination); setSuggestedId(body.suggestedStudentId);
      setSelected((current) => new Set([...current].filter((id) => body.students.some((student) => student.id === id))));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load students."); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const requestedSection = params.get("section");
    setSectionState(requestedSection === "exams" || requestedSection === "memberships" || requestedSection === "contributions" || requestedSection === "payslips" ? requestedSection : "students");
    if (mode === "profileRequests" || params.get("profileStatus") === "pending_admin_approval") setStatus("pending");
    if (mode === "trainingRequests" || params.get("hoursStatus") === "pending") setHoursStatus("pending");
    const requestedAction = params.get("action");
    if (requestedAction === "add") setCreateOpen(true);
    setWorkspaceStart(requestedAction === "training" ? "training" : requestedAction === "exam" ? "examinations" : "overview");
    setPage(1);
    setSelected(new Set());
  }, [location.search, mode]);
  useEffect(() => { if (authed && admin?.selectedDojoId) void load(page); }, [authed, admin?.selectedDojoId, page, query, rank, hoursStatus, dojoFilters, status, sort]);
  useEffect(() => {
    if (admin && admin.permissionLevel !== "renshinkan_super_admin" && section === "contributions") setSection("students");
  }, [admin?.permissionLevel, section]);

  function clearFilters() {
    setQueryInput(""); setQuery(""); setRank(""); setHoursStatus(mode === "trainingRequests" ? "pending" : ""); setDojoFilters(new Set()); setStatus(defaultStatus); setPage(1);
  }

  async function openStudent(id: string) {
    setDetail(null); setDetailLoading(true); setError("");
    try { setDetail(await api<Detail>(`/api/admin/students/${id}`)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not open the student."); }
    finally { setDetailLoading(false); }
  }

  function setSection(value: "students" | "exams" | "memberships" | "contributions" | "payslips") {
    setSectionState(value);
    const url = new URL(window.location.href);
    url.searchParams.set("section", value);
    window.history.replaceState(null, "", `${url.pathname}?${url.searchParams}${url.hash}`);
  }

  async function runSelectionAction() {
    if (!selectionAction) return;
    const targets = selectionTargets(selectionAction.type);
    if (!targets.length) { setSelectionAction(null); return; }
    setLoading(true); setError("");
    const failed: Array<{ student: StudentSummary; message: string }> = [];
    let completed = 0;
    for (const student of targets) {
      try {
        if (selectionAction.type === "approve" || selectionAction.type === "reject") {
          await api(`/api/admin/students/${student.id}/profile-status`, {
            method: "POST",
            body: JSON.stringify({ action: selectionAction.type }),
          });
        } else if (selectionAction.type === "archive") {
          await api(`/api/admin/students/${student.id}`, {
            method: "DELETE",
            body: JSON.stringify({ action: "archive", confirmed: true, studentId: student.public_student_id }),
          });
        } else {
          await api(`/api/admin/students/${student.id}`, {
            method: "PATCH",
            body: JSON.stringify({ action: "restore", confirmed: true, studentId: student.public_student_id }),
          });
        }
        completed += 1;
      } catch (reason) {
        failed.push({ student, message: reason instanceof Error ? reason.message : "The action could not be completed." });
      }
    }
    const actionLabel = selectionAction.type === "approve" ? "accepted" : selectionAction.type === "reject" ? "denied" : selectionAction.type === "archive" ? "archived" : "unarchived";
    if (completed) setNotice(`${completed} student${completed === 1 ? "" : "s"} ${actionLabel}. Only eligible selected records were changed.`);
    if (failed.length) setError(`${failed.length} student${failed.length === 1 ? "" : "s"} could not be updated. ${failed[0].student.display_name}: ${failed[0].message}`);
    setSelected(new Set(failed.map(({ student }) => student.id)));
    setSelectionAction(null);
    await load();
    setLoading(false);
  }

  async function runBulk() {
    if (!bulk || !bulk.preview) return;
    setLoading(true); setError("");
    try {
      const targets = bulk.type === "approve_hours" ? selectedPendingRows : selectedActiveRows;
      const body = bulk.type === "hours"
        ? { action: "add_hours", studentIds: targets.map((student) => student.id), hours: Number(bulk.hours), location: bulk.location }
        : bulk.type === "approve_hours"
          ? { action: "approve_pending_hours", studentIds: targets.map((student) => student.id) }
          : bulk.type === "promotion"
            ? { action: "mass_rank_change", studentIds: targets.map((student) => student.id), levels: Number(bulk.levels) }
            : { action: "mass_promotion", studentIds: targets.map((student) => student.id), levels: Number(bulk.levels), location: bulk.location, examinationDate: bulk.examinationDate };
      const result = await api<{ count: number; requestCount?: number; hoursApproved?: number }>("/api/admin/students/bulk", { method: "POST", body: JSON.stringify(body) });
      setNotice(bulk.type === "approve_hours"
        ? `${result.requestCount || 0} pending request${result.requestCount === 1 ? "" : "s"} approved for ${result.count} student${result.count === 1 ? "" : "s"}; ${result.hoursApproved || 0} hours added in one audited operation.`
        : `${result.count} student${result.count === 1 ? "" : "s"} updated in one audited operation.`);
      setBulk(null); setSelected(new Set()); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The bulk operation failed without applying a partial batch."); }
    finally { setLoading(false); }
  }

  if (!checked) return <div className="admin-gate"><LoaderCircle className="spin" /><p>Checking administrator session…</p></div>;
  if (!authed) return <section className="container-shell student-admin"><form className="admin-login-card" onSubmit={login}><AdminLoginFields name={adminName} dojoId={loginDojoId} dojos={dojos} password={password} error={session.error || error} setName={setAdminName} setDojoId={session.setDojoId} setPassword={setPassword} /></form></section>;
  const superAdmin = admin?.permissionLevel === "renshinkan_super_admin";
  const examinationRecordsView = section === "exams" && new URLSearchParams(location.search).get("view") === "records";
  const pageHeading = section === "students"
    ? mode === "profileRequests"
      ? ["Profile requests", "Review new student profiles independently from the approved student database."]
      : mode === "trainingRequests"
        ? ["Training hour requests", "Review student-submitted hours independently from the student database."]
        : ["Students", superAdmin ? "Search, filter, and manage approved student records across all dojos." : "Search, filter, and manage approved student records for your dojo."]
    : section === "exams"
      ? examinationRecordsView
        ? ["Application records", "Review completed cycles and open the permanent application history."]
        : ["Exam applications", "Review applications, record decisions, and prepare examination records."]
      : section === "memberships"
        ? ["AAT annual contributions", "Review annual Aikido Association of Thailand contribution records."]
        : section === "contributions"
          ? ["Monthly contributions", "Start with the current month and confirm contribution records."]
          : ["Payment proofs", "Review private proof files and confirm or reject the related payment."];

  return <section className="container-shell student-admin student-admin--table">
    <header className="student-admin__header"><div><p className="eyebrow">Administration</p><h1>{pageHeading[0]}</h1><p>{pageHeading[1]}</p></div>{section === "students" && mode === "students" ? <div className="admin-header-actions"><button className="btn-primary" onClick={() => setCreateOpen(true)}><Plus size={17} /> Add student</button></div> : null}</header>
    {section === "students" && mode === "students" ? <nav className="admin-record-tabs" aria-label="Student record status"><button type="button" className={status !== "archived" ? "is-active" : ""} onClick={() => { setStatus("active"); setPage(1); setSelected(new Set()); }}>Active <span>{pagination.total && status !== "archived" ? pagination.total : ""}</span></button><button type="button" className={status === "archived" ? "is-active" : ""} onClick={() => { setStatus("archived"); setPage(1); setSelected(new Set()); }}>Archived</button></nav> : null}
    {notice ? <div className="admin-notice"><CheckCircle2 size={18} /><span>{notice}</span><button onClick={() => setNotice("")}><X size={15} /></button></div> : null}
    {error ? <div className="admin-page-error" role="alert"><AlertCircle size={18} /><span>{error}</span><button onClick={() => setError("")}><X size={15} /></button></div> : null}

    <div hidden={section !== "students"}>
    <form className="admin-student-controls admin-student-controls--workflow admin-student-search-and-filters" role="search" aria-label={`Search and filter ${pageHeading[0].toLowerCase()}`} onSubmit={(event) => { event.preventDefault(); setPage(1); setQuery(queryInput.trim()); }}>
      <label className="admin-search-wide">Search by name, Student ID, or AAT number<div><Search size={17} /><input value={queryInput} onChange={(event) => setQueryInput(event.target.value)} placeholder="Name, CMU-6901, or AAT number" /><button className="btn-secondary">Search</button></div></label>
      <div className="admin-student-filter-panel">
        {superAdmin ? <label>Dojo<select value={[...dojoFilters][0] || ""} onChange={(event) => { setDojoFilters(event.target.value ? new Set([event.target.value]) : new Set()); setPage(1); }}><option value="">All dojos</option>{dojos.map((dojo) => <option key={dojo.id} value={dojo.id}>{dojo.official_name}</option>)}</select></label> : null}
        <label>Current rank<select value={rank} onChange={(event) => { setRank(event.target.value); setPage(1); }}><option value="">All ranks</option>{RANKS.map((item) => <option key={item}>{item}</option>)}</select></label>
        {mode === "profileRequests" ? <label>Profile status<select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="pending">Needs review</option><option value="all">All profiles</option></select></label> : null}
        {mode === "trainingRequests" ? <label>Training status<select value={hoursStatus} onChange={(event) => { setHoursStatus(event.target.value); setPage(1); }}><option value="pending">Needs review</option><option value="">All records</option></select></label> : null}
        <label>Sort order<select value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }}><option value="name">Name</option><option value="studentId">Student ID</option><option value="trainingHours">Training hours</option><option value="updated">Last updated</option></select></label>
        <button type="button" className="btn-secondary admin-clear" disabled={!filtersActive} onClick={clearFilters}>Clear filters</button>
      </div>
    </form>

    {selected.size ? <aside className="admin-bulk-toolbar"><strong><Users size={17} /> {selected.size} student{selected.size === 1 ? "" : "s"} selected on this page</strong>
      <label className="admin-selection-menu"><span>Set record status</span><select value="" onChange={(event) => chooseSelectionAction(event.target.value)}><option value="">Choose status action</option>
        {selectedPendingProfiles.length ? <optgroup label={`Pending profiles (${selectedPendingProfiles.length})`}><option value="approve">Accept profiles</option><option value="reject">Deny profiles</option></optgroup> : null}
        {selectedActiveRows.length ? <optgroup label={`Active records (${selectedActiveRows.length})`}><option value="archive">Archive records</option></optgroup> : null}
        {selectedArchivedRows.length ? <optgroup label={`Archived records (${selectedArchivedRows.length})`}><option value="restore">Unarchive records</option></optgroup> : null}
      </select></label>
      {selectedActiveRows.length ? <label className="admin-selection-menu"><span>Training & rank actions</span><select value="" onChange={(event) => chooseSelectionAction(event.target.value)}><option value="">Choose student action</option><option value="change_hours">Add training hours</option>{selectedPendingRows.length ? <option value="approve_pending_hours">Approve pending hours ({selectedPendingRows.length})</option> : null}<option value="mass_promotion">Mass promotion</option><option value="mass_exam_pass">Record mass exam pass</option></select></label> : null}
      <button className="text-link admin-selection-clear" onClick={() => setSelected(new Set())}>Clear selection</button>
    </aside> : null}

    <section className="admin-table-section" aria-busy={loading}><div className="admin-table-meta"><p>{pagination.total} student{pagination.total === 1 ? "" : "s"}{filtersActive ? " · filters active" : ""}</p>{loading ? <span><LoaderCircle className="spin" size={15} /> Loading</span> : null}</div><div className="admin-table-scroll"><table className="admin-student-table admin-student-table--workflow"><thead><tr>
      <th><label className="admin-select-box"><input ref={selectAllRef} type="checkbox" aria-label="Select every student on this page" checked={allVisibleSelected} onChange={(event) => setSelected(event.target.checked ? new Set(students.map((student) => student.id)) : new Set())} /><span aria-hidden="true" /></label></th>
      <th>Student</th><th>Student ID</th><th>Rank</th><th>Status</th><th>Training hours</th><th>Action</th>
    </tr></thead><tbody>{students.map((student) => <tr key={student.id} className={selected.has(student.id) ? "is-selected" : ""}>
      <td><label className="admin-select-box"><input type="checkbox" aria-label={`Select ${student.display_name}`} checked={selected.has(student.id)} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(student.id); else next.delete(student.id); return next; })} /><span aria-hidden="true" /></label></td>
      <th><span className="admin-student-identity">{student.profile_image_url ? <img src={student.profile_image_url} alt="" /> : <span aria-hidden="true"><UserRound size={18} /></span>}<span className="admin-student-name-stack"><strong>{student.english_name || student.display_name}</strong>{student.pending_hours ? <small className="admin-student-name-stack__pending">{student.pending_hours} hours request pending</small> : null}</span></span></th><td><code>{student.public_student_id}</code></td>
      <td>{student.current_belt}</td><td><Status value={studentRecordStatus(student)} /></td><td>{student.total_hours} hr{student.pending_hours ? <small className="admin-table-pending"> · {student.pending_hours} pending</small> : null}</td><td><div className="admin-row-actions">{mode === "profileRequests" ? <><button onClick={() => { setSelected(new Set([student.id])); setSelectionAction({ type: "approve", studentVisibleNote: "", internalNote: "", confirmationText: "" }); }}><Check size={14} /> Approve</button><button className="is-danger" onClick={() => { setSelected(new Set([student.id])); setSelectionAction({ type: "reject", studentVisibleNote: "", internalNote: "", confirmationText: "" }); }}><X size={14} /> Deny</button><button onClick={() => void openStudent(student.id)}><Eye size={14} /> Profile</button></> : student.archived_at ? <><button onClick={() => { setSelected(new Set([student.id])); setSelectionAction({ type: "restore", studentVisibleNote: "", internalNote: "", confirmationText: "" }); }}><RotateCcw size={14} /> Restore</button><button className="is-danger" onClick={() => setDeleteTarget(student)}><Trash2 size={14} /> Delete forever</button></> : <button onClick={() => void openStudent(student.id)}><Eye size={14} /> Open record</button>}</div></td>
    </tr>)}</tbody></table></div><div className="admin-student-cards">{students.map((student) => <article key={student.id}>
      <header><label className="admin-select-box"><input type="checkbox" aria-label={`Select ${student.display_name}`} checked={selected.has(student.id)} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(student.id); else next.delete(student.id); return next; })} /><span aria-hidden="true" /></label><span className="admin-student-identity">{student.profile_image_url ? <img src={student.profile_image_url} alt="" /> : <span aria-hidden="true"><UserRound size={18} /></span>}<span className="admin-student-name-stack"><strong>{student.english_name || student.display_name}</strong>{student.pending_hours ? <small className="admin-student-name-stack__pending">{student.pending_hours} hours request pending</small> : null}<small className="admin-student-name-stack__id">{student.public_student_id}</small></span></span><Status value={studentRecordStatus(student)} /></header>
      <dl><div><dt>Rank</dt><dd>{student.current_belt}</dd></div><div><dt>Training hours</dt><dd>{student.total_hours} hr{student.pending_hours ? ` · ${student.pending_hours} pending` : ""}</dd></div><div><dt>Dojo</dt><dd>{student.dojo_name}</dd></div></dl>
      {mode === "profileRequests" ? <div className="admin-card-actions"><button className="btn-primary" type="button" onClick={() => { setSelected(new Set([student.id])); setSelectionAction({ type: "approve", studentVisibleNote: "", internalNote: "", confirmationText: "" }); }}>Approve</button><button className="btn-secondary is-danger" type="button" onClick={() => { setSelected(new Set([student.id])); setSelectionAction({ type: "reject", studentVisibleNote: "", internalNote: "", confirmationText: "" }); }}>Deny</button><button className="btn-secondary" type="button" onClick={() => void openStudent(student.id)}>Profile</button></div> : student.archived_at ? <div className="admin-card-actions"><button className="btn-primary" type="button" onClick={() => { setSelected(new Set([student.id])); setSelectionAction({ type: "restore", studentVisibleNote: "", internalNote: "", confirmationText: "" }); }}>Restore</button><button className="btn-secondary is-danger" type="button" onClick={() => setDeleteTarget(student)}>Delete forever</button></div> : <button className="btn-secondary" type="button" onClick={() => void openStudent(student.id)}><Eye size={16} /> Open record</button>}
    </article>)}</div>{!loading && students.length === 0 ? <div className="admin-empty"><UserRound size={32} /><h2>No students found</h2><p>Try clearing the active filters or add a new student.</p></div> : null}
      <nav className="admin-pagination"><button className="btn-secondary" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={16} /> Previous</button><span>Page {pagination.page} of {pagination.totalPages}</span><button className="btn-secondary" disabled={page >= pagination.totalPages} onClick={() => setPage((value) => value + 1)}>Next <ChevronRight size={16} /></button></nav>
    </section>
    </div>

    {section === "exams" && admin ? <AdminExamApplications admin={admin} dojos={dojos} report={(message, isError = false) => isError ? setError(message) : setNotice(message)} /> : null}
    {section === "memberships" && admin ? <AdminAatMemberships admin={admin} dojos={dojos} report={(message, isError = false) => isError ? setError(message) : setNotice(message)} /> : null}
    {section === "contributions" && superAdmin ? <AdminMonthlyContributions report={(message, isError = false) => isError ? setError(message) : setNotice(message)} /> : null}
    {section === "payslips" ? <AdminPaymentProofs scope="contributions" showAllDojos={Boolean(superAdmin)} report={(message, isError = false) => isError ? setError(message) : setNotice(message)} /> : null}

    {(detailLoading || detail) ? <StudentDrawer detail={detail} loading={detailLoading} initialSection={workspaceStart} admin={admin} dojos={dojos} close={() => setDetail(null)} refresh={async () => { if (detail) await openStudent(detail.student.id); await load(); }} report={(message, isError = false) => isError ? setError(message) : setNotice(message)} /> : null}
    {bulk ? <BulkModal bulk={bulk} setBulk={setBulk} students={bulk.type === "approve_hours" ? selectedPendingRows : selectedActiveRows} close={() => setBulk(null)} confirm={() => void runBulk()} busy={loading} /> : null}
    {selectionAction ? <SelectionActionModal action={selectionAction} students={selectionTargets(selectionAction.type)} close={() => setSelectionAction(null)} confirm={() => void runSelectionAction()} busy={loading} /> : null}
    {deleteTarget ? <DeleteForeverModal student={deleteTarget} close={() => setDeleteTarget(null)} complete={async (message) => { setDeleteTarget(null); setNotice(message); setSelected(new Set()); await load(); }} report={(message) => setError(message)} /> : null}
    {createOpen ? <CreateStudentModal suggestedId={suggestedId} dojos={dojos.filter((dojo) => superAdmin || dojo.id === admin?.selectedDojoId)} selectedDojoId={admin?.selectedDojoId || ""} canManageAllDojos={superAdmin} close={() => setCreateOpen(false)} complete={async (message) => { setCreateOpen(false); setNotice(message); await load(1); }} /> : null}
  </section>;
}

function BulkModal({ bulk, setBulk, students, close, confirm, busy }: { bulk: BulkDraft; setBulk: (value: BulkDraft) => void; students: StudentSummary[]; close: () => void; confirm: () => void; busy: boolean }) {
  const hours = Number(bulk.hours);
  const levels = Number(bulk.levels);
  const valid = bulk.type === "approve_hours"
    ? students.length > 0
    : bulk.type === "hours"
      ? Number.isFinite(hours) && hours > 0
      : bulk.type === "promotion"
        ? Number.isInteger(levels) && levels > 0
        : Number.isInteger(levels) && levels > 0 && Boolean(bulk.location.trim()) && isCanonicalDate(bulk.examinationDate);
  const preview = bulk.type === "approve_hours" || bulk.preview;
  const title = bulk.type === "hours" ? "Change training hours" : bulk.type === "approve_hours" ? "Approve pending training hours" : bulk.type === "promotion" ? "Mass promotion" : "Mass exam pass";
  const explanation = bulk.type === "exam_pass"
    ? "A passed examination will be recorded for every eligible selected student, and each student will be promoted by the chosen number of levels."
    : bulk.type === "promotion"
      ? "The selected students' current ranks will be promoted directly without creating examination records."
      : "Confirm this single atomic operation. Every student receives an individual audit entry sharing one bulk-operation ID.";
  return <div className="admin-confirm-backdrop"><section className="admin-bulk-modal"><header><div><p className="eyebrow">Bulk action</p><h2>{title}</h2></div><button onClick={close}><X /></button></header>{!preview ? <div className="admin-bulk-form">{bulk.type === "hours" ? <><label>Hours to add to each student<input type="number" min="0.25" step="0.25" value={bulk.hours} onChange={(event) => setBulk({ ...bulk, hours: event.target.value })} onWheel={(event) => event.currentTarget.blur()} autoFocus /></label><label>Training location <small>Optional</small><input maxLength={200} value={bulk.location} onChange={(event) => setBulk({ ...bulk, location: event.target.value })} placeholder="Example: RenShinKan Dojo" /></label></> : <><label>Rank levels promoted<input type="number" min="1" step="1" value={bulk.levels} onChange={(event) => setBulk({ ...bulk, levels: event.target.value })} onWheel={(event) => event.currentTarget.blur()} autoFocus /></label>{bulk.type === "exam_pass" ? <><label>Examination date<GregorianDateInput admin value={bulk.examinationDate} onChange={(value) => setBulk({ ...bulk, examinationDate: value })} required /></label><label>Examination location<input value={bulk.location} maxLength={200} onChange={(event) => setBulk({ ...bulk, location: event.target.value })} required /></label></> : null}</>}<p>{students.length} active student{students.length === 1 ? "" : "s"} will be affected.</p><footer><button className="btn-secondary" onClick={close}>Cancel</button><button className="btn-primary" disabled={!valid} onClick={() => setBulk({ ...bulk, preview: true })}>Review changes</button></footer></div> : <div className="admin-bulk-preview"><p>{bulk.type === "approve_hours" ? "Every pending request for these students will be approved, added once to verified training hours, and recorded with an individual audit entry." : explanation}</p>{bulk.type === "approve_hours" ? <table><thead><tr><th>Student</th><th>Current total</th><th>Pending requests</th><th>Result</th></tr></thead><tbody>{students.map((student) => <tr key={student.id}><td>{student.display_name}</td><td>{student.total_hours} hr</td><td>{student.pending_hours}</td><td>Approve and add submitted hours</td></tr>)}</tbody></table> : <table><thead><tr><th>Student</th><th>Current</th><th>Change</th><th>Result</th></tr></thead><tbody>{students.map((student) => <tr key={student.id}><td>{student.display_name}</td><td>{bulk.type === "hours" ? `${student.total_hours} hr` : student.current_belt}</td><td>{bulk.type === "hours" ? `+${hours} hr` : `+${levels} level${levels === 1 ? "" : "s"}`}</td><td>{bulk.type === "hours" ? `${Number(student.total_hours) + hours} hr` : "Validated by official progression on save"}</td></tr>)}</tbody></table>}<footer>{bulk.type !== "approve_hours" ? <button className="btn-secondary" onClick={() => setBulk({ ...bulk, preview: false })}>Back</button> : <button className="btn-secondary" onClick={close}>Cancel</button>}<button className="btn-primary" disabled={busy || !valid} onClick={confirm}>{busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />} Confirm {students.length} student{students.length === 1 ? "" : "s"}</button></footer></div>}</section></div>;
}

function SelectionActionModal({ action, students, close, confirm, busy }: { action: SelectionAction; students: StudentSummary[]; close: () => void; confirm: () => void; busy: boolean }) {
  const count = students.length;
  const title = action.type === "approve" ? "Accept pending profiles" : action.type === "reject" ? "Deny pending profiles" : action.type === "archive" ? "Archive active students" : "Unarchive students";
  const copy = action.type === "approve"
    ? "Selected usable profiles still awaiting review will become approved. Optional photos will be published when present; the neutral avatar remains when absent."
    : action.type === "reject"
      ? "Only selected profiles still awaiting approval will be denied and kept private. The decision is applied immediately and retained in the audit log."
      : action.type === "archive"
        ? "Archiving keeps everything. Only selected active students will move to the Archived list, and their examination, payment, training, and audit history stays available."
        : "Only selected archived records will return to the active list. Their history remains unchanged.";
  const valid = count > 0;
  return <div className="admin-confirm-backdrop"><section className="admin-bulk-modal admin-selection-modal" role="alertdialog" aria-modal="true" aria-labelledby="selection-action-title">
    <header><div><p className="eyebrow">Selected records</p><h2 id="selection-action-title">{title}</h2></div><button aria-label="Close" onClick={close}><X /></button></header>
    <form className="admin-bulk-form" onSubmit={(event) => { event.preventDefault(); if (valid) confirm(); }}>
      <p>{copy}</p>
      <div className="admin-selection-preview-list">{students.map((student) => <span key={student.id}><strong>{student.display_name}</strong><code>{student.public_student_id}</code></span>)}</div>
      <footer><button type="button" className="btn-secondary" onClick={close}>Cancel</button><button className={`btn-primary ${action.type === "reject" ? "is-danger" : ""}`} disabled={busy || !valid}>{busy ? <LoaderCircle className="spin" size={16} /> : action.type === "archive" ? <Archive size={16} /> : action.type === "restore" ? <RotateCcw size={16} /> : action.type === "approve" ? <Check size={16} /> : <X size={16} />} Confirm {count} student{count === 1 ? "" : "s"}</button></footer>
    </form>
  </section></div>;
}

/**
 * Delete forever. One student only, never a selection. Step one shows who and
 * what will go; step two is a separate, explicit second confirmation.
 */
function DeleteForeverModal({ student, close, complete, report }: { student: StudentSummary; close: () => void; complete: (message: string) => Promise<void>; report: (message: string) => void }) {
  const [preview, setPreview] = useState<DeletionPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [step, setStep] = useState<1 | 2>(1);
  const [phrase, setPhrase] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true); setLoadError(""); setPreview(null); setStep(1); setPhrase(""); setAcknowledged(false);
    void api<DeletionPreview>(`/api/admin/students/${student.id}/deletion-preview`)
      .then((body) => { if (active) setPreview(body); })
      .catch((reason) => { if (active) setLoadError(reason instanceof Error ? reason.message : "Could not check what would be erased."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [student.id]);

  const phraseMatches = Boolean(preview) && phrase.trim() === preview!.confirmationPhrase;
  const canContinue = Boolean(preview?.canDelete) && phraseMatches && acknowledged;

  async function runDelete() {
    if (!preview || !canContinue) return;
    setBusy(true);
    try {
      const result = await api<{ recordsDeleted: number; filesDeleted: number }>(`/api/admin/students/${student.id}`, {
        method: "DELETE",
        body: JSON.stringify({
          action: "delete_permanently",
          confirmed: true,
          secondConfirmation: true,
          studentId: preview.student.publicStudentId,
          confirmationText: preview.confirmationPhrase,
        }),
      });
      await complete(`Record erased for good. ${result.recordsDeleted} record${result.recordsDeleted === 1 ? "" : "s"} and ${result.filesDeleted} file${result.filesDeleted === 1 ? "" : "s"} were removed. No name or Student ID was kept.`);
    } catch (reason) {
      report(reason instanceof Error ? reason.message : "The record could not be deleted. Nothing was removed.");
      close();
    } finally {
      setBusy(false);
    }
  }

  return <div className="admin-confirm-backdrop"><section className="admin-bulk-modal admin-selection-modal admin-delete-forever" role="alertdialog" aria-modal="true" aria-labelledby="delete-forever-title">
    <header><div><p className="eyebrow">Cannot be undone</p><h2 id="delete-forever-title">Delete forever</h2></div><button aria-label="Close" onClick={close}><X /></button></header>
    {loading ? <div className="admin-bulk-form"><p><LoaderCircle className="spin" size={16} /> Checking what would be erased…</p></div>
      : loadError ? <div className="admin-bulk-form"><p role="alert">{loadError}</p><footer><button type="button" className="btn-secondary" onClick={close}>Close</button></footer></div>
      : !preview ? null
      : step === 1 ? <div className="admin-bulk-form">
        <p><strong>This erases the record for good. It cannot be undone, and it cannot be restored from the Archived list.</strong></p>
        <dl className="admin-detail-grid">
          <div><dt>Name</dt><dd>{preview.student.name}</dd></div>
          <div><dt>Student ID</dt><dd><code>{preview.student.publicStudentId}</code></dd></div>
          <div><dt>Rank</dt><dd>{preview.student.currentRank}</dd></div>
          <div><dt>Dojo</dt><dd>{preview.student.dojoName}</dd></div>
        </dl>
        {!preview.canDelete ? <p role="alert">{preview.blockedReason}</p> : null}
        <h3>Everything that will be erased</h3>
        {preview.records.length ? <ul className="admin-deletion-list">{preview.records.map((row) => <li key={row.key}><span>{row.label}</span><b>{row.count}</b></li>)}</ul> : <p>No related records were found. Only the student record itself will be erased.</p>}
        <p>{preview.totals.totalRecords} record{preview.totals.totalRecords === 1 ? "" : "s"} in total, {preview.totals.storedFiles} stored file{preview.totals.storedFiles === 1 ? "" : "s"} (profile photo and payment images), and {preview.totals.auditEntriesRedacted} history entr{preview.totals.auditEntriesRedacted === 1 ? "y" : "ies"} will have the name and Student ID stripped out.</p>
        <footer><button type="button" className="btn-secondary" onClick={close}>Cancel</button><button type="button" className="btn-primary is-danger" disabled={!preview.canDelete} onClick={() => setStep(2)}><Trash2 size={16} /> Continue</button></footer>
      </div> : <form className="admin-bulk-form" onSubmit={(event) => { event.preventDefault(); void runDelete(); }}>
        <p><strong>Second and final confirmation.</strong> {preview.student.name} ({preview.student.publicStudentId}) and {preview.totals.totalRecords} record{preview.totals.totalRecords === 1 ? "" : "s"} will be erased. There is no undo and no backup copy inside the site.</p>
        <label className="admin-confirm-phrase">Type <strong>{preview.confirmationPhrase}</strong> to confirm<input value={phrase} onChange={(event) => setPhrase(event.target.value)} autoComplete="off" autoFocus /></label>
        <label className="admin-confirm-check"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /> I understand this cannot be undone.</label>
        <footer><button type="button" className="btn-secondary" onClick={() => setStep(1)}>Back</button><button className="btn-primary is-danger" disabled={busy || !canContinue}>{busy ? <LoaderCircle className="spin" size={16} /> : <Trash2 size={16} />} Delete forever</button></footer>
      </form>}
  </section></div>;
}

function CreateStudentModal({ suggestedId, dojos, selectedDojoId, canManageAllDojos, close, complete }: { suggestedId: string; dojos: AdminDojo[]; selectedDojoId: string; canManageAllDojos: boolean; close: () => void; complete: (message: string) => void }) {
  const today = bangkokCanonicalDate();
  const [draft, setDraft] = useState({ englishName: "", thaiName: "", accountCreatedDate: today, dojoJoinedDate: today, studentId: suggestedId, rank: "Unranked", hours: "0", notes: "", dojoId: selectedDojoId || dojos[0]?.id || "", aatNumber: "", aatLastPaidDate: "", aatPaidKnown: false });
  const [generatedId, setGeneratedId] = useState(suggestedId);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function chooseDojo(dojoId: string) {
    const replaceGeneratedId = draft.studentId === generatedId;
    setDraft((current) => ({ ...current, dojoId, studentId: replaceGeneratedId ? "" : current.studentId }));
    if (!dojoId) return;
    try {
      const result = await api<{ suggestedStudentId: string }>(`/api/admin/students/suggested-id?dojoId=${encodeURIComponent(dojoId)}`);
      setGeneratedId(result.suggestedStudentId);
      if (replaceGeneratedId) setDraft((current) => current.dojoId === dojoId ? { ...current, studentId: result.suggestedStudentId } : current);
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : "The next Student ID could not be loaded.");
    }
  }

  async function choosePhoto(input?: File) {
    if (!input) return;
    try {
      const prepared = await prepareProfilePhoto(input);
      setPhoto(prepared);
      setPreview(URL.createObjectURL(prepared));
      setFormError("");
    } catch (reason) {
      setPhoto(null);
      setPreview("");
      setFormError(reason instanceof Error ? reason.message : "The photo could not be prepared.");
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFormError("");
    let uploadedUrl = "";
    try {
      if (photo) {
        const data = new FormData();
        data.set("file", photo);
        const uploaded = await api<{ url: string }>("/api/admin/students/upload", { method: "POST", body: data });
        uploadedUrl = uploaded.url;
      }
      const result = await api<{ studentId: string }>("/api/admin/students", {
        method: "POST",
        body: JSON.stringify({
          englishName: draft.englishName,
          thaiName: draft.thaiName,
          accountCreatedDate: draft.accountCreatedDate,
          dojoJoinedDate: draft.dojoJoinedDate,
          studentId: draft.studentId,
          manualStudentId: draft.studentId !== generatedId,
          currentBelt: draft.rank,
          currentTrainingHours: Number(draft.hours),
          dojoId: draft.dojoId,
          aatNumber: draft.aatNumber,
          aatLastPaidDate: draft.aatPaidKnown ? draft.aatLastPaidDate : null,
          adminNotes: draft.notes,
          profileImageUrl: uploadedUrl || null,
          profileImageConsent: Boolean(uploadedUrl),
        }),
      });
      await complete(`Created ${result.studentId}${uploadedUrl ? " with a profile photo" : ""}.`);
    } catch (reason) {
      if (uploadedUrl) {
        await api("/api/admin/students/upload", { method: "DELETE", body: JSON.stringify({ url: uploadedUrl }) }).catch(() => undefined);
      }
      setFormError(reason instanceof Error ? reason.message : "Could not create student.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="admin-confirm-backdrop"><section className="admin-bulk-modal"><header><div><p className="eyebrow">Official profile</p><h2>Add student</h2></div><button onClick={close}><X /></button></header><form className="admin-bulk-form" onSubmit={submit}>
    <label>English name <small>Required</small><input autoComplete="name" value={draft.englishName} onChange={(event) => setDraft({ ...draft, englishName: event.target.value })} required /></label>
    <label>Thai name <small>Optional</small><input lang="th" value={draft.thaiName} onChange={(event) => setDraft({ ...draft, thaiName: event.target.value })} /></label>
    <label>Account created date<GregorianDateInput admin value={draft.accountCreatedDate} onChange={(value) => setDraft({ ...draft, accountCreatedDate: value })} required /></label>
    <label>Joined dojo date<GregorianDateInput admin value={draft.dojoJoinedDate} onChange={(value) => setDraft({ ...draft, dojoJoinedDate: value })} required /></label>
    {canManageAllDojos ? <label>Dojo<select value={draft.dojoId} onChange={(event) => void chooseDojo(event.target.value)} required><option value="">Choose a dojo</option>{dojos.map((dojo) => <option key={dojo.id} value={dojo.id}>{dojo.official_name}</option>)}</select></label> : <p className="admin-help-copy"><strong>Dojo:</strong> {dojos.find((dojo) => dojo.id === selectedDojoId)?.official_name || "Selected dojo"}. The server assigns this dojo automatically.</p>}
    <label>Student ID <small>Generated from the dojo abbreviation, the final two digits of the Thai Buddhist year, and that year&apos;s student number. Administrators may replace it.</small><input value={draft.studentId} onChange={(event) => setDraft({ ...draft, studentId: event.target.value.toUpperCase() })} placeholder="RSK-6901" required /></label>
    <label>Current kyu<select value={draft.rank} onChange={(event) => setDraft({ ...draft, rank: event.target.value })}>{RANKS.map((item) => <option key={item}>{item}</option>)}</select></label>
    <label>Current total hours<input type="number" min="0" step="0.25" value={draft.hours} onChange={(event) => setDraft({ ...draft, hours: event.target.value })} /></label>
    <label>AAT membership number <small>Optional. “NEW” is displayed until a number is assigned.</small><input value={draft.aatNumber} onChange={(event) => setDraft({ ...draft, aatNumber: event.target.value })} /></label>
    <label className="admin-checkbox-row"><input type="checkbox" checked={draft.aatPaidKnown} onChange={(event) => setDraft({ ...draft, aatPaidKnown: event.target.checked, aatLastPaidDate: event.target.checked ? draft.aatLastPaidDate : "" })} /> AAT annual membership has been paid</label>
    {draft.aatPaidKnown ? <label>Last AAT annual payment date<GregorianDateInput admin value={draft.aatLastPaidDate} onChange={(value) => setDraft({ ...draft, aatLastPaidDate: value })} required /></label> : <p className="admin-help-copy">Not yet paid or payment date unknown. Aikido members from all participating dojos are requested to make an annual contribution to the Aikido Association of Thailand.</p>}
    <label className="student-photo-field"><span>{preview ? <img src={preview} alt="New student profile preview" /> : <Camera />}</span><strong>{preview ? "Replace profile photo" : "Add profile photo (optional)"}</strong><small>JPEG, PNG, or WebP; at least 128 × 128 pixels. The photo will appear on the approved student profile.</small><input type="file" accept="image/jpeg,image/png,image/webp" capture="user" onChange={(event) => void choosePhoto(event.target.files?.[0])} /></label>
    <label>Administrator note <small>Private admin-only note. Only authorized administrators can see it; it is never shown to students or on public profiles.</small><textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>
    {formError ? <p className="form-error" role="alert">{formError}</p> : null}
    <footer><button type="button" className="btn-secondary" onClick={close}>Cancel</button><button className="btn-primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />} {busy ? "Creating…" : "Create student"}</button></footer>
  </form></section></div>;
}

function StudentDrawer({ detail, loading, initialSection, admin, dojos, close, refresh, report }: { detail: Detail | null; loading: boolean; initialSection: WorkspaceSection; admin: AdminIdentity | null; dojos: AdminDojo[]; close: () => void; refresh: () => Promise<void>; report: (message: string, error?: boolean) => void }) {
  const [hours, setHours] = useState(""); const [hoursLocation, setHoursLocation] = useState(""); const [exam, setExam] = useState({ current: "", attempted: "", passed: true, location: "", examinationDate: todayForDateInput() });
  const [busy, setBusy] = useState(false);
  const [workspaceSection, setWorkspaceSection] = useState<WorkspaceSection>(initialSection);
  useEffect(() => { setWorkspaceSection(initialSection); }, [detail?.student.id, initialSection]);
  useEffect(() => { if (detail) setExam((value) => ({ ...value, current: detail.student.current_belt, attempted: RANKS[Math.min(RANKS.length - 1, Math.max(1, RANKS.indexOf(detail.student.current_belt as (typeof RANKS)[number]) + 1))] })); }, [detail?.student.id, detail?.student.current_belt]);
  async function mutate(path: string, body: Record<string, unknown>, success: string) { if (!detail) return false; setBusy(true); try { await api(path, { method: "POST", body: JSON.stringify(body) }); report(success); await refresh(); return true; } catch (reason) { report(reason instanceof Error ? reason.message : "The change could not be saved.", true); return false; } finally { setBusy(false); } }
  if (loading || !detail) return <div className="admin-drawer-backdrop"><section className="admin-drawer" role="dialog" aria-modal="true" aria-labelledby="student-record-loading-title"><header><h2 id="student-record-loading-title">Student record</h2><button aria-label="Close student record" onClick={close}><X /></button></header><div className="admin-drawer-loading"><LoaderCircle className="spin" /> Loading complete record…</div></section></div>;
  const student = detail.student; const currentApp = detail.applications[0]; const pendingRequests = detail.hourRequests.filter((request) => request.status === "pending");
  const workspaceSections = [["overview", "Overview"], ["profile", "Profile"], ["training", "Training"], ["examinations", "Examinations"], ["payments", "Payments"], ["history", "History"]] as const;
  function moveTab(event: ReactKeyboardEvent<HTMLButtonElement>, index: number) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? workspaceSections.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + workspaceSections.length) % workspaceSections.length;
    const nextSection = workspaceSections[nextIndex][0];
    setWorkspaceSection(nextSection);
    document.getElementById(`student-tab-${nextSection}`)?.focus();
  }
  return <div className="admin-drawer-backdrop"><section className="admin-drawer admin-drawer--workflow admin-student-workspace" role="dialog" aria-modal="true" aria-labelledby="student-workspace-title"><header><div className="admin-student-workspace__identity"><span>{student.pending_profile_image_url ? <img src={student.pending_profile_image_url} alt="" /> : student.profile_image_url ? <img src={student.profile_image_url} alt="" /> : <UserRound />}</span><div><p className="eyebrow">Student workspace</p><h2 id="student-workspace-title">{student.english_name || student.display_name}</h2>{student.thai_name ? <p className="admin-student-workspace__thai" lang="th">{student.thai_name}</p> : null}<p><code>{student.public_student_id}</code> · <BeltMark rank={student.current_belt} /> {student.current_belt} · {student.dojo_name}</p><Status value={studentRecordStatus(student)} /></div></div><button className="admin-icon-button" aria-label="Close student workspace" onClick={close}><X /></button></header><nav className="admin-student-workspace__tabs" role="tablist" aria-label="Student workspace sections">{workspaceSections.map(([id, title], index) => <button key={id} id={`student-tab-${id}`} role="tab" aria-selected={workspaceSection === id} aria-controls="student-workspace-panel" tabIndex={workspaceSection === id ? 0 : -1} className={workspaceSection === id ? "is-active" : ""} onKeyDown={(event) => moveTab(event, index)} onClick={() => setWorkspaceSection(id)}>{title}{id === "training" && pendingRequests.length ? <span>{pendingRequests.length}</span> : null}</button>)}</nav><div id="student-workspace-panel" className="admin-drawer__body" role="tabpanel" aria-labelledby={`student-tab-${workspaceSection}`} data-section={workspaceSection}>
    <div className="admin-profile-review"><div>{student.pending_profile_image_url ? <img src={student.pending_profile_image_url} alt="Pending profile" /> : student.profile_image_url ? <img src={student.profile_image_url} alt="Profile" /> : <UserRound />}</div><dl><div><dt>Status</dt><dd><Status value={studentRecordStatus(student)} /></dd></div><div><dt>Total hours</dt><dd>{Number(student.total_hours).toLocaleString()} hr</dd></div><div><dt>Current rank</dt><dd>{student.current_belt}</dd></div><div><dt>Current dojo</dt><dd>{student.dojo_name}</dd></div><div><dt>Pending profile</dt><dd>{student.profile_status === "pending_admin_approval" ? "Needs review" : "None"}</dd></div><div><dt>Pending hours</dt><dd>{pendingRequests.length ? `${pendingRequests.length} request${pendingRequests.length === 1 ? "" : "s"}` : "None"}</dd></div><div><dt>Account created</dt><dd>{student.account_created_date ? formatDay(student.account_created_date) : "Not supplied"}</dd></div><div><dt>Joined dojo</dt><dd>{student.dojo_joined_date ? formatDay(student.dojo_joined_date) : "Not supplied"}</dd></div><div><dt>Practice start</dt><dd>{student.practice_duration || "Not supplied"}</dd></div></dl></div>
    <StudentRecordStatusControl student={student} refresh={refresh} report={report} />
    <StudentDetailsEditor student={student} admin={admin} dojos={dojos} refresh={refresh} report={report} />
    {student.profile_status === "pending_admin_approval" ? <section className="admin-workflow-card admin-profile-approval"><h3>Review profile request</h3><p>This profile is already usable. Review and correct its details, then approve or reject it.</p>
      <div><button className="btn-primary" disabled={busy} onClick={() => void mutate(`/api/admin/students/${student.id}/profile-status`, { action: "approve" }, "Profile approved.")}><Check size={16} /> Approve</button><button className="btn-secondary is-danger" disabled={busy} onClick={() => void mutate(`/api/admin/students/${student.id}/profile-status`, { action: "reject" }, "Profile rejected; the decision was added to the audit log.")}>Deny</button></div>
    </section> : null}
    <div className="admin-record-entry-grid"><section className="admin-workflow-card"><h3><Clock3 size={18} /> Add training hours</h3><label>Number of hours to add<input type="number" min="0.25" step="0.25" value={hours} onChange={(event) => setHours(event.target.value)} onWheel={(event) => event.currentTarget.blur()} /></label><label>Training location <small>Optional</small><input maxLength={200} value={hoursLocation} onChange={(event) => setHoursLocation(event.target.value)} placeholder="Example: RenShinKan Dojo" /></label><dl className="admin-preview-math"><div><dt>Current</dt><dd>{student.total_hours} hr</dd></div><div><dt>Add</dt><dd>{Number(hours || 0)} hr</dd></div><div><dt>Result</dt><dd>{Number(student.total_hours) + Number(hours || 0)} hr</dd></div></dl><button className="btn-primary" disabled={busy || !(Number(hours) > 0)} onClick={() => void mutate(`/api/admin/students/${student.id}/hours`, { hours: Number(hours), location: hoursLocation }, "Training hours added.")}>Add hours</button></section>
      <section className="admin-workflow-card"><h3><GraduationCap size={18} /> Record examination</h3><label>Current rank<select value={exam.current} onChange={(event) => setExam({ ...exam, current: event.target.value })}>{RANKS.map((item) => <option key={item}>{item}</option>)}</select></label><label>Attempting<select value={exam.attempted} onChange={(event) => setExam({ ...exam, attempted: event.target.value })}>{RANKS.map((item) => <option key={item}>{item}</option>)}</select></label><label>Result<select value={exam.passed ? "yes" : "no"} onChange={(event) => setExam({ ...exam, passed: event.target.value === "yes" })}><option value="yes">Passed</option><option value="no">Did not pass</option></select></label><label>Examination date<GregorianDateInput admin value={exam.examinationDate} onChange={(value) => setExam({ ...exam, examinationDate: value })} required /></label><label>Examination location<input maxLength={200} value={exam.location} onChange={(event) => setExam({ ...exam, location: event.target.value })} /></label><button className="btn-primary" disabled={busy || !exam.location.trim() || !exam.examinationDate} onClick={() => { if (window.confirm(`Record this examination for ${student.display_name}?\n\nCurrent rank: ${exam.current}\nAttempting: ${exam.attempted}\nResult: ${exam.passed ? "Passed" : "Did not pass"}\nDate: ${formatGregorianDate(exam.examinationDate)}\nLocation: ${exam.location}`)) void mutate(`/api/admin/students/${student.id}/exam`, { currentRank: exam.current, attemptedRank: exam.attempted, passed: exam.passed, location: exam.location, examinationDate: exam.examinationDate }, `Examination ${exam.passed ? "pass" : "attempt"} recorded.`); }}>Review and record examination</button></section></div>
    {pendingRequests.length ? <section className="admin-workflow-card admin-training-requests"><h3>Student-submitted training hours</h3>{pendingRequests.map((request) => <article className="admin-request-row" key={request.id}><div><strong>+{request.submitted_hours} hours</strong><span>{formatDay(request.training_date || request.submitted_at)} · {request.organization || request.source_details || label(request.source_type || "source not supplied")}</span><small>{request.previous_total} → {request.requested_total} hours requested{request.student_notes ? ` · ${request.student_notes}` : ""}</small></div><div><button className="btn-primary" disabled={busy} onClick={() => void mutate(`/api/admin/students/${student.id}/hours-requests`, { hourRequestId: request.id, action: "approve" }, "Student hours approved.")}>Approve</button><button className="btn-secondary is-danger" disabled={busy} onClick={() => void mutate(`/api/admin/students/${student.id}/hours-requests`, { hourRequestId: request.id, action: "reject" }, "Student hours denied.")}>Deny</button></div></article>)}</section> : null}
    {currentApp ? <section className="admin-workflow-card admin-application"><header><div><h3>Examination application</h3><p>{currentApp.cycle_name} · submitted {formatDate(currentApp.submitted_at)}</p></div><Status value={currentApp.payment_status} /></header><dl className="admin-detail-grid"><div><dt>Current rank</dt><dd>{currentApp.current_rank}</dd></div><div><dt>Attempting</dt><dd>{currentApp.attempted_rank}</dd></div><div><dt>Status</dt><dd><Status value={currentApp.status} /></dd></div><div><dt>Payment</dt><dd><Status value={currentApp.payment_status} /></dd></div></dl><details><summary>View every PDF questionnaire answer</summary><dl className="admin-answer-list">{Object.entries(currentApp.answers).map(([key, value]) => <div key={key}><dt>{label(key)}</dt><dd>{value || "—"}</dd></div>)}</dl></details><div className="admin-inline-actions">{currentApp.status === "rejected" ? <p>This application was denied. Payment actions are unavailable.</p> : currentApp.payment_status === "paid" ? <button className="btn-secondary is-danger" onClick={() => { if (window.confirm("Reverse this payment confirmation? The reversal will be logged.")) void mutate(`/api/admin/students/${student.id}/application`, { applicationId: currentApp.id, action: "reverse_payment", confirmed: true }, "Payment confirmation reversed."); }}>Undo payment confirmation</button> : <button className="btn-primary" onClick={() => void mutate(`/api/admin/students/${student.id}/application`, { applicationId: currentApp.id, action: "mark_paid" }, "Payment confirmed.")}>Mark paid</button>}</div>{currentApp.history?.length ? <details><summary>Status and payment history</summary><ol className="admin-status-history">{currentApp.history.map((entry, index) => <li key={String(entry.id || index)}>{formatDate(String(entry.createdAt))} · {label(String(entry.newStatus || entry.newPaymentStatus || "updated"))}</li>)}</ol></details> : null}</section> : null}
    <section className="admin-workflow-card admin-payment-history" aria-labelledby="student-payment-history-title"><header><div><h3 id="student-payment-history-title"><ReceiptText size={18} aria-hidden="true" /> Payment records</h3><p>Private proof files are available only through authorized administration routes.</p></div></header>
      {detail.payments.length ? <div className="admin-payment-history__table"><table><thead><tr><th>Type</th><th>Period / date</th><th>Amount</th><th>Status</th><th>Proof</th></tr></thead><tbody>{detail.payments.map((payment) => <tr key={payment.id}><td>{label(payment.payment_type)}</td><td>{payment.period_key || (payment.payment_date ? formatDay(payment.payment_date) : formatDay(payment.created_at))}</td><td>{payment.amount == null ? "Not recorded" : `${Number(payment.amount).toLocaleString()} ${payment.currency}`}</td><td><Status value={payment.status} /></td><td>{payment.proof_id ? <span className="admin-proof-actions"><Status value={payment.proof_status || "submitted"} /><a href={`/api/admin/payment-proofs/${payment.proof_id}`} target="_blank" rel="noopener noreferrer">View</a><a href={`/api/admin/payment-proofs/${payment.proof_id}?download=1`} download>Download</a></span> : "No proof attached"}</td></tr>)}</tbody></table></div> : <div className="admin-empty admin-payment-history__empty"><ReceiptText size={28} aria-hidden="true" /><h3>No payment records yet</h3><p>Payments and contribution confirmations for this student will appear here.</p></div>}
      {detail.paymentProofs.filter((proof) => !detail.payments.some((payment) => payment.proof_id === proof.id)).length ? <section className="admin-payment-history__unlinked"><h4>Other submitted proofs</h4><ul>{detail.paymentProofs.filter((proof) => !detail.payments.some((payment) => payment.proof_id === proof.id)).map((proof) => <li key={proof.id}><span><strong>{label(proof.payment_type)}</strong><small>{proof.period_key || (proof.submitted_at ? formatDay(proof.submitted_at) : "Date not recorded")} · {proof.original_filename || "Payment proof"}</small></span><Status value={proof.status} /><a href={`/api/admin/payment-proofs/${proof.id}`} target="_blank" rel="noopener noreferrer">View</a><a href={`/api/admin/payment-proofs/${proof.id}?download=1`} download>Download</a></li>)}</ul></section> : null}
    </section>
    <section className="admin-history-grid"><section><h3>Training history</h3>{detail.trainingHours.length ? <ol>{detail.trainingHours.map((entry) => <li key={entry.id}><strong>+{entry.verified_hours} hours</strong><time>{formatDay(entry.entry_date || entry.created_at)}</time><span>{entry.organization || entry.source_details || entry.training_location || label(entry.source_type || entry.source)}</span>{entry.notes ? <small>{entry.notes}</small> : null}</li>)}</ol> : <p>No entries yet.</p>}</section><section><h3>Examination history</h3>{detail.examinations.length ? <ol>{detail.examinations.map((entry) => <li key={entry.id}><strong>{entry.rank_before ? `${entry.rank_before} → ` : ""}{entry.rank_after || entry.rank_attempted}</strong><time>{formatDay(entry.examination_date || entry.examination_timestamp)}</time><span>{entry.passed ? "Passed" : "Did not pass"}{entry.examination_location ? ` · ${entry.examination_location}` : ""}</span></li>)}</ol> : <p>No examinations yet.</p>}</section></section>
  </div></section></div>;
}

function StudentRecordStatusControl({ student, refresh, report }: { student: Student; refresh: () => Promise<void>; report: (message: string, error?: boolean) => void }) {
  const current = student.archived_at ? "archived" : "active";
  const [value, setValue] = useState(current);
  const [busy, setBusy] = useState(false);
  useEffect(() => setValue(current), [student.id, student.archived_at]);

  async function save() {
    if (value === current) return;
    setBusy(true);
    try {
      if (value === "archived") {
        await api(`/api/admin/students/${student.id}`, { method: "DELETE", body: JSON.stringify({ action: "archive", confirmed: true, studentId: student.public_student_id }) });
        report("Student moved to Archived.");
      } else {
        await api(`/api/admin/students/${student.id}`, { method: "PATCH", body: JSON.stringify({ action: "restore", confirmed: true, studentId: student.public_student_id }) });
        report("Student restored to Active.");
      }
      await refresh();
    } catch (reason) {
      report(reason instanceof Error ? reason.message : "The record status could not be changed.", true);
      setValue(current);
    } finally {
      setBusy(false);
    }
  }

  return <section className="admin-workflow-card admin-overview-status"><div><h3>Record status</h3><p>Move this student between the Active and Archived lists.</p></div><label>Status<select value={value} disabled={busy} onChange={(event) => setValue(event.target.value)}><option value="active">Active</option><option value="archived">Archived</option></select></label><button className="btn-primary" disabled={busy || value === current} onClick={() => void save()}>{busy ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />} Save status</button></section>;
}

function StudentDetailsEditor({ student, admin, dojos, refresh, report }: { student: Student; admin: AdminIdentity | null; dojos: AdminDojo[]; refresh: () => Promise<void>; report: (message: string, error?: boolean) => void }) {
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ englishName: student.english_name || student.display_name, thaiName: student.thai_name || "", accountCreatedDate: student.account_created_date || "", dojoJoinedDate: student.dojo_joined_date || "", studentId: student.public_student_id, rank: student.current_belt, dojoId: student.dojo_id, aatNumber: student.aat_number || "", aatLastPaidDate: student.aat_last_paid_date || "", practiceDuration: student.practice_duration || "", notes: student.admin_notes || "" });
  useEffect(() => {
    setOpen(true);
    setDraft({ englishName: student.english_name || student.display_name, thaiName: student.thai_name || "", accountCreatedDate: student.account_created_date || "", dojoJoinedDate: student.dojo_joined_date || "", studentId: student.public_student_id, rank: student.current_belt, dojoId: student.dojo_id, aatNumber: student.aat_number || "", aatLastPaidDate: student.aat_last_paid_date || "", practiceDuration: student.practice_duration || "", notes: student.admin_notes || "" });
  }, [student.id, student.updated_at]);
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      await api(`/api/admin/students/${student.id}`, { method: "PUT", body: JSON.stringify({ englishName: draft.englishName, thaiName: draft.thaiName, accountCreatedDate: draft.accountCreatedDate, dojoJoinedDate: draft.dojoJoinedDate, studentId: draft.studentId, currentBelt: draft.rank, dojoId: draft.dojoId, aatNumber: draft.aatNumber, aatLastPaidDate: draft.aatLastPaidDate || null, practiceDuration: draft.practiceDuration, adminNotes: draft.notes }) });
      report("Student details saved with an audit entry."); setOpen(false); await refresh();
    } catch (reason) { report(reason instanceof Error ? reason.message : "Student details could not be saved.", true); }
    finally { setBusy(false); }
  }
  const superAdmin = admin?.permissionLevel === "renshinkan_super_admin";
  return <details className="admin-workflow-card" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}><summary>Edit profile details or correct a request</summary><form className="admin-bulk-form" onSubmit={save}><label>English name <small>Required</small><input value={draft.englishName} onChange={(event) => setDraft({ ...draft, englishName: event.target.value })} required /></label><label>Thai name <small>Optional</small><input lang="th" value={draft.thaiName} onChange={(event) => setDraft({ ...draft, thaiName: event.target.value })} /></label><label>Account created date<GregorianDateInput admin value={draft.accountCreatedDate} onChange={(value) => setDraft({ ...draft, accountCreatedDate: value })} required /></label><label>Joined dojo date<GregorianDateInput admin value={draft.dojoJoinedDate} onChange={(value) => setDraft({ ...draft, dojoJoinedDate: value })} required /></label><label>Student ID <small>Administrators may correct or replace this ID. The previous ID remains a lookup alias.</small><input value={draft.studentId} onChange={(event) => setDraft({ ...draft, studentId: event.target.value.toUpperCase() })} required /></label><label>Current kyu<select value={draft.rank} onChange={(event) => setDraft({ ...draft, rank: event.target.value })}>{RANKS.map((rank) => <option key={rank}>{rank}</option>)}</select></label><label>Dojo<select value={draft.dojoId} disabled={!superAdmin} onChange={(event) => setDraft({ ...draft, dojoId: event.target.value })}>{dojos.map((dojo) => <option key={dojo.id} value={dojo.id}>{dojo.official_name}</option>)}</select><small>{superAdmin ? "Changing this preserves a permanent dojo-history entry." : "Only the RenShinKan central administrator can transfer a student."}</small></label><label>AAT membership number<input maxLength={40} value={draft.aatNumber} onChange={(event) => setDraft({ ...draft, aatNumber: event.target.value })} placeholder="NEW" /></label><label>Last AAT annual payment date<GregorianDateInput admin value={draft.aatLastPaidDate} onChange={(value) => setDraft({ ...draft, aatLastPaidDate: value })} /></label><label>Practice duration<input value={draft.practiceDuration} onChange={(event) => setDraft({ ...draft, practiceDuration: event.target.value })} /></label><label>Administrator note <small>Private admin-only note. Only authorized administrators can see it; it is never shown to students or on public profiles.</small><textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label><footer><button className="btn-primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />} Save details</button></footer></form></details>;
}
