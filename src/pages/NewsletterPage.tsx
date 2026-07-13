import { ArrowLeft, ArrowRight, Languages, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { EventBodyRenderer } from "../components/EventBodyRenderer";
import { NewsletterSignup } from "../components/NewsletterSignup";
import { MotionSection } from "../components/MotionSection";
import { ResponsiveImage } from "../components/ResponsiveImage";
import { useTranslation, type Language, type TranslationKey } from "../i18n";
import { getPublishedRecentEvents, useEditableContent } from "../lib/content";
import { assetPath } from "../utils/assetPath";

const googleTranslateTarget: Record<Language, string> = { en: "en", th: "th", "zh-CN": "zh-CN", ja: "ja" };
const dateLocale: Record<Language, string> = { en: "en-GB", th: "th-TH", "zh-CN": "zh-CN", ja: "ja-JP" };

function formatDate(value: string, language: Language) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(dateLocale[language], { day: "numeric", month: "long", year: "numeric" }).format(date);
}

function categoryKeyFor(title: string): TranslationKey {
  const value = title.toLowerCase();
  if (value.includes("belt") || value.includes("exam")) return "newsletter.archive.categories.examinations";
  if (value.includes("workshop") || value.includes("seminar")) return "newsletter.archive.categories.workshops";
  if (value.includes("visit")) return "newsletter.archive.categories.visiting";
  return "newsletter.archive.categories.news";
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
      return <section className="container-shell journal-empty-page"><p className="eyebrow">{t("newsletter.article.missingEyebrow")}</p><h1>{t("newsletter.article.missingTitle")}</h1><Link to="/newsletter" className="text-link"><ArrowLeft size={16} /> {t("newsletter.article.returnArchive")}</Link></section>;
    }
    const media = article.media?.length ? article.media : article.image ? [article.image] : [];
    const translateText = [article.title, article.summary, article.body].join("\n\n");
    const translateUrl = `https://translate.google.com/?${new URLSearchParams({ sl: "auto", tl: googleTranslateTarget[language], text: translateText, op: "translate" })}`;
    const index = updates.findIndex((item) => item.id === article.id);
    return (
      <article className="journal-entry">
        <header className="container-shell journal-entry__header">
          <Link to="/newsletter" className="text-link"><ArrowLeft size={16} /> {t("newsletter.article.archiveLink")}</Link>
          <p className="folio-mark">{t(categoryKeyFor(article.title))} · {formatDate(article.date, language)}</p>
          <h1>{article.title}</h1>
          <p className="journal-entry__dek">{article.summary}</p>
          <div className="journal-entry__byline"><span>{t("common.brand")}</span><a href={translateUrl} target="_blank" rel="noopener noreferrer"><Languages size={15} /> {t("newsletter.article.translate")}</a></div>
        </header>
        <div className="container-shell journal-entry__body">
          <EventBodyRenderer body={article.body} media={media} fallbackTitle={article.title} />
        </div>
        <nav className="container-shell journal-entry__nav" aria-label={t("newsletter.article.navigationLabel")}>
          {updates[index + 1] ? <Link to={`/newsletter/${updates[index + 1].slug}`}><ArrowLeft size={16} /> {t("newsletter.article.older")}<br /><strong>{updates[index + 1].title}</strong></Link> : <span />}
          {updates[index - 1] ? <Link to={`/newsletter/${updates[index - 1].slug}`}>{t("newsletter.article.newer")} <ArrowRight size={16} /><br /><strong>{updates[index - 1].title}</strong></Link> : null}
        </nav>
      </article>
    );
  }

  const featured = filtered[0];
  return (
    <>
      <MotionSection className="container-shell journal-opening">
        <div><p className="folio-mark">{t("newsletter.archive.folio")}</p><p className="eyebrow">{t("newsletter.intro.eyebrow")}</p><h1>{t("newsletter.archive.title")}</h1><p>{t("newsletter.intro.copy")}</p></div>
        <label className="journal-search" htmlFor="journal-search"><Search size={17} aria-hidden="true" /><span className="sr-only">{t("newsletter.archive.searchLabel")}</span><input id="journal-search" name="journal-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("newsletter.archive.searchPlaceholder")} /></label>
      </MotionSection>
      <MotionSection className="container-shell journal-archive">
        {featured ? (
          <article className="journal-archive__featured">
            <ResponsiveImage src={featured.image?.src || featured.media?.find((item) => item.type === "image")?.src || assetPath("/dojo-photos/aikido-hero-new.webp")} alt={featured.image?.alt || featured.title} imgClassName="h-full w-full object-cover" loading="eager" />
            <div><p className="folio-mark">{t("newsletter.archive.featured")} · {formatDate(featured.date, language)}</p><h2>{featured.title}</h2><p>{featured.summary}</p><Link to={`/newsletter/${featured.slug}`} className="text-link">{t("newsletter.archive.readEntry")} <ArrowRight size={16} /></Link></div>
          </article>
        ) : <div className="journal-empty"><h2>{t("newsletter.archive.emptyTitle")}</h2><p>{t("newsletter.archive.emptyCopy")}</p></div>}
        {filtered.length > 1 ? <div className="journal-index"><h2>{t("newsletter.archive.previousEntries")}</h2><ol>{filtered.slice(1).map((item, index) => <li key={item.id}><span>{String(index + 1).padStart(2, "0")}</span><time>{formatDate(item.date, language)}</time><div><p>{t(categoryKeyFor(item.title))}</p><h3><Link to={`/newsletter/${item.slug}`}>{item.title}</Link></h3><p>{item.summary}</p></div></li>)}</ol></div> : null}
      </MotionSection>
      <MotionSection id="newsletter-signup" className="container-shell journal-signup scroll-mt-24"><NewsletterSignup idPrefix="journal-newsletter" /></MotionSection>
    </>
  );
}
