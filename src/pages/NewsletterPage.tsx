import {
  ArrowLeft,
  ArrowRight,
  Clock3,
  Languages,
  RotateCcw,
  Search,
} from "lucide-react";
import { useEffect, useMemo } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import {
  NEWSLETTER_CATEGORIES,
  newsletterCover,
  newsletterReadingMinutes,
  relatedNewsletterRecommendations,
  sortNewslettersNewest,
} from "../../shared/newsletter";
import { EventBodyRenderer } from "../components/EventBodyRenderer";
import { NewsletterDocumentRenderer } from "../components/NewsletterDocumentRenderer";
import { NewsletterSignup } from "../components/NewsletterSignup";
import { MotionSection } from "../components/MotionSection";
import { ResponsiveImage } from "../components/ResponsiveImage";
import { useTranslation, type Language } from "../i18n";
import { getPublishedRecentEvents, useEditableContent } from "../lib/content";
import type { RecentEvent } from "../types/editableContent";
import { assetPath } from "../utils/assetPath";

const SITE_URL = (import.meta.env.VITE_SITE_URL || "https://renshinkandojo.org").replace(/\/+$/, "");
const FALLBACK_COVER = assetPath("/dojo-photos/aikido-hero-new.webp");
const PAGE_SIZE = 9;
const googleTranslateTarget: Record<Language, string> = { en: "en", th: "th", "zh-CN": "zh-CN", ja: "ja" };
const dateLocale: Record<Language, string> = { en: "en-GB", th: "th-TH", "zh-CN": "zh-CN", ja: "ja-JP" };

function formatDate(value: string, language: Language) {
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(dateLocale[language], { day: "numeric", month: "long", year: "numeric" }).format(date);
}

function coverFor(newsletter: RecentEvent) {
  return newsletterCover(newsletter);
}

function NewsletterCard({
  newsletter,
  language,
  reason,
  eager = false,
}: {
  newsletter: RecentEvent;
  language: Language;
  reason?: string;
  eager?: boolean;
}) {
  const cover = coverFor(newsletter);
  return (
    <article className="journal-card">
      <Link to={`/newsletter/${newsletter.slug}`} className="journal-card__cover" aria-label={`Read ${newsletter.title}`}>
        <ResponsiveImage
          src={cover?.src || FALLBACK_COVER}
          alt={cover ? cover.alt || newsletter.title : ""}
          imgClassName="h-full w-full object-cover"
          objectPosition={cover?.objectPosition || "50% 50%"}
          loading={eager ? "eager" : "lazy"}
          sizes="(max-width: 720px) 92vw, (max-width: 1100px) 44vw, 29vw"
        />
        {!cover ? <span className="journal-card__fallback">RenShinKan<br />Dojo Journal</span> : null}
      </Link>
      <div className="journal-card__content">
        {reason ? <p className="journal-card__reason">{reason}</p> : null}
        <p className="journal-card__meta">
          <span>{newsletter.category || "Dojo News"}</span>
          <time dateTime={newsletter.date}>{formatDate(newsletter.date, language)}</time>
        </p>
        <h3><Link to={`/newsletter/${newsletter.slug}`}>{newsletter.title}</Link></h3>
        <p className="journal-card__summary">{newsletter.summary}</p>
        <p className="journal-card__reading"><Clock3 size={14} aria-hidden="true" /> {newsletterReadingMinutes(newsletter)} min read</p>
      </div>
    </article>
  );
}

