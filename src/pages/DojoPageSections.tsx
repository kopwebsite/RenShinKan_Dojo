import { ArrowRight, ExternalLink, HandCoins, MapPin, MessageCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { DojoJourney } from "../components/DojoJourney";
import { FacilityGrid } from "../components/FacilityGrid";
import { InstructorGrid } from "../components/InstructorGrid";
import { MediaSlider } from "../components/MediaSlider";
import { MotionSection } from "../components/MotionSection";
import { ResponsiveImage } from "../components/ResponsiveImage";
import { onTheMatMedia } from "../data/editableContent";
import { dojoPhotos, renshinkanBuildPhotos } from "../data/siteContent";
import { classSchedule, googleMapsUrl, siteInfo } from "../data/siteMeta";
import { useTranslation } from "../i18n";
import { getPublishedRecentEvents, useEditableContent } from "../lib/content";
import { assetPath } from "../utils/assetPath";
import {
  dojoJourneyPhotoKeys,
  dojoPhotoKeys,
  translateDojoJourneyPhoto,
  translateDojoPhoto,
} from "../utils/siteContentTranslations";

function formatEventDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long", year: "numeric" }).format(date);
}

export function DojoPageSections() {
  const { t } = useTranslation();
  const { content } = useEditableContent();
  const recentUpdates = getPublishedRecentEvents(content, 3);
  const matMedia = content.onTheMatMedia.length ? content.onTheMatMedia : onTheMatMedia;
  const localizedDojoPhotos = dojoPhotos.map((photo, index) => translateDojoPhoto(t, photo, dojoPhotoKeys[index]));
  const localizedJourney = renshinkanBuildPhotos.map((photo, index) =>
    translateDojoJourneyPhoto(t, photo, dojoJourneyPhotoKeys[index]),
  );
  const featuredUpdate = recentUpdates[0];

  return (
    <>
      <MotionSection id="visit-notes" className="container-shell manuscript-opening scroll-mt-24">
        <div className="manuscript-opening__note">
          <p className="vertical-label">First visit</p>
          <h2>Come to watch, or step onto the mat.</h2>
          <p>
            No experience is expected. Wear comfortable clothing, arrive a little early, and let the instructor know
            that it is your first class. Practice is cooperative: each person is responsible for their partner's safety.
          </p>
          <div className="editorial-actions">
            <Link to="/classes#first-visit" className="text-link">Plan a first visit <ArrowRight size={16} /></Link>
            <Link to="/contact" className="text-link">Ask a question <MessageCircle size={16} /></Link>
          </div>
        </div>

        <div className="schedule-ledger" aria-labelledby="home-schedule-title">
          <p className="folio-mark">Weekly practice</p>
          <h2 id="home-schedule-title">Four classes, two quiet rhythms.</h2>
          <div className="schedule-ledger__rows">
            {classSchedule.map((session) => (
              <div className="schedule-ledger__row" key={session.day}>
                <span>{session.day}</span>
                <time>{session.time.replace("-", " — ")}</time>
              </div>
            ))}
          </div>
          <p className="marginal-note">Evening practice on weekdays. Morning practice at the weekend.</p>
        </div>
      </MotionSection>

      <MotionSection id="dojo" className="container-shell editorial-spread scroll-mt-24">
        <div className="editorial-spread__copy">
          <p className="eyebrow">{t("home.facilities.eyebrow")}</p>
          <h2>{t("home.facilities.title")}</h2>
          <p>{t("home.facilities.copy", { year: siteInfo.builtYear })}</p>
          <blockquote>
            A place to practise without competition or domination — with attention, discipline and care for one another.
          </blockquote>
        </div>
        <figure className="editorial-spread__image">
          <ResponsiveImage
            src={assetPath("/pcf-aikido/dojo-exterior.webp")}
            alt="The wooden RenShinKan dojo seen from its garden"
            imgClassName="h-full w-full object-cover"
            loading="lazy"
          />
          <figcaption>RenShinKan Dojo · Baan Waen, Hang Dong</figcaption>
        </figure>
      </MotionSection>

      <MotionSection className="container-shell facility-index">
        <FacilityGrid />
      </MotionSection>

      <MotionSection id="instructors" className="container-shell scroll-mt-24 manuscript-section">
        <header className="section-masthead section-masthead--offset">
          <p className="eyebrow">{t("home.instructors.eyebrow")}</p>
          <h2>{t("home.instructors.title")}</h2>
          <p>{t("home.instructors.copy")}</p>
          <Link to="/instructors" className="text-link">Read full biographies <ArrowRight size={16} /></Link>
        </header>
        <InstructorGrid compact />
      </MotionSection>

      <MotionSection id="dojo-photos" className="container-shell photo-journal scroll-mt-24">
        <header className="section-masthead">
          <p className="eyebrow">{t("home.photos.eyebrow")}</p>
          <h2>{t("home.photos.title")}</h2>
          <p>{t("home.photos.copy")}</p>
        </header>
        <figure className="on-mat-feature">
          <ResponsiveImage
            src={assetPath("/renshinkan-gallery/class-photos/on_the_mat_01.jpg")}
            alt={t("home.photos.onMatGallery")}
            imgClassName="on-mat-feature__image"
            loading="lazy"
            width={960}
            height={720}
          />
          <figcaption>
            <span className="folio-mark">{t("home.photos.eyebrow")}</span>
            <strong>{t("home.photos.onMat")}</strong>
            <p>{t("home.photos.copy")}</p>
          </figcaption>
        </figure>
        <div className="photo-journal__spread">
          {localizedDojoPhotos.slice(0, 4).map((photo, index) => (
            <figure key={photo.src} className={`photo-journal__item photo-journal__item--${index + 1}`}>
              <ResponsiveImage src={photo.src} alt={photo.alt} imgClassName="h-full w-full object-cover" loading="lazy" />
              <figcaption><span>{String(index + 1).padStart(2, "0")}</span>{photo.title}</figcaption>
            </figure>
          ))}
        </div>
        <div className="photo-journal__mat">
          <p className="vertical-label">On the mat</p>
          <MediaSlider media={matMedia} label={t("home.photos.onMatGallery")} showIndexNavigation />
        </div>
      </MotionSection>

      <MotionSection id="dojo-history" className="container-shell history-scroll scroll-mt-24">
        <header className="section-masthead section-masthead--wide">
          <p className="eyebrow">{t("home.journey.eyebrow")}</p>
          <h2>{t("home.journey.title")}</h2>
          <p>{t("home.journey.copy")}</p>
        </header>
        <DojoJourney photos={localizedJourney} />
        <footer className="history-scroll__source">
          <p>Construction photographs and historical notes are credited once here for the complete series.</p>
          <a href={siteInfo.foundationUrl} target="_blank" rel="noopener noreferrer" className="text-link">
            {t("common.sourceGallery")} <ExternalLink size={15} />
          </a>
        </footer>
      </MotionSection>

      <MotionSection id="recent-events" className="journal-feature scroll-mt-24">
        <div className="container-shell journal-feature__layout">
          <header>
            <p className="eyebrow">Dojo journal</p>
            <h2>News from the mat and the wider community.</h2>
          </header>
          {featuredUpdate ? (
            <article className="journal-feature__article">
              <ResponsiveImage
                src={featuredUpdate.image?.src || featuredUpdate.media?.find((item) => item.type === "image")?.src || assetPath("/dojo-photos/aikido-hero-new.webp")}
                alt={featuredUpdate.image?.alt || "RenShinKan dojo journal"}
                imgClassName="journal-feature__image"
                loading="lazy"
              />
              <div>
                <p className="folio-mark">{formatEventDate(featuredUpdate.date)}</p>
                <h3>{featuredUpdate.title}</h3>
                <p>{featuredUpdate.summary}</p>
                <Link to={`/newsletter/${featuredUpdate.slug}`} className="text-link">Read this entry <ArrowRight size={16} /></Link>
              </div>
            </article>
          ) : (
            <p className="journal-empty">The journal is being prepared. Workshop notes and dojo news will appear here.</p>
          )}
          <Link to="/newsletter" className="journal-feature__archive">Open the journal archive <ArrowRight size={16} /></Link>
        </div>
      </MotionSection>

      <MotionSection id="location" className="container-shell visit-plate scroll-mt-24">
        <figure>
          <ResponsiveImage
            src={assetPath("/pcf-aikido/dojo-sign.webp")}
            alt="RenShinKan dojo sign at the entrance"
            imgClassName="h-full w-full object-cover"
            loading="lazy"
          />
        </figure>
        <div>
          <p className="vertical-label">{t("home.location.eyebrow")}</p>
          <h2>{t("home.location.title")}</h2>
          <p>{t("home.location.copy")}</p>
          <address>{siteInfo.address}</address>
          <div className="editorial-actions">
            <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer" className="text-link"><MapPin size={16} /> Open directions</a>
            <Link to="/contact" className="text-link">{t("common.planYourVisit")} <ArrowRight size={16} /></Link>
          </div>
        </div>
      </MotionSection>

      <MotionSection className="container-shell support-colophon">
        <div>
          <p className="eyebrow">{t("home.support.eyebrow")}</p>
          <h2>{t("home.support.title")}</h2>
          <p>{t("home.support.copy")}</p>
        </div>
        <Link to="/support#monthly-contribution" className="btn-primary">
          <HandCoins size={18} aria-hidden="true" /> {t("home.support.cta")}
        </Link>
      </MotionSection>
    </>
  );
}
