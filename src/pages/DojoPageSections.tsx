import { ArrowRight, ExternalLink, HandCoins, MapPin, MessageCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { DojoJourney } from "../components/DojoJourney";
import { FacilityGrid } from "../components/FacilityGrid";
import { InstructorLine } from "../components/InstructorLine";
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
      <MotionSection id="dojo" className="container-shell dojo-intro scroll-mt-24">
        <div className="dojo-intro__note">
          <p className="vertical-label">{t("home.facilities.eyebrow")}</p>
          <h2>{t("home.facilities.title")}</h2>
          <p>{t("home.facilities.copy")}</p>
          <blockquote>{t("home.facilities.quote")}</blockquote>
          <p className="marginal-note">{t("home.facilities.note", { year: siteInfo.builtYear })}</p>
        </div>
        <figure className="dojo-intro__photo">
          <ResponsiveImage
            src={assetPath("/pcf-aikido/dojo-exterior.webp")}
            alt="The wooden RenShinKan dojo seen from its garden"
            imgClassName="h-full w-full object-cover"
            loading="lazy"
          />
          <figcaption>{t("home.facilities.photoCaption")}</figcaption>
        </figure>
        <figure className="dojo-intro__detail photo-mat">
          <ResponsiveImage
            src={assetPath("/dojo-photos/renshinkan-koi-pond-upscaled.webp")}
            alt="Koi swimming in the pond beside the RenShinKan training hall"
            loading="lazy"
            sizes="(max-width: 600px) 88vw, 21rem"
          />
          <figcaption>{t("home.facilities.detailCaption")}</figcaption>
        </figure>
      </MotionSection>

      <MotionSection className="container-shell facility-index">
        <FacilityGrid />
      </MotionSection>

      <MotionSection id="visit-notes" className="container-shell manuscript-opening scroll-mt-24">
        <div className="manuscript-opening__note">
          <p className="vertical-label">{t("classes.firstVisit.eyebrow")}</p>
          <h2>{t("home.visitNotes.title")}</h2>
          <p>{t("home.visitNotes.copy")}</p>
          <div className="editorial-actions">
            <Link to="/classes#first-visit" className="text-link">{t("home.hero.visit")} <ArrowRight size={16} /></Link>
            <Link to="/contact" className="text-link">{t("common.getInTouch")} <MessageCircle size={16} /></Link>
          </div>
        </div>

        <div className="schedule-ledger" aria-labelledby="home-schedule-title">
          <p className="folio-mark">{t("classes.schedule.eyebrow")}</p>
          <h2 id="home-schedule-title">{t("home.visitNotes.scheduleTitle")}</h2>
          <div className="schedule-ledger__rows">
            {classSchedule.map((session) => (
              <div className="schedule-ledger__row" key={session.day}>
                <span>{session.day}</span>
                <time>{session.time.replace("-", " — ")}</time>
              </div>
            ))}
          </div>
          <p className="marginal-note">{t("home.visitNotes.scheduleNote")}</p>
        </div>
      </MotionSection>

      <MotionSection id="instructors" className="container-shell scroll-mt-24 manuscript-section">
        <header className="section-masthead section-masthead--offset">
          <p className="eyebrow">{t("home.instructors.eyebrow")}</p>
          <h2>{t("home.instructors.title")}</h2>
          <p>{t("home.instructors.copy")}</p>
        </header>
        <InstructorLine />
      </MotionSection>

      <MotionSection id="dojo-photos" className="container-shell photo-journal scroll-mt-24">
        <header className="section-masthead">
          <p className="eyebrow">{t("home.photos.eyebrow")}</p>
          <h2>{t("home.photos.title")}</h2>
          <p>{t("home.photos.copy")}</p>
        </header>

        <h3 className="photo-journal__subhead">{t("home.photos.onMat")}</h3>
        <div className="mat-mosaic">
          <figure className="mat-mosaic__feature photo-mat">
            <ResponsiveImage
              src={assetPath("/renshinkan-gallery/class-photos/class_group_dojo_closeup_01.jpg")}
              alt="Adults and teenagers of RenShinKan seated together on the mat after evening practice"
              loading="lazy"
              sizes="(max-width: 1050px) 100vw, 55vw"
            />
            <figcaption><span>01</span>{t("home.photos.matCaptions.feature")}</figcaption>
          </figure>
          <figure className="mat-mosaic__weapons">
            <ResponsiveImage
              src={assetPath("/pcf-aikido/jo-bokken.webp")}
              alt="A bokken and jo lying diagonally across green tatami"
              loading="lazy"
              sizes="(max-width: 600px) 88vw, 22vw"
            />
            <figcaption><span>02</span>{t("home.photos.matCaptions.weapons")}</figcaption>
          </figure>
          <figure className="mat-mosaic__children">
            <ResponsiveImage
              src={assetPath("/dojo-photos/kids-around-green-belt.webp")}
              alt="Young students lying in a circle with their new green belts arranged in a ring"
              loading="lazy"
              sizes="(max-width: 600px) 88vw, 24vw"
            />
            <figcaption><span>03</span>{t("home.photos.matCaptions.children")}</figcaption>
          </figure>
          <figure className="mat-mosaic__community">
            <ResponsiveImage
              src={assetPath("/renshinkan-gallery/class-photos/on_the_mat_02.jpg")}
              alt="The children's class gathered with their instructor on the dojo mat"
              loading="lazy"
              sizes="(max-width: 600px) 88vw, 22vw"
            />
            <figcaption><span>04</span>{t("home.photos.matCaptions.community")}</figcaption>
          </figure>
        </div>

        <h3 className="photo-journal__subhead">{t("home.photos.groundsTitle")}</h3>
        <div className="photo-journal__spread">
          {localizedDojoPhotos.slice(0, 4).map((photo, index) => (
            <figure key={photo.src} className={`photo-journal__item photo-journal__item--${index + 1}`}>
              <ResponsiveImage src={photo.src} alt={photo.alt} imgClassName="h-full w-full object-cover" loading="lazy" />
              <figcaption><span>{String(index + 1).padStart(2, "0")}</span>{photo.title}</figcaption>
            </figure>
          ))}
        </div>

        <div className="photo-journal__mat">
          <p className="vertical-label">{t("home.photos.archiveTitle")}</p>
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
          <p>{t("home.journey.sourceNote")}</p>
          <a href={siteInfo.foundationUrl} target="_blank" rel="noopener noreferrer" className="text-link">
            {t("common.sourceGallery")} <ExternalLink size={15} />
          </a>
        </footer>
      </MotionSection>

      <MotionSection id="recent-events" className="journal-feature scroll-mt-24">
        <div className="container-shell journal-feature__layout">
          <header>
            <p className="eyebrow">{t("home.recent.eyebrow")}</p>
            <h2>{t("home.recent.title")}</h2>
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
                <Link to={`/newsletter/${featuredUpdate.slug}`} className="text-link">{t("common.viewUpdate")} <ArrowRight size={16} /></Link>
              </div>
            </article>
          ) : (
            <p className="journal-empty">{t("home.recent.empty")}</p>
          )}
          <Link to="/newsletter" className="journal-feature__archive">{t("home.recent.archiveCta")} <ArrowRight size={16} /></Link>
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
            <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer" className="text-link"><MapPin size={16} /> {t("common.openMap")}</a>
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