function ArticleSeo({ article, language }: { article: RecentEvent; language: Language }) {
  useEffect(() => {
    const canonical = `${SITE_URL}/newsletter/${article.slug}`;
    const cover = coverFor(article);
    const image = new URL(cover?.src || FALLBACK_COVER, SITE_URL).href;
    const title = `${article.title} | RenShinKan Dojo Journal`;
    document.title = title;
    const setMeta = (selector: string, attribute: "name" | "property", key: string, value: string) => {
      let element = document.head.querySelector<HTMLMetaElement>(selector);
      if (!element) {
        element = document.createElement("meta");
        element.setAttribute(attribute, key);
        document.head.appendChild(element);
      }
      element.content = value;
    };
    setMeta('meta[name="description"]', "name", "description", article.summary);
    setMeta('meta[property="og:title"]', "property", "og:title", article.title);
    setMeta('meta[property="og:description"]', "property", "og:description", article.summary);
    setMeta('meta[property="og:type"]', "property", "og:type", "article");
    setMeta('meta[property="og:url"]', "property", "og:url", canonical);
    setMeta('meta[property="og:image"]', "property", "og:image", image);
    setMeta('meta[name="twitter:title"]', "name", "twitter:title", article.title);
    setMeta('meta[name="twitter:description"]', "name", "twitter:description", article.summary);
    setMeta('meta[name="twitter:image"]', "name", "twitter:image", image);
    const canonicalLink = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonicalLink) canonicalLink.href = canonical;

    const script = document.createElement("script");
    script.id = "journal-article-schema";
    script.type = "application/ld+json";
    script.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": article.contentType === "event" ? "NewsArticle" : "BlogPosting",
          "@id": `${canonical}#article`,
          headline: article.title,
          description: article.summary,
          datePublished: article.publishedAt || article.date,
          dateModified: article.updatedAt,
          image,
          inLanguage: language,
          mainEntityOfPage: canonical,
          author: { "@type": "Organization", "@id": `${SITE_URL}/#dojo`, name: "RenShinKan Dojo" },
          publisher: {
            "@type": "Organization",
            "@id": `${SITE_URL}/#dojo`,
            name: "RenShinKan Dojo",
            logo: { "@type": "ImageObject", url: `${SITE_URL}/renshinkan-logo.png` },
          },
        },
        {
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
            { "@type": "ListItem", position: 2, name: "Newsletter", item: `${SITE_URL}/newsletter` },
            { "@type": "ListItem", position: 3, name: article.title, item: canonical },
          ],
        },
      ],
    });
    document.head.appendChild(script);
    return () => script.remove();
  }, [article, language]);
  return null;
}

function NewsletterArticle({
  article,
  updates,
  language,
}: {
  article: RecentEvent;
  updates: RecentEvent[];
  language: Language;
}) {
  const cover = coverFor(article);
  const media = (article.media?.length ? article.media : article.image ? [article.image] : [])
    .filter((item) => item.id !== article.coverImageId);
  const translateText = [article.title, article.summary, article.body].join("\n\n");
  const translateUrl = `https://translate.google.com/?${new URLSearchParams({
    sl: "auto",
    tl: googleTranslateTarget[language],
    text: translateText,
    op: "translate",
  })}`;
  const index = updates.findIndex((item) => item.id === article.id);
  const related = relatedNewsletterRecommendations(updates, article);

  return (
    <>
      <ArticleSeo article={article} language={language} />
      <article className="journal-entry">
        <header className="container-shell journal-entry__header">
          <nav aria-label="Breadcrumb">
            <ol className="journal-breadcrumb">
              <li><Link to="/">Home</Link></li>
              <li><Link to="/newsletter">Newsletter</Link></li>
              <li aria-current="page">{article.title}</li>
            </ol>
          </nav>
          <p className="journal-entry__category">{article.category || "Dojo News"} · {formatDate(article.date, language)}</p>
          <h1>{article.title}</h1>
          <p className="journal-entry__dek">{article.summary}</p>
          <div className="journal-entry__byline">
            <span>By RenShinKan Dojo</span>
            <a href={translateUrl} target="_blank" rel="noopener noreferrer"><Languages size={15} /> Translate this newsletter</a>
          </div>
        </header>
        {cover ? (
          <figure className="container-shell journal-entry__cover">
            <ResponsiveImage
              src={cover.src}
              alt={cover.alt || article.title}
              imgClassName="h-full w-full object-cover"
              objectPosition={cover.objectPosition || "50% 50%"}
              loading="eager"
              sizes="(max-width: 900px) 100vw, 1100px"
            />
          </figure>
        ) : null}
        <div className="container-shell journal-entry__body">
          {article.bodyContent
            ? <NewsletterDocumentRenderer document={article.bodyContent} />
            : <EventBodyRenderer body={article.body} media={media} fallbackTitle={article.title} />}
          {article.bodyContent && media.length
            ? <EventBodyRenderer body="" media={media} fallbackTitle={article.title} className="journal-entry__attachments" />
            : null}
        </div>
        <nav className="container-shell journal-entry__nav" aria-label="Newsletter navigation">
          {updates[index + 1] ? <Link to={`/newsletter/${updates[index + 1].slug}`}><ArrowLeft size={16} /> Older<br /><strong>{updates[index + 1].title}</strong></Link> : <span />}
          {updates[index - 1] ? <Link to={`/newsletter/${updates[index - 1].slug}`}>Newer <ArrowRight size={16} /><br /><strong>{updates[index - 1].title}</strong></Link> : null}
        </nav>
      </article>
      {related.length ? (
        <section className="journal-related" aria-labelledby="journal-related-title">
          <div className="container-shell">
            <p className="eyebrow">Continue reading</p>
            <h2 id="journal-related-title">More from RenShinKan</h2>
            <div className="journal-grid">
              {related.map(({ newsletter, reason }) => (
                <NewsletterCard key={newsletter.id} newsletter={newsletter} language={language} reason={reason} />
              ))}
            </div>
          </div>
        </section>
      ) : null}
      <section className="container-shell journal-signup journal-signup--article"><NewsletterSignup idPrefix="journal-article-newsletter" /></section>
    </>
  );
}

