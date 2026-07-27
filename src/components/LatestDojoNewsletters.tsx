import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { newsletterCover } from "../../shared/newsletter";
import { useTranslation } from "../i18n";
import { getPublishedRecentEvents, useEditableContent } from "../lib/content";
import { assetPath } from "../utils/assetPath";
import { MotionSection } from "./MotionSection";
import { ResponsiveImage } from "./ResponsiveImage";
import { formatGregorianDate } from "../../shared/date";

const FALLBACK_COVER = assetPath("/dojo-photos/aikido-hero-new.webp");

function dateLabel(value: string, _language: string) {
  return formatGregorianDate(value, value);
}

export function LatestDojoNewsletters() {
  const { language } = useTranslation();
  const { content } = useEditableContent();
  const newsletters = getPublishedRecentEvents(content, 3);
  if (!newsletters.length) return null;
  const [featured, ...supporting] = newsletters;
  const featuredCover = newsletterCover(featured);

  return (
    <MotionSection className="home-journal" aria-labelledby="home-journal-title">
      <div className="container-shell">
        <header className="home-journal__header">
          <div>
            <p className="eyebrow">Dojo Journal</p>
            <h2 id="home-journal-title">Latest from the Dojo</h2>
          </div>
          <Link to="/newsletter" className="text-link">View all newsletters <ArrowRight size={16} /></Link>
        </header>
        <div className={`home-journal__layout home-journal__layout--${newsletters.length}`}>
          <article className="home-journal__featured">
            <Link to={`/newsletter/${featured.slug}`} className="home-journal__image">
              <ResponsiveImage
                src={featuredCover?.src || FALLBACK_COVER}
                alt={featuredCover ? featuredCover.alt || featured.title : ""}
                imgClassName="h-full w-full object-cover"
                loading="lazy"
                sizes="(max-width: 800px) 100vw, 60vw"
              />
              {!featuredCover ? <span>RenShinKan<br />Dojo Journal</span> : null}
            </Link>
            <div>
              <p className="home-journal__meta">{featured.category || "Dojo News"} · {dateLabel(featured.date, language)}</p>
              <h3><Link to={`/newsletter/${featured.slug}`}>{featured.title}</Link></h3>
              <p>{featured.summary}</p>
              <Link to={`/newsletter/${featured.slug}`} className="text-link">Read newsletter <ArrowRight size={16} /></Link>
            </div>
          </article>
          {supporting.length ? (
            <div className="home-journal__supporting">
              {supporting.map((newsletter) => {
                const cover = newsletterCover(newsletter);
                return (
                  <article key={newsletter.id}>
                    <Link to={`/newsletter/${newsletter.slug}`} className="home-journal__small-image">
                      <ResponsiveImage
                        src={cover?.src || FALLBACK_COVER}
                        alt={cover ? cover.alt || newsletter.title : ""}
                        imgClassName="h-full w-full object-cover"
                        loading="lazy"
                        sizes="(max-width: 800px) 42vw, 20vw"
                      />
                    </Link>
                    <div>
                      <p className="home-journal__meta">{newsletter.category || "Dojo News"} · {dateLabel(newsletter.date, language)}</p>
                      <h3><Link to={`/newsletter/${newsletter.slug}`}>{newsletter.title}</Link></h3>
                      <p>{newsletter.summary}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </MotionSection>
  );
}
