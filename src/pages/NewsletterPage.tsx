import { ArrowLeft, ArrowRight, Languages, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { EventBodyRenderer } from "../components/EventBodyRenderer";
import { NewsletterSignup } from "../components/NewsletterSignup";
import { MotionSection } from "../components/MotionSection";
import { ResponsiveImage } from "../components/ResponsiveImage";
import { useTranslation, type Language } from "../i18n";
import { getPublishedRecentEvents, useEditableContent } from "../lib/content";
import { assetPath } from "../utils/assetPath";

const googleTranslateTarget: Record<Language, string> = { en: "en", th: "th", "zh-CN": "zh-CN", ja: "ja" };

function formatDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long", year: "numeric" }).format(date);
}

function categoryFor(title: string) {
  const value = title.toLowerCase();
  if (value.includes("belt") || value.includes("exam")) return "Belt examinations";
  if (value.includes("workshop") || value.includes("seminar")) return "Workshops";
  if (value.includes("visit")) return "Visiting instructors";
  return "Dojo news";
}

export function NewsletterPage() {
  const { language, t } = useTranslation();
  const { slug } = useParams();
  const { content } = useEditableContent();
  const updates = useMemo(() => getPublishedRecentEvents(content), [content]);
  const [query, setQuery] = useState("");
  const article = slug ? updates.find((item) => item.slug === slug) : undefined;
  const filtered = updates.filter((item) => `${item.title} ${item.summary} ${item.body}`.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    if (!article) return;
    const canonical = `https://renshinkandojo.org/newsletter/${article.slug}`;
    document.title = `${article.title} | RenShinKan Dojo Journal`;
    document.querySelector('meta[property="og:title"]')?.setAttribute("content", article.title);
    document.querySelector('meta[property="og:description"]')?.setAttribute("content", article.summary);
    document.querySelector('meta[property="og:type"]')?.setAttribute("content", "article");
    document.querySelector('meta[property="og:url"]')?.setAttribute("content", canonical);
    const image = article.image?.src || article.media?.find((item) => item.type === "image")?.src;
    if (image) document.querySelector('meta[property="og:image"]')?.setAttribute("content", new URL(image, canonical).href);
    const script = document.createElement("script");
    script.id = "journal-article-schema";
    script.type = "application/ld+json";
    script.textContent = JSON.stringify({ "@context": "https://schema.org", "@type": "BlogPosting", headline: article.title, description: article.summary, datePublished: article.date, dateModified: article.updatedAt, author: { "@type": "Organization", name: "RenShinKan Dojo" }, mainEntityOfPage: canonical, image: image ? new URL(image, canonical).href : undefined });
    document.head.appendChild(script);
    return () => { script.remove(); document.querySelector('meta[property="og:type"]')?.setAttribute("content", "website"); };
  }, [article]);

  if (slug) {
    if (!article) {
      return <section className="container-shell journal-empty-page"><p className="eyebrow">Dojo journal</p><h1>That journal entry is not available.</h1><Link to="/newsletter" className="text-link"><ArrowLeft size={16} /> Return to the archive</Link></section>;
    }
    const media = article.media?.length ? article.media : article.image ? [article.image] : [];
    const translateText = [article.title, article.summary, article.body].join("\n\n");
    const translateUrl = `https://translate.google.com/?${new URLSearchParams({ sl: "auto", tl: googleTranslateTarget[language], text: translateText, op: "translate" })}`;
    const index = updates.findIndex((item) => item.id === article.id);
    return (
      <article className="journal-entry">
        <header className="container-shell journal-entry__header">
          <Link to="/newsletter" className="text-link"><ArrowLeft size={16} /> Journal archive</Link>
          <p className="folio-mark">{categoryFor(article.title)} · {formatDate(article.date)}</p>
          <h1>{article.title}</h1>
          <p className="journal-entry__dek">{article.summary}</p>
          <div className="journal-entry__byline"><span>RenShinKan Dojo</span><a href={translateUrl} target="_blank" rel="noopener noreferrer"><Languages size={15} /> Translate</a></div>
        </header>
        <div className="container-shell journal-entry__body">
          <EventBodyRenderer body={article.body} media={media} fallbackTitle={article.title} />
        </div>
        <nav className="container-shell journal-entry__nav" aria-label="Journal entry navigation">
          {updates[index + 1] ? <Link to={`/newsletter/${updates[index + 1].slug}`}><ArrowLeft size={16} /> Older<br /><strong>{updates[index + 1].title}</strong></Link> : <span />}
          {updates[index - 1] ? <Link to={`/newsletter/${updates[index - 1].slug}`}>Newer <ArrowRight size={16} /><br /><strong>{updates[index - 1].title}</strong></Link> : null}
        </nav>
      </article>
    );
  }

  const featured = filtered[0];
  return (
    <>
      <MotionSection className="container-shell journal-opening">
        <div><p className="folio-mark">RenShinKan journal · Archive</p><p className="eyebrow">{t("newsletter.intro.eyebrow")}</p><h1>Notes from the dojo.</h1><p>{t("newsletter.intro.copy")}</p></div>
        <label className="journal-search"><Search size={17} aria-hidden="true" /><span className="sr-only">Search the journal</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search articles" /></label>
      </MotionSection>
      <MotionSection className="container-shell journal-archive">
        {featured ? (
          <article className="journal-archive__featured">
            <ResponsiveImage src={featured.image?.src || featured.media?.find((item) => item.type === "image")?.src || assetPath("/dojo-photos/aikido-hero-new.webp")} alt={featured.image?.alt || featured.title} imgClassName="h-full w-full object-cover" loading="eager" />
            <div><p className="folio-mark">Featured · {formatDate(featured.date)}</p><h2>{featured.title}</h2><p>{featured.summary}</p><Link to={`/newsletter/${featured.slug}`} className="text-link">Read the entry <ArrowRight size={16} /></Link></div>
          </article>
        ) : <div className="journal-empty"><h2>The journal is quiet for now.</h2><p>New dojo notes, examinations and workshop announcements will be published here.</p></div>}
        {filtered.length > 1 ? <div className="journal-index"><h2>Previous entries</h2><ol>{filtered.slice(1).map((item, index) => <li key={item.id}><span>{String(index + 1).padStart(2, "0")}</span><time>{formatDate(item.date)}</time><div><p>{categoryFor(item.title)}</p><h3><Link to={`/newsletter/${item.slug}`}>{item.title}</Link></h3><p>{item.summary}</p></div></li>)}</ol></div> : null}
      </MotionSection>
      <MotionSection id="newsletter-signup" className="container-shell journal-signup scroll-mt-24"><NewsletterSignup idPrefix="journal-newsletter" /></MotionSection>
    </>
  );
}
