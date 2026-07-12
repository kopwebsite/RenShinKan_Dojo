import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Archive, ArrowDown, ArrowLeft, ArrowUp, BadgePlus, CheckCircle2, ChevronLeft, ChevronRight,
  Clock3, Edit3, Eye, GraduationCap, ImagePlus, LoaderCircle, Lock, LogOut, Plus, Printer,
  QrCode, RotateCcw, Search, ShieldCheck, Trash2, Upload, UserRound, X,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import QRCodeLib from "qrcode";

type StudentSummary = {
  id: string; public_student_id: string; display_name: string; current_belt: string;
  profile_image_url: string | null; active: number; dojo_name: string; updated_at: string;
  total_hours: number; sharing_active: number;
};
type Student = StudentSummary & {
  belt_color: string; profile_image_consent: number; guardian_consent: number; public_visible: number;
  share_fields: string; admin_notes: string; training_hours_adjustment: number; created_at: string;
};
type Examination = {
  id: string; examination_date: string; belt_awarded: string; rank?: string | null; examiner?: string | null;
  public_notes?: string | null; internal_notes?: string | null;
};
type TrainingHour = {
  id: string; entry_date: string; period_end?: string | null; verified_hours: number;
  source?: string | null; internal_note?: string | null;
};
type Detail = { student: Student; examinations: Examination[]; trainingHours: TrainingHour[] };
type ListResponse = {
  students: StudentSummary[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  summary: { total: number; active: number; archived: number };
  dojos: string[]; ranks: string[]; suggestedStudentId: string;
};
type DrawerMode = "create" | "view" | "edit";
type SortKey = "name" | "studentId" | "rank" | "trainingHours" | "updated";
type Draft = {
  displayName: string; studentId: string; currentBelt: string; dojoName: string; currentTrainingHours: string;
  adminNotes: string; profileImageUrl: string | null; profileImageConsent: boolean; guardianConsent: boolean;
  publicVisible: boolean; active: boolean;
};

const DEFAULT_RANKS = ["Unranked", "10 Kyu", "9 Kyu", "8 Kyu", "7 Kyu", "6 Kyu", "5 Kyu", "4 Kyu", "3 Kyu", "2 Kyu", "1 Kyu", "SHO Dan-Ho", "1st Dan", "2nd Dan", "3rd Dan"];
const EMPTY_PAGINATION = { page: 1, pageSize: 20, total: 0, totalPages: 1 };
const EMPTY_SUMMARY = { total: 0, active: 0, archived: 0 };
const PROFILE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

async function jsonFetch<T = any>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
  });
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error || "Request failed");
  return body;
}

async function imageToWebp(file: File) {
  if (!PROFILE_TYPES.has(file.type)) throw new Error("Choose a JPEG, PNG, or WebP image.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Profile images must be 5 MB or smaller.");
  const bitmap = await createImageBitmap(file);
  const max = 1200;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser could not prepare the image.");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
    (value) => value ? resolve(value) : reject(new Error("Could not prepare image")), "image/webp", .84,
  ));
  return new File([blob], "profile.webp", { type: "image/webp" });
}

function blankDraft(studentId: string): Draft {
  return {
    displayName: "", studentId, currentBelt: "Unranked", dojoName: "RenShinKan Dojo",
    currentTrainingHours: "0", adminNotes: "", profileImageUrl: null, profileImageConsent: false,
    guardianConsent: false, publicVisible: true, active: true,
  };
}

function detailDraft(student: Student): Draft {
  return {
    displayName: student.display_name, studentId: student.public_student_id, currentBelt: student.current_belt,
    dojoName: student.dojo_name, currentTrainingHours: String(Number(student.total_hours || 0)),
    adminNotes: student.admin_notes || "", profileImageUrl: student.profile_image_url,
    profileImageConsent: Boolean(student.profile_image_consent), guardianConsent: Boolean(student.guardian_consent),
    publicVisible: Boolean(student.public_visible), active: Boolean(student.active),
  };
}

function formatDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(parsed);
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "RS";
}

function Avatar({ student, large = false }: { student: Pick<StudentSummary, "display_name" | "profile_image_url">; large?: boolean }) {
  return student.profile_image_url
    ? <img className={`admin-avatar${large ? " admin-avatar--large" : ""}`} src={student.profile_image_url} alt="" />
    : <span className={`admin-avatar admin-avatar--fallback${large ? " admin-avatar--large" : ""}`} aria-hidden="true">{initials(student.display_name)}</span>;
}

export function AdminStudentsPage() {
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [pagination, setPagination] = useState(EMPTY_PAGINATION);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [dojos, setDojos] = useState<string[]>([]);
  const [ranks, setRanks] = useState<string[]>(DEFAULT_RANKS);
  const [suggestedId, setSuggestedId] = useState("RSK-0001");
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [rankFilter, setRankFilter] = useState("");
  const [dojoFilter, setDojoFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [sort, setSort] = useState<SortKey>("name");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [drawer, setDrawer] = useState<DrawerMode | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [draft, setDraft] = useState<Draft>(blankDraft("RSK-0001"));
  const [studentIdEdited, setStudentIdEdited] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<StudentSummary | null>(null);
  const [shareUrl, setShareUrl] = useState("");
  const [qr, setQr] = useState("");
  const [exam, setExam] = useState({ date: "", belt: "", rank: "", examiner: "", publicNotes: "", internalNotes: "", updateCurrentBelt: true });
  const [hours, setHours] = useState({ date: "", periodEnd: "", hours: "", source: "", internalNote: "" });

  const allRanks = useMemo(() => Array.from(new Set([...DEFAULT_RANKS, ...ranks])).filter(Boolean), [ranks]);
  const filtersActive = Boolean(query || rankFilter || dojoFilter || statusFilter !== "active");

  async function loadStudents(targetPage = page) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(targetPage), pageSize: "20", status: statusFilter, sort, direction });
      if (query) params.set("query", query);
      if (rankFilter) params.set("rank", rankFilter);
      if (dojoFilter) params.set("dojo", dojoFilter);
      const body = await jsonFetch<ListResponse>(`/api/admin/students?${params}`);
      setStudents(body.students);
      setPagination(body.pagination);
      setSummary({ total: Number(body.summary.total || 0), active: Number(body.summary.active || 0), archived: Number(body.summary.archived || 0) });
      setDojos(body.dojos);
      setRanks(body.ranks);
      setSuggestedId(body.suggestedStudentId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load students");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetch("/api/admin/session", { cache: "no-store", credentials: "include" }).then(async (response) => {
      const body = await response.json() as { authenticated?: boolean };
      setAuthed(response.ok && body.authenticated === true);
      setChecked(true);
    }).catch(() => setChecked(true));
  }, []);

  useEffect(() => {
    if (authed) void loadStudents(page);
  }, [authed, page, query, rankFilter, dojoFilter, statusFilter, sort, direction]);

  useEffect(() => {
    if (!drawer && !deleteTarget) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (deleteTarget) setDeleteTarget(null);
        else setDrawer(null);
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [drawer, deleteTarget]);

  async function login(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await jsonFetch("/api/admin/login", { method: "POST", body: JSON.stringify({ password }) });
      setAuthed(true);
      setPassword("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign in failed");
    }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST", credentials: "include" });
    setAuthed(false);
    navigate("/admin");
  }

  function clearFilters() {
    setQueryInput(""); setQuery(""); setRankFilter(""); setDojoFilter(""); setStatusFilter("active"); setPage(1);
  }

  function changeSort(next: SortKey) {
    if (sort === next) setDirection((value) => value === "asc" ? "desc" : "asc");
    else { setSort(next); setDirection("asc"); }
    setPage(1);
  }

  function openCreate() {
    setDraft(blankDraft(suggestedId)); setStudentIdEdited(false); setDetail(null); setFieldErrors({}); setShareUrl(""); setQr(""); setDrawer("create");
  }

  async function openStudent(id: string, mode: "view" | "edit") {
    setDrawer(mode); setDetail(null); setDetailLoading(true); setFieldErrors({}); setShareUrl(""); setQr("");
    try {
      const body = await jsonFetch<Detail>(`/api/admin/students/${id}`);
      setDetail(body); setDraft(detailDraft(body.student)); setStudentIdEdited(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load student"); setDrawer(null);
    } finally { setDetailLoading(false); }
  }

  function validateDraft() {
    const errors: Record<string, string> = {};
    if (!draft.displayName.trim()) errors.displayName = "Student name is required.";
    if (!/^RSK-\d{4,}$/.test(draft.studentId.trim().toUpperCase())) errors.studentId = "Use the format RSK-0001.";
    if (!draft.currentBelt.trim()) errors.currentBelt = "Current kyu or dan rank is required.";
    if (!draft.dojoName.trim()) errors.dojoName = "Dojo is required.";
    const value = Number(draft.currentTrainingHours);
    if (!Number.isFinite(value) || value < 0) errors.currentTrainingHours = "Enter zero or a positive number.";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function saveStudent(event: FormEvent) {
    event.preventDefault();
    if (!validateDraft()) return;
    setSaving(true); setError("");
    const payload = {
      ...draft, studentId: draft.studentId.trim().toUpperCase(), currentTrainingHours: Number(draft.currentTrainingHours),
      manualStudentId: drawer === "create" ? studentIdEdited : true,
    };
    try {
      if (drawer === "create") {
        const body = await jsonFetch<{ id: string; studentId: string }>("/api/admin/students", { method: "POST", body: JSON.stringify(payload) });
        setNotice(`Student ${body.studentId} was created.`);
        setDrawer(null); setPage(1); await loadStudents(1); await openStudent(body.id, "view");
      } else if (detail) {
        await jsonFetch(`/api/admin/students/${detail.student.id}`, { method: "PUT", body: JSON.stringify(payload) });
        setNotice("Student record saved.");
        await loadStudents(); await openStudent(detail.student.id, "view");
      }
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Could not save the student";
      setError(message);
      if (message.toLowerCase().includes("student id")) setFieldErrors((value) => ({ ...value, studentId: message }));
    } finally { setSaving(false); }
  }

  async function uploadProfile(file?: File) {
    if (!file) return;
    setImageBusy(true); setError("");
    try {
      const webp = await imageToWebp(file);
      const form = new FormData(); form.append("file", webp);
      const response = await fetch("/api/admin/students/upload", { method: "POST", body: form, credentials: "include" });
      const body = await response.json() as { url?: string; error?: string };
      if (!response.ok || !body.url) throw new Error(body.error || "Could not upload image");
      setDraft((value) => ({ ...value, profileImageUrl: body.url!, profileImageConsent: true }));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not upload image"); }
    finally { setImageBusy(false); }
  }

  async function setArchived(student: StudentSummary, active: boolean) {
    setError("");
    try {
      await jsonFetch(`/api/admin/students/${student.id}`, { method: "PUT", body: JSON.stringify({ active }) });
      setNotice(`${student.display_name} was ${active ? "reactivated" : "archived"}.`);
      setStudents((items) => statusFilter === "all" ? items.map((item) => item.id === student.id ? { ...item, active: active ? 1 : 0 } : item) : items.filter((item) => item.id !== student.id));
      await loadStudents();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update status"); }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setSaving(true);
    try {
      await jsonFetch(`/api/admin/students/${target.id}`, { method: "DELETE" });
      setStudents((items) => items.filter((item) => item.id !== target.id));
      setDeleteTarget(null); setDrawer(null); setNotice(`${target.display_name} was permanently deleted.`);
      await loadStudents();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Deletion failed"); }
    finally { setSaving(false); }
  }

  async function refreshDetail() {
    if (!detail) return;
    const body = await jsonFetch<Detail>(`/api/admin/students/${detail.student.id}`);
    setDetail(body); setDraft(detailDraft(body.student)); await loadStudents();
  }

  async function addExam(event: FormEvent) {
    event.preventDefault(); if (!detail) return;
    try {
      await jsonFetch(`/api/admin/students/${detail.student.id}/exam`, { method: "POST", body: JSON.stringify(exam) });
      setExam({ date: "", belt: "", rank: "", examiner: "", publicNotes: "", internalNotes: "", updateCurrentBelt: true });
      setNotice("Examination recorded."); await refreshDetail();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not record examination"); }
  }

  async function addHours(event: FormEvent) {
    event.preventDefault(); if (!detail) return;
    try {
      await jsonFetch(`/api/admin/students/${detail.student.id}/hours`, { method: "POST", body: JSON.stringify(hours) });
      setHours({ date: "", periodEnd: "", hours: "", source: "", internalNote: "" });
      setNotice("Training hours added."); await refreshDetail();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not add hours"); }
  }

  async function generateShare() {
    if (!detail) return;
    const body = await jsonFetch<{ url: string }>(`/api/admin/students/${detail.student.id}/share`, { method: "POST" });
    setShareUrl(body.url); setQr(await QRCodeLib.toDataURL(body.url, { width: 420, margin: 2 }));
    setNotice("A new share link was generated; the previous link is revoked."); await refreshDetail();
  }

  async function revokeShare() {
    if (!detail || !window.confirm("Revoke the current public share link? Printed QR codes will stop working.")) return;
    await jsonFetch(`/api/admin/students/${detail.student.id}/share`, { method: "DELETE" });
    setShareUrl(""); setQr(""); setNotice("Public sharing was revoked."); await refreshDetail();
  }

  function sortButton(label: string, key: SortKey) {
    return <button type="button" className="admin-sort" onClick={() => changeSort(key)} aria-label={`Sort by ${label}`}>
      {label}{sort === key ? direction === "asc" ? <ArrowUp size={13} /> : <ArrowDown size={13} /> : null}
    </button>;
  }

  if (!checked) return <section className="container-shell admin-loading" aria-live="polite"><LoaderCircle className="spin" /> Checking the secure session…</section>;
  if (!authed) return <section className="container-shell admin-login"><form onSubmit={login}><Lock size={24} /><p className="eyebrow">Admin</p><h1>Student management</h1><p>Sign in to access private student records.</p><label htmlFor="student-admin-password">Password<input id="student-admin-password" className="input-field" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>{error ? <p className="form-error" role="alert">{error}</p> : null}<button className="btn-primary">Sign in</button></form></section>;

  return <section className="container-shell student-admin student-admin--table">
    <header className="student-admin__header">
      <div><p className="eyebrow">Admin · Student records</p><h1>Student management</h1><p>Search, update, archive, and securely manage training records.</p></div>
      <div className="admin-header-actions"><Link to="/admin" className="btn-secondary"><ArrowLeft size={16} /> Admin home</Link><Link to="/" className="btn-secondary">Public website</Link><button type="button" onClick={logout} className="btn-secondary"><LogOut size={16} /> Log out</button><button type="button" onClick={openCreate} className="btn-primary"><Plus size={17} /> Add student</button></div>
    </header>

    <div className="admin-summary" aria-label="Student summary">
      <div><strong>{summary.active}</strong><span>Active students</span></div><div><strong>{summary.archived}</strong><span>Archived</span></div><div><strong>{summary.total}</strong><span>Total records</span></div>
    </div>
    {notice ? <p className="admin-notice" role="status"><CheckCircle2 size={18} />{notice}<button type="button" onClick={() => setNotice("")} aria-label="Dismiss message"><X size={16} /></button></p> : null}
    {error ? <p className="form-error admin-page-error" role="alert">{error}<button type="button" onClick={() => setError("")} aria-label="Dismiss error"><X size={16} /></button></p> : null}

    <section className="admin-student-controls" aria-label="Student search and filters">
      <form className="admin-search-wide" onSubmit={(event) => { event.preventDefault(); setQuery(queryInput.trim()); setPage(1); }}><label htmlFor="admin-student-search">Search students</label><div><Search size={17} /><input id="admin-student-search" value={queryInput} onChange={(event) => setQueryInput(event.target.value)} placeholder="Name or Student ID" /><button type="submit" className="btn-secondary">Search</button></div></form>
      <label>Rank<select value={rankFilter} onChange={(event) => { setRankFilter(event.target.value); setPage(1); }}><option value="">All ranks</option>{allRanks.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>Dojo<select value={dojoFilter} onChange={(event) => { setDojoFilter(event.target.value); setPage(1); }}><option value="">All dojos</option>{dojos.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>Status<select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}><option value="active">Active</option><option value="archived">Archived</option><option value="all">All</option></select></label>
      <button type="button" className="btn-secondary admin-clear" onClick={clearFilters} disabled={!filtersActive}><RotateCcw size={15} /> Clear filters</button>
    </section>

    <section className="admin-table-section" aria-busy={loading}>
      <div className="admin-table-meta"><p>{pagination.total} student{pagination.total === 1 ? "" : "s"}</p>{loading ? <span><LoaderCircle className="spin" size={16} /> Loading</span> : null}</div>
      <div className="admin-table-scroll">
        <table className="admin-student-table">
          <thead><tr><th scope="col">Profile</th><th scope="col">{sortButton("Student name", "name")}</th><th scope="col">{sortButton("Student ID", "studentId")}</th><th scope="col">Dojo</th><th scope="col">{sortButton("Current rank", "rank")}</th><th scope="col">{sortButton("Training hours", "trainingHours")}</th><th scope="col">Status</th><th scope="col">{sortButton("Last updated", "updated")}</th><th scope="col" className="admin-actions-column">Actions</th></tr></thead>
          <tbody>{students.map((student) => <tr key={student.id}>
            <td><Avatar student={student} /></td><th scope="row">{student.display_name}</th><td><code>{student.public_student_id}</code></td><td>{student.dojo_name}</td><td>{student.current_belt}</td><td>{Number(student.total_hours || 0).toLocaleString()} hr</td><td><span className={`admin-status ${student.active ? "is-active" : "is-archived"}`}>{student.active ? "Active" : "Archived"}</span></td><td>{formatDate(student.updated_at)}</td>
            <td><div className="admin-row-actions"><button type="button" onClick={() => openStudent(student.id, "view")}><Eye size={14} /> View</button><button type="button" onClick={() => openStudent(student.id, "edit")}><Edit3 size={14} /> Edit</button>{student.active ? <button type="button" onClick={() => setArchived(student, false)}><Archive size={14} /> Archive</button> : <button type="button" onClick={() => setArchived(student, true)}><RotateCcw size={14} /> Reactivate</button>}<button type="button" className="is-danger" onClick={() => setDeleteTarget(student)}><Trash2 size={14} /> Delete</button></div></td>
          </tr>)}</tbody>
        </table>
      </div>
      {!loading && students.length === 0 ? <div className="admin-empty"><UserRound size={32} /><h2>No students found</h2><p>{filtersActive ? "Clear or change the filters to see other records." : "Create the first student record to get started."}</p>{filtersActive ? <button className="btn-secondary" onClick={clearFilters}>Clear filters</button> : <button className="btn-primary" onClick={openCreate}><Plus size={16} /> Add student</button>}</div> : null}
      <nav className="admin-pagination" aria-label="Student pages"><button type="button" className="btn-secondary" disabled={pagination.page <= 1 || loading} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={16} /> Previous</button><span>Page {pagination.page} of {pagination.totalPages}</span><button type="button" className="btn-secondary" disabled={pagination.page >= pagination.totalPages || loading} onClick={() => setPage((value) => value + 1)}>Next <ChevronRight size={16} /></button></nav>
    </section>

    {drawer ? <div className="admin-drawer-backdrop" role="presentation"><section className="admin-drawer" role="dialog" aria-modal="true" aria-labelledby="student-drawer-title"><header><div><p className="eyebrow">{drawer === "create" ? "New student" : drawer === "edit" ? "Edit student" : "Student record"}</p><h2 id="student-drawer-title">{drawer === "create" ? "Create student" : detail?.student.display_name || "Loading…"}</h2></div><button type="button" className="admin-icon-button" onClick={() => setDrawer(null)} aria-label="Close student panel"><X /></button></header>
      <div className="admin-drawer__body">{detailLoading ? <div className="admin-drawer-loading"><LoaderCircle className="spin" /> Loading student record…</div> : drawer === "view" && detail ? <>
        <div className="admin-profile-heading"><Avatar student={detail.student} large /><div><h3>{detail.student.display_name}</h3><p><code>{detail.student.public_student_id}</code> · {detail.student.current_belt}</p><span className={`admin-status ${detail.student.active ? "is-active" : "is-archived"}`}>{detail.student.active ? "Active" : "Archived"}</span></div></div>
        <dl className="admin-detail-grid"><div><dt>Dojo</dt><dd>{detail.student.dojo_name}</dd></div><div><dt>Accumulated training</dt><dd>{Number(detail.student.total_hours || 0).toLocaleString()} hours</dd></div><div><dt>Private lookup</dt><dd>{detail.student.public_visible && detail.student.active ? "Enabled" : "Disabled"}</dd></div><div><dt>Guardian consent</dt><dd>{detail.student.guardian_consent ? "Recorded" : "Not recorded"}</dd></div><div><dt>Photo consent</dt><dd>{detail.student.profile_image_consent ? "Recorded" : "Not recorded"}</dd></div><div><dt>Last updated</dt><dd>{formatDate(detail.student.updated_at)}</dd></div></dl>
        <section className="admin-private-notes"><h3>Additional information <span>Admin only</span></h3><p>{detail.student.admin_notes || "No additional information recorded."}</p></section>
        <RecordHistory detail={detail} />
        <ShareManager detail={detail} shareUrl={shareUrl} qr={qr} generateShare={generateShare} revokeShare={revokeShare} />
      </> : <><form onSubmit={saveStudent} className="student-form" noValidate>
        <div className="admin-profile-editor"><div>{draft.profileImageUrl ? <img src={draft.profileImageUrl} alt="Profile preview" /> : <span>{initials(draft.displayName)}</span>}</div><div><label className="btn-secondary admin-upload-button"><Upload size={16} /> {draft.profileImageUrl ? "Replace image" : "Add profile image"}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => uploadProfile(event.target.files?.[0])} disabled={imageBusy} /></label>{draft.profileImageUrl ? <button type="button" className="text-link is-danger" onClick={() => setDraft((value) => ({ ...value, profileImageUrl: null, profileImageConsent: false }))}><Trash2 size={14} /> Remove image</button> : null}<small>JPEG, PNG, or WebP up to 5 MB. Images are cropped without stretching.</small>{imageBusy ? <span><LoaderCircle className="spin" size={15} /> Uploading…</span> : null}</div></div>
        <div className="student-form-grid"><Field label="Student name / display and verification name" error={fieldErrors.displayName}><input value={draft.displayName} onChange={(event) => setDraft({ ...draft, displayName: event.target.value })} maxLength={120} /></Field><Field label="Student ID" hint={drawer === "create" && !studentIdEdited ? "Generated automatically; you may edit it before saving." : "Required format: RSK-0001"} error={fieldErrors.studentId}><input value={draft.studentId} onChange={(event) => { setDraft({ ...draft, studentId: event.target.value.toUpperCase() }); setStudentIdEdited(event.target.value.toUpperCase() !== suggestedId); }} maxLength={40} /></Field><Field label="Current kyu or dan rank" error={fieldErrors.currentBelt}><input list="student-rank-options" value={draft.currentBelt} onChange={(event) => setDraft({ ...draft, currentBelt: event.target.value })} maxLength={80} /><datalist id="student-rank-options">{allRanks.map((item) => <option key={item} value={item} />)}</datalist></Field><Field label="Dojo" error={fieldErrors.dojoName}><input list="student-dojo-options" value={draft.dojoName} onChange={(event) => setDraft({ ...draft, dojoName: event.target.value })} maxLength={120} /><datalist id="student-dojo-options">{dojos.map((item) => <option key={item} value={item} />)}</datalist></Field><Field label="Current accumulated training hours" hint="Hours" error={fieldErrors.currentTrainingHours}><input type="number" min="0" step="0.25" value={draft.currentTrainingHours} onChange={(event) => setDraft({ ...draft, currentTrainingHours: event.target.value })} /></Field><label className="admin-span-2">Additional information <span className="admin-private-label">Admin only</span><textarea value={draft.adminNotes} onChange={(event) => setDraft({ ...draft, adminNotes: event.target.value })} maxLength={5000} rows={5} /></label></div>
        <fieldset className="student-form-checks"><legend>Privacy and status</legend><label><input type="checkbox" checked={draft.profileImageConsent} onChange={(event) => setDraft({ ...draft, profileImageConsent: event.target.checked })} /> Profile image consent recorded</label><label><input type="checkbox" checked={draft.guardianConsent} onChange={(event) => setDraft({ ...draft, guardianConsent: event.target.checked })} /> Guardian consent recorded</label><label><input type="checkbox" checked={draft.publicVisible} onChange={(event) => setDraft({ ...draft, publicVisible: event.target.checked })} /> Allow private Student ID + name lookup</label><label><input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} /> Active student</label></fieldset>
        <div className="admin-drawer-actions"><button type="button" className="btn-secondary" onClick={() => setDrawer(null)}>Cancel</button><button type="submit" className="btn-primary" disabled={saving || imageBusy}>{saving ? <LoaderCircle className="spin" size={16} /> : <ShieldCheck size={16} />} {drawer === "create" ? "Create student" : "Save changes"}</button></div></form>
        {drawer === "edit" && detail ? <div className="admin-record-entry-grid"><details><summary><GraduationCap size={18} /> Record examination</summary><form onSubmit={addExam}><Field label="Date"><input type="date" required value={exam.date} onChange={(event) => setExam({ ...exam, date: event.target.value })} /></Field><Field label="Belt or rank"><input list="student-rank-options" required value={exam.belt} onChange={(event) => setExam({ ...exam, belt: event.target.value })} /></Field><Field label="Examiner"><input value={exam.examiner} onChange={(event) => setExam({ ...exam, examiner: event.target.value })} /></Field><Field label="Public note"><textarea value={exam.publicNotes} onChange={(event) => setExam({ ...exam, publicNotes: event.target.value })} /></Field><Field label="Internal note (admin only)"><textarea value={exam.internalNotes} onChange={(event) => setExam({ ...exam, internalNotes: event.target.value })} /></Field><label><input type="checkbox" checked={exam.updateCurrentBelt} onChange={(event) => setExam({ ...exam, updateCurrentBelt: event.target.checked })} /> Update current rank</label><button className="btn-primary"><BadgePlus size={15} /> Save examination</button></form></details><details><summary><Clock3 size={18} /> Add training hours</summary><form onSubmit={addHours}><Field label="Date"><input type="date" required value={hours.date} onChange={(event) => setHours({ ...hours, date: event.target.value })} /></Field><Field label="Period end"><input type="date" value={hours.periodEnd} onChange={(event) => setHours({ ...hours, periodEnd: event.target.value })} /></Field><Field label="Verified hours"><input type="number" min="0.01" max="1000" step="0.25" required value={hours.hours} onChange={(event) => setHours({ ...hours, hours: event.target.value })} /></Field><Field label="Source"><input value={hours.source} onChange={(event) => setHours({ ...hours, source: event.target.value })} /></Field><Field label="Internal explanation"><textarea value={hours.internalNote} onChange={(event) => setHours({ ...hours, internalNote: event.target.value })} /></Field><button className="btn-primary"><Clock3 size={15} /> Add hours</button></form></details></div> : null}
      </>}</div>
      {drawer === "view" && detail ? <footer><button className="btn-secondary" onClick={() => setDrawer("edit")}><Edit3 size={15} /> Edit</button>{detail.student.active ? <button className="btn-secondary" onClick={() => { setArchived(detail.student, false); setDrawer(null); }}><Archive size={15} /> Archive</button> : <button className="btn-secondary" onClick={() => { setArchived(detail.student, true); setDrawer(null); }}><RotateCcw size={15} /> Reactivate</button>}<button className="btn-secondary is-danger" onClick={() => setDeleteTarget(detail.student)}><Trash2 size={15} /> Delete</button></footer> : null}
    </section></div> : null}

    {deleteTarget ? <div className="admin-confirm-backdrop"><section className="admin-confirm" role="alertdialog" aria-modal="true" aria-labelledby="delete-title" aria-describedby="delete-copy"><div className="admin-confirm__icon"><Trash2 /></div><h2 id="delete-title">Permanently delete this student?</h2><p id="delete-copy"><strong>{deleteTarget.display_name} ({deleteTarget.public_student_id})</strong> and all related training hours, examinations, and share links will be permanently deleted. This cannot be undone.</p><div><button className="btn-secondary" onClick={() => setDeleteTarget(null)} disabled={saving}>Cancel</button><button className="btn-primary is-danger" onClick={confirmDelete} disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} /> : <Trash2 size={16} />} Permanently delete</button></div></section></div> : null}
  </section>;
}

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return <label>{label}{children}{hint ? <small>{hint}</small> : null}{error ? <span className="field-error">{error}</span> : null}</label>;
}

function RecordHistory({ detail }: { detail: Detail }) {
  return <div className="admin-history-grid"><section><h3>Training history</h3>{detail.trainingHours.length ? <ol>{detail.trainingHours.map((entry) => <li key={entry.id}><strong>{Number(entry.verified_hours).toLocaleString()} hours</strong><time>{formatDate(entry.entry_date)}</time>{entry.source ? <span>{entry.source}</span> : null}{entry.internal_note ? <p><ShieldCheck size={13} /> {entry.internal_note}</p> : null}</li>)}</ol> : <p>No individual training-hour entries.</p>}</section><section><h3>Examination history</h3>{detail.examinations.length ? <ol>{detail.examinations.map((entry) => <li key={entry.id}><strong>{entry.belt_awarded}{entry.rank ? ` · ${entry.rank}` : ""}</strong><time>{formatDate(entry.examination_date)}</time>{entry.examiner ? <span>Examiner: {entry.examiner}</span> : null}{entry.internal_notes ? <p><ShieldCheck size={13} /> {entry.internal_notes}</p> : null}</li>)}</ol> : <p>No examinations recorded.</p>}</section></div>;
}

function ShareManager({ detail, shareUrl, qr, generateShare, revokeShare }: { detail: Detail; shareUrl: string; qr: string; generateShare: () => void; revokeShare: () => void }) {
  return <section className="share-manager admin-share-manager"><header><QrCode size={21} /><div><h3>Revocable QR sharing</h3><p>The QR contains no name, Student ID, or database identifier.</p></div></header><div className="admin-inline-actions"><button className="btn-secondary" onClick={generateShare}>{detail.student.sharing_active ? "Regenerate share link" : "Generate share link"}</button>{detail.student.sharing_active ? <button className="text-link is-danger" onClick={revokeShare}>Revoke link</button> : null}</div>{shareUrl ? <div className="share-manager__result">{qr ? <img src={qr} alt="Student share QR code" /> : null}<div><label>Share URL<input readOnly value={shareUrl} onFocus={(event) => event.currentTarget.select()} /></label><button className="text-link" onClick={() => window.print()}><Printer size={15} /> Print QR</button><a className="text-link" href={shareUrl} target="_blank" rel="noopener noreferrer">Preview record</a></div></div> : null}</section>;
}
