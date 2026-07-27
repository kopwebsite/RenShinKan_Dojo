import { Download, FileText, Languages } from "lucide-react";
import { useEffect, useState } from "react";
import { formatGregorianDate } from "../../shared/date";

type DownloadAsset = {
  slug: string;
  title_en: string;
  title_th: string;
  description_en: string;
  description_th: string;
  category_label: string;
  rank_label: string;
  language_label: string;
  file_kind: string;
  file_size: number | null;
  page_count: number | null;
  updated_at: string;
  url: string;
};

function sizeLabel(bytes: number | null) {
  if (!bytes) return "PDF";
  return `${(bytes / 1024).toFixed(bytes > 1024 * 100 ? 0 : 1)} KB`;
}

export function DownloadsPage() {
  const [downloads, setDownloads] = useState<DownloadAsset[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/downloads", { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as { downloads?: DownloadAsset[]; error?: string };
        if (!response.ok) throw new Error(body.error || "Downloads could not be loaded.");
        setDownloads(body.downloads || []);
      })
      .catch((reason) => {
        if ((reason as Error).name !== "AbortError") setError(reason instanceof Error ? reason.message : "Downloads could not be loaded.");
      });
    return () => controller.abort();
  }, []);

  return <section className="container-shell py-14 md:py-20">
    <header className="mx-auto max-w-3xl text-center">
      <p className="eyebrow">DOJO REFERENCE LIBRARY</p>
      <h1 className="mt-3 font-serif text-4xl text-ink md:text-6xl">Downloads</h1>
      <p className="mt-4 text-base leading-7 text-ink/70">Official bilingual forms and grading references for students and families.</p>
    </header>
    {error ? <p className="form-error mx-auto mt-10 max-w-2xl" role="alert">{error}</p> : null}
    {!error && !downloads.length ? <p className="mt-10 text-center" role="status">Loading downloads…</p> : null}
    <div className="mx-auto mt-10 grid max-w-5xl gap-5 md:grid-cols-2">
      {downloads.map((asset) => <article key={asset.slug} className="rounded-3xl border border-ink/10 bg-paper/80 p-6 shadow-line">
        <div className="flex items-start justify-between gap-4">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-bamboo/10 text-bamboo"><FileText aria-hidden="true" /></span>
          <span className="rounded-full border border-ink/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider">{asset.file_kind}</span>
        </div>
        <h2 className="mt-5 font-serif text-2xl text-ink">{asset.title_en}</h2>
        {asset.title_th ? <p className="mt-1 text-lg text-ink/75" lang="th">{asset.title_th}</p> : null}
        <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-bamboo">{asset.category_label}</p>
        <p className="mt-4 leading-7 text-ink/70">{asset.description_en}</p>
        {asset.description_th ? <p className="mt-2 leading-7 text-ink/65" lang="th">{asset.description_th}</p> : null}
        <dl className="mt-5 grid grid-cols-2 gap-3 border-y border-ink/10 py-4 text-sm">
          <div><dt className="text-ink/55">Language</dt><dd className="mt-1 flex items-center gap-1 font-semibold"><Languages size={15} aria-hidden="true" />{asset.language_label}</dd></div>
          <div><dt className="text-ink/55">File details</dt><dd className="mt-1 font-semibold">{asset.page_count || "—"} page{asset.page_count === 1 ? "" : "s"} · {sizeLabel(asset.file_size)}</dd></div>
          {asset.rank_label ? <div className="col-span-2"><dt className="text-ink/55">Rank or audience</dt><dd className="mt-1 font-semibold">{asset.rank_label}</dd></div> : null}
          <div className="col-span-2"><dt className="text-ink/55">Last updated</dt><dd className="mt-1 font-semibold">{formatGregorianDate(asset.updated_at, "Not recorded")}</dd></div>
        </dl>
        <a className="btn-primary mt-5 w-full justify-center" href={asset.url} target="_blank" rel="noopener noreferrer">
          <Download size={18} aria-hidden="true" /> Open or download PDF
        </a>
      </article>)}
    </div>
  </section>;
}
