import { Archive, FilePlus2, LoaderCircle, RefreshCw, Save, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { adminApi } from "../components/admin/adminApi";
import "./AdminDownloadsPage.css";

type AdminDownload = {
  id: string;
  slug: string;
  title_en: string;
  title_th: string;
  description_en: string;
  description_th: string;
  category_label: string;
  rank_label: string;
  file_size: number | null;
  page_count: number | null;
  published: number;
  sort_order: number;
  updated_at: string;
};

export function AdminDownloadsPage() {
  const [downloads, setDownloads] = useState<AdminDownload[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });

  async function load() {
    setError("");
    try {
      const result = await adminApi<{ downloads: AdminDownload[]; pagination: { page: number; total: number; totalPages: number } }>(`/api/admin/downloads?page=${page}`);
      setDownloads(result.downloads);
      setPagination(result.pagination);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Downloads could not be loaded.");
    }
  }
  useEffect(() => { void load(); }, [page]);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("upload"); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/downloads", {
        method: "POST", credentials: "include", body: new FormData(event.currentTarget),
        headers: { "X-Request-ID": crypto.randomUUID() },
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "The PDF could not be uploaded.");
      event.currentTarget.reset();
      setNotice("PDF uploaded as a private draft. Review its metadata, then publish it.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The PDF could not be uploaded.");
    } finally { setBusy(""); }
  }

  function patch(id: string, values: Partial<AdminDownload>) {
    setDownloads((current) => current.map((item) => item.id === id ? { ...item, ...values } : item));
  }

  async function save(item: AdminDownload) {
    setBusy(item.id); setError(""); setNotice("");
    try {
      await adminApi("/api/admin/downloads", {
        method: "PATCH",
        body: JSON.stringify({
          id: item.id, titleEn: item.title_en, titleTh: item.title_th,
          descriptionEn: item.description_en, descriptionTh: item.description_th,
          categoryLabel: item.category_label, rankLabel: item.rank_label,
          published: Boolean(item.published), sortOrder: item.sort_order,
        }),
      });
      setNotice(`${item.title_en} saved${item.published ? " and published" : " as a private draft"}.`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The download could not be saved.");
    } finally { setBusy(""); }
  }

  async function replaceFile(event: FormEvent<HTMLFormElement>, item: AdminDownload) {
    event.preventDefault();
    setBusy(`replace:${item.id}`); setError(""); setNotice("");
    try {
      const formData = new FormData(event.currentTarget);
      formData.set("id", item.id);
      const response = await fetch("/api/admin/downloads", {
        method: "PUT", credentials: "include", body: formData,
        headers: { "X-Request-ID": crypto.randomUUID() },
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "The replacement PDF could not be uploaded.");
      event.currentTarget.reset();
      setNotice(`${item.title_en} now uses the replacement PDF.`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The replacement PDF could not be uploaded.");
    } finally { setBusy(""); }
  }

  async function retire(item: AdminDownload, mode: "archive" | "delete") {
    const message = mode === "archive"
      ? `Archive ${item.title_en}? It will be unpublished but can be edited and published again.`
      : `Delete ${item.title_en} from download management? Its stored file will be retained for recovery and the action will be audited.`;
    if (!window.confirm(message)) return;
    setBusy(`${mode}:${item.id}`); setError(""); setNotice("");
    try {
      await adminApi("/api/admin/downloads", {
        method: "DELETE",
        body: JSON.stringify({ id: item.id, mode }),
      });
      setNotice(mode === "archive"
        ? `${item.title_en} was archived and removed from the public page.`
        : `${item.title_en} metadata was deleted. Its stored file was retained for recovery.`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The download could not be archived or deleted.");
    } finally { setBusy(""); }
  }

  return <section className="student-admin container-shell py-10">
    <header className="student-admin__header"><div><p className="eyebrow">WEBSITE / DOWNLOADS</p><h1>Downloads</h1><p>Upload PDFs, maintain bilingual labels, and control what appears in the public reference library.</p></div><a className="btn-secondary" href="/downloads" target="_blank" rel="noreferrer">View public page</a></header>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {notice ? <p className="admin-notice" role="status">{notice}</p> : null}
    <form className="admin-download-upload" onSubmit={upload}>
      <header><div><h2><FilePlus2 size={20} aria-hidden="true" /> Upload a new PDF</h2><p>Create a private draft first. You can review and publish it below.</p></div><span>Step 1 of 2 · Draft</span></header>
      <fieldset><legend>Document identity</legend><div>
        <label><span>English title <b>Required</b></span><input name="titleEn" required maxLength={160} placeholder="AAT grading requirements" /></label>
        <label><span>Thai title <b>Optional</b></span><input name="titleTh" lang="th" maxLength={160} /></label>
        <label><span>URL slug <b>Required</b></span><input name="slug" required pattern="[a-z0-9-]+" placeholder="grading-requirements-2026" /><small>Lowercase letters, numbers, and hyphens only.</small></label>
        <label><span>Page count <b>Required</b></span><input name="pageCount" required type="number" min={1} max={999} placeholder="1" /></label>
      </div></fieldset>
      <fieldset><legend>Public labels</legend><div>
        <label><span>Category <b>Required</b></span><input name="categoryLabel" required maxLength={120} placeholder="Examination forms and syllabi" /></label>
        <label><span>Rank or audience <b>Optional</b></span><input name="rankLabel" maxLength={120} placeholder="Kyu and Dan ranks" /></label>
        <label className="is-wide"><span>English description <b>Optional</b></span><textarea name="descriptionEn" maxLength={600} placeholder="Explain what the PDF contains and who should use it." /></label>
        <label className="is-wide"><span>Thai description <b>Optional</b></span><textarea name="descriptionTh" lang="th" maxLength={600} /></label>
      </div></fieldset>
      <fieldset><legend>PDF file</legend><label className="admin-download-file"><FilePlus2 aria-hidden="true" /><span><strong>Choose a PDF</strong><small>PDF only · maximum 20 MB</small></span><input name="file" type="file" accept="application/pdf,.pdf" required /></label></fieldset>
      <footer><p>The document stays private until you publish it in Step 2.</p><button className="btn-primary" disabled={Boolean(busy)}>{busy === "upload" ? <LoaderCircle className="spin" aria-hidden="true" /> : <FilePlus2 aria-hidden="true" />} Create private draft</button></footer>
    </form>
    <div className="mt-7 grid gap-5">
      {downloads.map((item) => <article key={item.id} className="rounded-3xl bg-paper/75 p-6 ring-1 ring-ink/10">
        <div className="grid gap-4 md:grid-cols-2">
          <label>English title<input value={item.title_en} onChange={(event) => patch(item.id, { title_en: event.target.value })} /></label>
          <label>Thai title<input lang="th" value={item.title_th} onChange={(event) => patch(item.id, { title_th: event.target.value })} /></label>
          <label>Category<input required value={item.category_label} onChange={(event) => patch(item.id, { category_label: event.target.value })} /></label>
          <label>Rank or audience (optional)<input value={item.rank_label} onChange={(event) => patch(item.id, { rank_label: event.target.value })} /></label>
          <label className="md:col-span-2">English description<textarea value={item.description_en} onChange={(event) => patch(item.id, { description_en: event.target.value })} /></label>
          <label className="md:col-span-2">Thai description<textarea lang="th" value={item.description_th} onChange={(event) => patch(item.id, { description_th: event.target.value })} /></label>
          <label>Display order<input type="number" min={0} value={item.sort_order} onChange={(event) => patch(item.id, { sort_order: Number(event.target.value) })} /></label>
          <label className="flex-row items-center gap-3 self-end"><input type="checkbox" checked={Boolean(item.published)} onChange={(event) => patch(item.id, { published: event.target.checked ? 1 : 0 })} /> Published on Downloads page</label>
        </div>
        <p className="admin-help mt-4">{item.slug} · {item.page_count || "—"} page(s) · {item.file_size ? `${Math.round(item.file_size / 1024)} KB` : "size unavailable"}</p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <button type="button" className="btn-primary" disabled={Boolean(busy)} onClick={() => void save(item)}>
            {busy === item.id ? <LoaderCircle className="spin" aria-hidden="true" /> : <Save aria-hidden="true" />} Save metadata
          </button>
          <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => void replaceFile(event, item)}>
            <label>Replacement PDF<input name="file" type="file" accept="application/pdf,.pdf" required /></label>
            <label>Page count<input name="pageCount" type="number" min={1} max={999} defaultValue={item.page_count || 1} required /></label>
            <button className="btn-secondary" disabled={Boolean(busy)}>
              {busy === `replace:${item.id}` ? <LoaderCircle className="spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />} Replace file
            </button>
          </form>
          <button type="button" className="btn-secondary" disabled={Boolean(busy) || !item.published} onClick={() => void retire(item, "archive")}>
            {busy === `archive:${item.id}` ? <LoaderCircle className="spin" aria-hidden="true" /> : <Archive aria-hidden="true" />} Archive
          </button>
          <button type="button" className="btn-secondary danger" disabled={Boolean(busy)} onClick={() => void retire(item, "delete")}>
            {busy === `delete:${item.id}` ? <LoaderCircle className="spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />} Delete metadata
          </button>
        </div>
      </article>)}
    </div>
    {pagination.totalPages > 1 ? (
      <nav className="mt-7 flex items-center justify-center gap-4" aria-label="Download management pages">
        <button type="button" className="btn-secondary" disabled={pagination.page <= 1 || Boolean(busy)} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button>
        <span role="status">Page {pagination.page} of {pagination.totalPages} · {pagination.total} downloads</span>
        <button type="button" className="btn-secondary" disabled={pagination.page >= pagination.totalPages || Boolean(busy)} onClick={() => setPage((current) => current + 1)}>Next</button>
      </nav>
    ) : null}
  </section>;
}
