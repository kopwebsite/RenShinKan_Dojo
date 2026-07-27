import {
  ArrowUpRight,
  CalendarDays,
  GraduationCap,
  HeartHandshake,
  MapPin,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { MotionSection } from "../components/MotionSection";
import { HistoricalTimelineGallery } from "../components/PublicGalleries";
import { ResponsiveImage } from "../components/ResponsiveImage";
import {
  cmuAikidoClub,
  pcfDojoPhotos,
  peaceCultureFoundation,
} from "../data/siteContent";
import { useTranslation } from "../i18n";
import { getCommunityCalendarEvents, useEditableContent } from "../lib/content";
import {
  cmuPhotoKeys,
  pcfPhotoKeys,
  translateTitleCaption,
} from "../utils/siteContentTranslations";

export function CommunityPage() {
  const { t } = useTranslation();
  const { content } = useEditableContent();
  const localizedPcfPhotos = pcfDojoPhotos.map((photo, index) =>
    translateTitleCaption(t, photo, pcfPhotoKeys[index]),
  );
  const localizedCmuPhotos = cmuAikidoClub.photos.map((photo, index) =>
    translateTitleCaption(t, photo, cmuPhotoKeys[index]),
  );
  const cmuLinkLabels = [
    t("data.community.cmu.links.history"),
    t("data.community.cmu.links.practice"),
    t("data.community.cmu.links.logo"),
  ];
  const [cmuHeroPhoto, ...cmuGalleryPhotos] = localizedCmuPhotos;
  const communityCalendarEvents = useMemo(() => getCommunityCalendarEvents(content), [content]);
  const upcomingEvents = communityCalendarEvents.map((event) => ({
    title: event.title,
    date: event.date,
    description: event.summary || event.body,
    href: event.published && event.slug ? `/newsletter/${event.slug}` : "/contact",
  }));

  return (
    <>
      {/* Upcoming Events */}
      <MotionSection id="upcoming-events" className="container-shell community-opening scroll-mt-28">
        <div className="section-masthead section-masthead--wide">
          <p className="eyebrow">{t("community.events.eyebrow")}</p>
          <h1 className="section-title">{t("community.events.title")}</h1>
          <p className="section-copy">
            {t("community.events.copy")}
          </p>
        </div>
        {upcomingEvents.length > 0 ? (
          <ol className="event-ledger">
            {upcomingEvents.map((event, i) => (
              <li
                key={event.title}
                className="event-ledger__entry"
              >
                <span className="event-ledger__number" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
                <div className="event-ledger__icon">
                  <CalendarDays size={24} aria-hidden="true" />
                </div>
                <time>{event.date}</time>
                <div className="event-ledger__copy">
                  <h3><Link to={event.href}>{event.title}</Link></h3>
                  <p>{event.description}</p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <div className="event-ledger event-ledger--empty">
            <div className="event-ledger__icon">
              <CalendarDays size={30} aria-hidden="true" />
            </div>
            <h3>{t("community.events.emptyTitle")}</h3>
            <p>{t("community.events.emptyCopy")}</p>
            <Link to="/newsletter#recent-events" className="text-link">
              {t("community.events.emptyCta")}
              <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          </div>
        )}
      </MotionSection>

      {/* Past Events */}
      <MotionSection id="past-events" className="container-shell community-past scroll-mt-28">
        <div className="section-masthead">
          <p className="eyebrow">{t("community.past.eyebrow")}</p>
          <h2 className="section-title">{t("community.past.title")}</h2>
          <p className="section-copy">
            {t("community.past.copy")}
          </p>
        </div>

        <HistoricalTimelineGallery albums={content.galleryAlbums.history} />
      </MotionSection>

      {/* Peace Culture Foundation */}
      <MotionSection id="peace-culture" className="container-shell foundation-story scroll-mt-28">
        <div className="foundation-diptych">
          <article className="foundation-manifesto">
            <div className="foundation-manifesto__marks">
              <div className="foundation-manifesto__logo">
                <ResponsiveImage
                  src={peaceCultureFoundation.logo.src}
                  alt={peaceCultureFoundation.logo.alt}
                  imgClassName="h-16 w-auto object-contain"
                  loading="lazy"
                  sizes="160px"
                />
              </div>
              <div className="foundation-manifesto__icon">
                <HeartHandshake size={26} aria-hidden="true" />
              </div>
            </div>
            <p className="eyebrow">{t("community.foundation.eyebrow")}</p>
            <h2>
              {t("community.foundation.title")}
            </h2>
            <p>
              {t("community.foundation.copy")}
            </p>
            <p>
              {t("data.community.foundation.aikidoConnection")}
            </p>
            <div className="editorial-actions">
              <a
                href={peaceCultureFoundation.homepageUrl}
                target="_blank"
                rel="noreferrer"
                className="text-link"
              >
                {t("community.foundation.visit")}
                <ArrowUpRight size={16} aria-hidden="true" />
              </a>
              <a
                href={peaceCultureFoundation.advocacyUrl}
                target="_blank"
                rel="noreferrer"
                className="text-link"
              >
                {t("community.foundation.advocacy")}
                <ArrowUpRight size={16} aria-hidden="true" />
              </a>
            </div>
          </article>

          <article className="foundation-safeguard">
            <div className="foundation-safeguard__icon">
              <ShieldCheck size={26} aria-hidden="true" />
            </div>
            <p className="eyebrow">{t("community.foundation.groomingEyebrow")}</p>
            <h2>
              {t("community.foundation.groomingTitle")}
            </h2>
            <p>
              {t("data.community.foundation.groomingPrevention")}
            </p>
            <ul>
              {[
                t("data.community.foundation.pillars.relationships"),
                t("data.community.foundation.pillars.boundaries"),
                t("data.community.foundation.pillars.awareness"),
                t("data.community.foundation.pillars.education"),
              ].map((pillar) => (
                <li key={pillar}>{pillar}</li>
              ))}
            </ul>
            <a
              href={peaceCultureFoundation.groomingPreventionUrl}
              target="_blank"
              rel="noreferrer"
              className="text-link"
            >
              {t("community.foundation.groomingCta")}
              <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          </article>
        </div>

        {/* PCF Photo Gallery */}
        <div className="foundation-archive">
          <p className="folio-mark">
            {t("community.foundation.photoEyebrow")}
          </p>
          <div className="foundation-archive__grid">
            {localizedPcfPhotos.map((photo) => {
              if ((photo as typeof photo & { featured?: boolean }).featured) {
                return (
                  <figure
                    key={photo.src}
                    className="foundation-archive__founder"
                  >
                    <div>
                      <ResponsiveImage
                        src={photo.src}
                        alt={photo.alt}
                        imgClassName="w-full object-contain"
                        loading="lazy"
                        sizes="(max-width: 639px) 100vw, 288px"
                      />
                      <figcaption>
                        <p className="eyebrow">{t("community.foundation.founder")}</p>
                        <h3 className="mt-3 text-3xl leading-tight text-ink sm:text-4xl">
                          {photo.title}
                        </h3>
                        <p className="mt-4 leading-7 text-charcoal/75">{photo.caption}</p>
                      </figcaption>
                    </div>
                  </figure>
                );
              }
              return (
                <figure
                  key={photo.src}
                  className="foundation-archive__photo"
                >
                  <ResponsiveImage
                    src={photo.src}
                    alt={photo.alt}
                    imgClassName="aspect-[4/3] w-full object-cover"
                    loading="lazy"
                    sizes="(max-width: 767px) 100vw, 33vw"
                  />
                  <figcaption>
                    <p>{photo.title}</p>
                    <small>{photo.caption}</small>
                  </figcaption>
                </figure>
              );
            })}
          </div>
        </div>
      </MotionSection>

      {/* Chiang Mai CMU */}
      <MotionSection
        id="cmu-aikido"
        className="container-shell cmu-story scroll-mt-28"
        ariaLabelledby="cmu-aikido-heading"
      >
        <div className="cmu-story__layout">
          <article className="cmu-study">
            <div className="relative min-h-[32rem] overflow-hidden bg-ink sm:min-h-[25rem]">
              <ResponsiveImage
                src={cmuHeroPhoto.src}
                alt={cmuHeroPhoto.alt}
                imgClassName="absolute inset-0 h-full w-full object-cover opacity-90"
                loading="lazy"
              />
              <div
                className="absolute inset-0 bg-gradient-to-t from-ink via-ink/35 to-transparent"
                aria-hidden="true"
              />
              <div className="cmu-study__logo">
                <ResponsiveImage
                  src={cmuAikidoClub.logo.src}
                  alt={cmuAikidoClub.logo.alt}
                  imgClassName="h-12 w-auto"
                  loading="lazy"
                  sizes="160px"
                />
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-6 text-paper sm:p-8">
                <p className="eyebrow text-paper/70">{t("community.cmu.heroEyebrow")}</p>
                <h2 className="mt-3 max-w-2xl text-3xl leading-tight sm:text-5xl">
                  {t("community.cmu.heroTitle")}
                </h2>
                <p className="mt-4 max-w-xl text-sm text-paper/75">
                  {cmuHeroPhoto.caption}
                </p>
              </div>
            </div>
            <div className="cmu-study__facts">
              <div>
                <CalendarDays className="text-vermilion" size={22} aria-hidden="true" />
                <p className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-charcoal/55">
                  {t("community.cmu.publicDays")}
                </p>
                <p className="mt-2 text-lg font-bold text-ink">
                  {t("data.community.cmu.practice.days")}
                </p>
              </div>
              <div>
                <UsersRound className="text-bamboo" size={22} aria-hidden="true" />
                <p className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-charcoal/55">
                  {t("community.cmu.community")}
                </p>
                <p className="mt-2 text-lg font-bold text-ink">
                  {t("community.cmu.studentsGuests")}
                </p>
              </div>
              <div>
                <GraduationCap className="text-wood" size={22} aria-hidden="true" />
                <p className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-charcoal/55">
                  {t("community.cmu.roots")}
                </p>
                <p className="mt-2 text-lg font-bold text-ink">
                  {t("community.cmu.since")}
                </p>
              </div>
            </div>
          </article>

          <div className="cmu-story__copy">
            <p className="eyebrow">{t("community.cmu.eyebrow")}</p>
            <h2 id="cmu-aikido-heading" className="section-title">
              {t("community.cmu.title")}
            </h2>
            <p className="section-copy">
              {t("community.cmu.copy1")}
            </p>
            <p className="mt-4 text-charcoal/78">
              {t("community.cmu.copy2")}
            </p>

            <div className="cmu-practice-note">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-vermilion/10 text-vermilion">
                  <CalendarDays size={22} aria-hidden="true" />
                </div>
                <div>
                  <h3 className="text-2xl text-ink">{t("community.cmu.publicPractice")}</h3>
                  <p className="mt-2 text-sm font-bold text-charcoal">
                    {t("data.community.cmu.practice.days")} - {t("data.community.cmu.practice.time")}
                  </p>
                  <p className="mt-3 text-sm text-charcoal/75">
                    {t("data.community.cmu.practice.location")}
                  </p>
                  <p className="mt-3 text-sm font-bold text-vermilion">
                    {t("data.community.cmu.practice.note")}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-7 flex items-start gap-3 text-sm text-charcoal/75">
              <MapPin className="mt-1 shrink-0 text-bamboo" size={20} aria-hidden="true" />
              <p>{t("data.community.cmu.address")}</p>
            </div>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              {cmuAikidoClub.links.map((link, index) => (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary"
                >
                  {cmuLinkLabels[index]}
                  <ArrowUpRight size={16} aria-hidden="true" />
                </a>
              ))}
              <a href={`mailto:${cmuAikidoClub.email}`} className="btn-primary">
                {t("common.emailAikidoCmu")}
              </a>
            </div>
          </div>
        </div>

        {/* CMU Photo Gallery */}
        <div className="cmu-contact-sheet">
          {cmuGalleryPhotos.map((photo, index) => (
            <figure
              key={photo.src}
              className={`cmu-contact-sheet__photo cmu-contact-sheet__photo--${index + 1}`}
            >
              <ResponsiveImage
                src={photo.src}
                alt={photo.alt}
                imgClassName="aspect-[4/3] w-full object-cover"
                loading="lazy"
              />
              <figcaption>
                <span>{photo.title}</span>
                <p>{photo.caption}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </MotionSection>

    </>
  );
}
