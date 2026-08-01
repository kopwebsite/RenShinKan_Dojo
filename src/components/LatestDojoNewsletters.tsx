import { ArrowRight } from "lucide-react";
import { Link } from "react-router";
import { formatGregorianDate } from "../../shared/date";
import { newsletterCover } from "../../shared/newsletter";
import { useTranslation } from "../i18n";
import { getPublishedRecentEvents, useEditableContent } from "../lib/content";
import { assetPath } from "../utils/assetPath";
import { MotionSection } from "./MotionSection";
import { ResponsiveImage } from "./ResponsiveImage";

const FALLBACK_COVER = assetPath("/dojo-photos/aikido-hero-new.webp");

export function LatestDojoNewsletters() {
  const { t } = useTranslation();
  const { content } = useEditableContent();
  const featured = getPublishedRecentEvents(content, 1)[0];
  if (!featured) return null;
  const featuredCover = newsletterCover(featured);

  return <MotionSection className="home-journal" aria-labelledby="home-journal-title">
    <div className="container-shell">
      <header className="home-journal__header">
        <div><p className="eyebrow">{t("home.journal.eyebrow")}</p><h2 id="home-journal-title">{t("home.journal.title")}</h2></div>
        <Link to="/newsletter" className="text-link">{t("home.journal.viewAll")} <ArrowRight size={16} /></Link>
      </header>
      <div className="home-journal__layout home-journal__layout--1">
        <article className="home-journal__featured">
          <Link to={`/newsletter/${featured.slug}`} className="home-journal__image">
            <ResponsiveImage
              src={featuredCover?.src || FALLBACK_COVER}
              alt={featuredCover ? featuredCover.alt || featured.title : ""}
              imgClassName="h-full w-full object-cover"
              loading="lazy"
              sizes="(max-width: 800px) 100vw, 60vw"
            />
            {!featuredCover ? <span>RenShinKan<br />{t("home.journal.fallbackCover")}</span> : null}
          </Link>
          <div>
            <p className="home-journal__meta">{featured.category || t("home.journal.defaultCategory")} · {formatGregorianDate(featured.publishedAt || featured.publishAt || featured.date, featured.date)}</p>
            <h3><Link to={`/newsletter/${featured.slug}`}>{featured.title}</Link></h3>
            <p>{featured.summary}</p>
            <Link to={`/newsletter/${featured.slug}`} className="text-link">{t("home.journal.read")} <ArrowRight size={16} /></Link>
          </div>
        </article>
      </div>
    </div>
  </MotionSection>;
}