export function NewsletterPage() {
  const { language, t } = useTranslation();
  const { slug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { content } = useEditableContent();
  const updates = useMemo(() => getPublishedRecentEvents(content), [content]);
  const article = slug
    ? updates.find((item) => item.slug === slug || item.slugHistory?.includes(slug))
    : undefined;

  if (slug) {
    if (!article) {
      return (
        <section className="container-shell journal-empty-page">
          <p className="eyebrow">{t("newsletter.article.missingEyebrow")}</p>
          <h1>{t("newsletter.article.missingTitle")}</h1>
          <Link to="/newsletter" className="text-link"><ArrowLeft size={16} /> {t("newsletter.article.returnArchive")}</Link>
        </section>
      );
    }
    if (slug !== article.slug) return <Navigate to={`/newsletter/${article.slug}`} replace />;
    return <NewsletterArticle article={article} updates={updates} language={language} />;
  }

  const query = searchParams.get("q") || "";
  const category = searchParams.get("category") || "";
  const year = searchParams.get("year") || "";
  const requestedPage = Math.max(1, Number(searchParams.get("page") || "1") || 1);
  const featured = [...updates].sort((left, right) => Number(right.featured) - Number(left.featured) || Date.parse(right.date) - Date.parse(left.date))[0];
  const categories = NEWSLETTER_CATEGORIES.filter((item) => updates.some((update) => update.category === item));
  const years = [...new Set(updates.map((update) => update.date.slice(0, 4)).filter((item) => /^\d{4}$/.test(item)))].sort().reverse();
  const normalizedQuery = query.trim().toLocaleLowerCase(language);
  const filtered = sortNewslettersNewest(updates.filter((item) => {
    const matchesQuery = !normalizedQuery || [item.title, item.summary, item.body, ...(item.tags ?? [])]
      .join(" ")
      .toLocaleLowerCase(language)
      .includes(normalizedQuery);
    return matchesQuery && (!category || item.category === category) && (!year || item.date.startsWith(year));
  }));
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    setSearchParams(next, { replace: true });
  };
  const pageHref = (pageNumber: number) => {
    const next = new URLSearchParams(searchParams);
    if (pageNumber <= 1) next.delete("page");
    else next.set("page", String(pageNumber));
    const queryString = next.toString();
    return `/newsletter${queryString ? `?${queryString}` : ""}`;
  };
  const resultStart = filtered.length ? (page - 1) * PAGE_SIZE + 1 : 0;
  const resultEnd = Math.min(page * PAGE_SIZE, filtered.length);

  return (
    <>
      <MotionSection className="container-shell journal-opening">
        <div>
          <p className="folio-mark">{t("newsletter.archive.folio")}</p>
          <p className="eyebrow">{t("newsletter.intro.eyebrow")}</p>
          <h1>Dojo Journal</h1>
          <p>{t("newsletter.intro.copy")}</p>
        </div>
      </MotionSection>
      {featured ? (
        <MotionSection className="container-shell journal-archive-feature">
          <article>
            <div className="journal-archive-feature__image">
              <ResponsiveImage
                src={coverFor(featured)?.src || FALLBACK_COVER}
                alt={coverFor(featured)?.alt || (coverFor(featured) ? featured.title : "")}
                imgClassName="h-full w-full object-cover"
                loading="eager"
                sizes="(max-width: 800px) 100vw, 58vw"
              />
              {!coverFor(featured) ? <span>RenShinKan<br />Dojo Journal</span> : null}
            </div>
            <div>
              <p className="journal-entry__category">Featured · {featured.category || "Dojo News"}</p>
              <time dateTime={featured.date}>{formatDate(featured.date, language)}</time>
              <h2>{featured.title}</h2>
              <p>{featured.summary}</p>
              <Link to={`/newsletter/${featured.slug}`} className="text-link">Read newsletter <ArrowRight size={16} /></Link>
            </div>
          </article>
        </MotionSection>
      ) : null}
      <MotionSection className="journal-archive">
        <div className="container-shell">
          <form className="journal-filters" role="search" onSubmit={(event) => event.preventDefault()}>
            <label className="journal-search" htmlFor="journal-search">
              <Search size={17} aria-hidden="true" />
              <span>Search newsletters</span>
              <input
                id="journal-search"
                name="q"
                value={query}
                onChange={(event) => setFilter("q", event.target.value)}
                placeholder={t("newsletter.archive.searchPlaceholder")}
              />
            </label>
            <label>
              <span>Category</span>
              <select value={category} onChange={(event) => setFilter("category", event.target.value)}>
                <option value="">All categories</option>
                {categories.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label>
              <span>Year</span>
              <select value={year} onChange={(event) => setFilter("year", event.target.value)}>
                <option value="">All years</option>
                {years.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <button type="button" onClick={() => setSearchParams({}, { replace: true })}>
              <RotateCcw size={16} aria-hidden="true" /> Clear filters
            </button>
          </form>
          <div className="journal-results-heading">
            <div>
              <p className="eyebrow">Archive</p>
              <h2>All newsletters</h2>
            </div>
            <p role="status" aria-live="polite">
              {filtered.length ? `Showing ${resultStart}–${resultEnd} of ${filtered.length} newsletters.` : "No newsletters match these filters."}
            </p>
          </div>
          {pageItems.length ? (
            <div className="journal-grid">
              {pageItems.map((item, index) => <NewsletterCard key={item.id} newsletter={item} language={language} eager={index < 3} />)}
            </div>
          ) : (
            <div className="journal-empty journal-empty--archive">
              <Search size={28} aria-hidden="true" />
              <h3>No matching newsletters</h3>
              <p>Try a broader keyword or clear one of the filters.</p>
              <button type="button" className="text-link" onClick={() => setSearchParams({}, { replace: true })}>Clear all filters</button>
            </div>
          )}
          {pageCount > 1 ? (
            <nav className="journal-pagination" aria-label="Newsletter archive pages">
              {page > 1 ? <Link to={pageHref(page - 1)} rel="prev"><ArrowLeft size={16} /> Previous</Link> : <span aria-disabled="true"><ArrowLeft size={16} /> Previous</span>}
              <ol>
                {Array.from({ length: pageCount }, (_, index) => index + 1).map((pageNumber) => (
                  <li key={pageNumber}>
                    <Link to={pageHref(pageNumber)} aria-current={pageNumber === page ? "page" : undefined}>{pageNumber}</Link>
                  </li>
                ))}
              </ol>
              {page < pageCount ? <Link to={pageHref(page + 1)} rel="next">Next <ArrowRight size={16} /></Link> : <span aria-disabled="true">Next <ArrowRight size={16} /></span>}
            </nav>
          ) : null}
        </div>
      </MotionSection>
      <MotionSection id="newsletter-signup" className="container-shell journal-signup scroll-mt-24">
        <NewsletterSignup idPrefix="journal-newsletter" />
      </MotionSection>
    </>
  );
}
