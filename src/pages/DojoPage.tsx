import { ArrowRight, BookOpen, ChevronLeft, ChevronRight, ExternalLink, GraduationCap, HandCoins, MessageCircle } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BrushCircleLogo } from "../components/BrushCircleLogo";
import { DojoJourney } from "../components/DojoJourney";
import { FacilityGrid } from "../components/FacilityGrid";
import { InstructorGrid } from "../components/InstructorGrid";
import { LocationCard } from "../components/LocationCard";
import { MediaSlider } from "../components/MediaSlider";
import { MotionSection } from "../components/MotionSection";
import { ResponsiveImage } from "../components/ResponsiveImage";
import { onTheMatMedia } from "../data/editableContent";
import { renshinkanBuildPhotos, dojoPhotos } from "../data/siteContent";
import { siteInfo } from "../data/siteMeta";
import { useTranslation } from "../i18n";
import { getPublishedRecentEvents, useEditableContent } from "../lib/content";
import { assetPath } from "../utils/assetPath";
import {
  dojoJourneyPhotoKeys,
  dojoPhotoKeys,
  translateDojoJourneyPhoto,
  translateDojoPhoto,
} from "../utils/siteContentTranslations";

export function DojoPage() {
  const { t } = useTranslation();
  const { content } = useEditableContent();
  const recentUpdates = getPublishedRecentEvents(content, 3);
  const matMedia = content.onTheMatMedia.length ? content.onTheMatMedia : onTheMatMedia;
  const localizedDojoPhotos = dojoPhotos.map((photo, index) => translateDojoPhoto(t, photo, dojoPhotoKeys[index]));
  const localizedDojoJourneyPhotos = renshinkanBuildPhotos.map((photo, index) =>
    translateDojoJourneyPhoto(t, photo, dojoJourneyPhotoKeys[index]),
  );
  const [activeSpacePhotoIndex, setActiveSpacePhotoIndex] = useState(0);
  const activeSpacePhoto = localizedDojoPhotos[activeSpacePhotoIndex];
  const spacePhotoOptions = localizedDojoPhotos.filter((_, index) => index !== activeSpacePhotoIndex);
  const shouldReduceMotion = useReducedMotion();
  const [recentEventIndex, setRecentEventIndex] = useState(0);

  useEffect(() => {
    if (shouldReduceMotion || recentUpdates.length === 0) return;
    const timer = setInterval(() => {
      setRecentEventIndex((i) => (i + 1) % recentUpdates.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [recentUpdates.length, shouldReduceMotion]);

  useEffect(() => {
    if (recentEventIndex >= recentUpdates.length) {
      setRecentEventIndex(0);
    }
  }, [recentEventIndex, recentUpdates.length]);

  const galleryImageMotion = shouldReduceMotion
    ? {
        initial: false as const,
        animate: { opacity: 1 },
        exit: { opacity: 1 },
        transition: { duration: 0 },
      }
    : {
        initial: { opacity: 0, scale: 1.015 },
        animate: { opacity: 1, scale: 1 },
        exit: { opacity: 0, scale: 0.995 },
        transition: { duration: 0.48, ease: [0.22, 1, 0.36, 1] },
      };
  const galleryCaptionMotion = shouldReduceMotion
    ? {
        initial: false as const,
        animate: { opacity: 1 },
        exit: { opacity: 1 },
        transition: { duration: 0 },
      }
    : {
        initial: { opacity: 0, y: 10 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: 6 },
        transition: { duration: 0.36, ease: [0.22, 1, 0.36, 1] },
      };

  return (
    <>
      <section id="home" className="relative isolate min-h-[var(--hero-viewport-height)] scroll-mt-28 overflow-hidden">
        <ResponsiveImage
          src={assetPath("/dojo-photos/new-hero-poster.png")}
          alt=""
          aria-hidden="true"
          imgClassName="absolute inset-0 h-full w-full object-cover"
          loading="eager"
          width={1672}
          height={941}
          fetchPriority="high"
        />

        <div className="relative container-shell grid min-h-[var(--hero-viewport-height)] place-items-center py-14 text-center sm:py-16">
          <div className="relative mx-auto max-w-5xl">
            <div className="absolute left-1/2 top-1/2 -z-10 h-[18rem] w-[18rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-bamboo/15 sm:h-[27rem] sm:w-[27rem]" />
            <BrushCircleLogo paintOn className="mx-auto mb-5 h-24 w-24 sm:h-36 sm:w-36 lg:h-40 lg:w-40" />
            <h1 className="mx-auto mt-3 max-w-4xl text-4xl leading-[0.98] text-ink sm:text-6xl lg:text-7xl">
              {t("common.brand")}
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-charcoal/80 sm:text-lg sm:leading-8">
              {t("home.hero.subtitle")}
            </p>
            <div className="mt-7 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
              <Link to="/classes" className="btn-primary sm:w-auto">
                <GraduationCap size={18} aria-hidden="true" />
                {t("common.visitClass")}
              </Link>
              <Link to="/aikido#history-philosophy" className="btn-secondary sm:w-auto">
                <BookOpen size={18} aria-hidden="true" />
                {t("common.learnAboutAikido")}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <MotionSection className="container-shell py-16">
        <div className="rounded-[2rem] bg-paper/75 p-5 shadow-line ring-1 ring-ink/10 sm:p-8 lg:p-10">
          <div className="grid gap-10 lg:grid-cols-[0.72fr_1.28fr] lg:items-start">
            <div>
              <p className="eyebrow">{t("home.recent.eyebrow")}</p>
              <h2 className="mt-3 text-3xl leading-tight text-ink sm:text-4xl">
                {t("home.recent.title")}
              </h2>
              <p className="mt-4 text-charcoal/78">
                {t("home.recent.copy")}
              </p>
              <div className="mt-6 flex flex-col items-start gap-3">
                <Link to="/newsletter#recent-events" className="btn-secondary">
                  {t("common.readMore")}
                  <ArrowRight size={17} aria-hidden="true" />
                </Link>
                <Link
                  to="/newsletter#newsletter-signup"
                  className="inline-flex items-center gap-2 rounded-full border border-bamboo/25 bg-bamboo/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-bamboo transition hover:border-bamboo/45 hover:bg-bamboo/15 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bamboo"
                >
                  {t("home.recent.newsletterSignupCta")}
                  <ArrowRight size={14} aria-hidden="true" />
                </Link>
              </div>
            </div>
            <div>
              {recentUpdates.length > 0 ? (
                <>
                  <div className="relative h-[28rem] overflow-hidden rounded-[1.75rem] border border-ink/10 bg-paper/65 sm:h-[24rem] lg:h-[21rem]">
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.div
                        key={recentEventIndex}
                        initial={shouldReduceMotion ? false as const : { opacity: 0, x: 28 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: -20 }}
                        transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
                        className="grid h-full grid-rows-[auto_1fr] gap-0 lg:grid-cols-[0.86fr_1fr] lg:grid-rows-1"
                      >
                        <ResponsiveImage
                          src={
                            recentUpdates[recentEventIndex].image?.src ||
                            recentUpdates[recentEventIndex].media?.find((item) => item.type === "image")?.src ||
                            assetPath("/dojo-photos/aikido-hero-new.png")
                          }
                          alt={`${recentUpdates[recentEventIndex].title} at ${t("common.brand")}.`}
                          imgClassName="h-40 w-full object-cover sm:h-44 lg:h-full"
                          loading="lazy"
                        />
                        <div className="flex min-h-0 flex-col overflow-hidden p-6 sm:p-8">
                          <p className="text-xs font-bold uppercase tracking-[0.16em] text-bamboo">
                            {recentUpdates[recentEventIndex].date}
                          </p>
                          <h3 className="mt-3 line-clamp-2 text-2xl leading-tight text-ink sm:text-3xl">
                            {recentUpdates[recentEventIndex].title}
                          </h3>
                          <p className="mt-3 line-clamp-3 text-sm leading-7 text-charcoal/75 sm:line-clamp-4">
                            {recentUpdates[recentEventIndex].summary}
                          </p>
                          <Link
                            to={`/newsletter#${recentUpdates[recentEventIndex].slug}`}
                            className="mt-auto inline-flex items-center gap-2 pt-5 text-sm font-bold text-vermilion transition hover:text-ink"
                          >
                            {t("common.viewUpdate")}
                            <ArrowRight size={15} aria-hidden="true" />
                          </Link>
                        </div>
                      </motion.div>
                    </AnimatePresence>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {recentUpdates.map((_, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setRecentEventIndex(i)}
                          className={`h-2 rounded-full transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bamboo ${
                            i === recentEventIndex ? "w-6 bg-bamboo" : "w-2 bg-ink/20 hover:bg-ink/40"
                          }`}
                          aria-label={t("a11y.goToEvent", { number: i + 1 })}
                        />
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setRecentEventIndex((i) => (i === 0 ? recentUpdates.length - 1 : i - 1))}
                        className="flex h-10 w-10 items-center justify-center rounded-full border border-ink/10 bg-paper/65 transition hover:bg-paper/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bamboo"
                        aria-label={t("a11y.previousEvent")}
                      >
                        <ChevronLeft size={18} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setRecentEventIndex((i) => (i + 1) % recentUpdates.length)}
                        className="flex h-10 w-10 items-center justify-center rounded-full border border-ink/10 bg-paper/65 transition hover:bg-paper/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bamboo"
                        aria-label={t("a11y.nextEvent")}
                      >
                        <ChevronRight size={18} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-[1.75rem] border border-ink/10 bg-paper/65 p-7 text-sm leading-6 text-charcoal/72">
                  {t("newsletter.recent.empty")}
                </div>
              )}
            </div>
          </div>
        </div>
      </MotionSection>

      <MotionSection className="container-shell pb-20">
        <div className="rounded-[2rem] bg-bamboo/10 p-6 shadow-line ring-1 ring-bamboo/20 sm:p-10">
          <p className="eyebrow">{t("home.support.eyebrow")}</p>
          <h2 className="mt-4 max-w-3xl text-3xl leading-tight text-ink sm:text-5xl">
            {t("home.support.title")}
          </h2>
          <p className="mt-5 max-w-2xl text-charcoal/78">
            {t("home.support.copy")}
          </p>
          <Link to="/support#monthly-contribution" className="btn-primary mt-7">
            <HandCoins size={18} aria-hidden="true" />
            {t("home.support.cta")}
          </Link>
        </div>
      </MotionSection>

      <MotionSection id="dojo" className="container-shell scroll-mt-28 pb-20">
        <div className="mb-8 max-w-3xl">
          <p className="eyebrow">{t("home.facilities.eyebrow")}</p>
          <h2 className="section-title">{t("home.facilities.title")}</h2>
          <p className="section-copy">
            {t("home.facilities.copy", { year: siteInfo.builtYear })}
          </p>
        </div>
        <FacilityGrid />
      </MotionSection>

      <MotionSection id="instructors" className="container-shell scroll-mt-28 pb-20">
        <div className="mb-9 max-w-3xl">
          <p className="eyebrow">{t("home.instructors.eyebrow")}</p>
          <h2 className="section-title">{t("home.instructors.title")}</h2>
          <p className="section-copy">
            {t("home.instructors.copy")}
          </p>
        </div>
        <InstructorGrid />
      </MotionSection>

      <MotionSection id="dojo-photos" className="container-shell scroll-mt-28 pb-20">
        <div className="mb-9">
          <p className="eyebrow">{t("home.photos.eyebrow")}</p>
          <h2 className="section-title">{t("home.photos.title")}</h2>
          <p className="section-copy">
            {t("home.photos.copy")}
          </p>
        </div>

        <p className="mb-5 text-xs font-bold uppercase tracking-[0.16em] text-charcoal/55">
          {t("home.photos.space")}
        </p>
        <div className="mb-10 grid gap-3 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
          <figure className="relative aspect-[16/10] overflow-hidden rounded-[1.4rem] bg-paper/70 shadow-line ring-1 ring-ink/10 sm:aspect-[16/9] sm:rounded-[1.75rem]">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={activeSpacePhoto.src}
                className="absolute inset-0 h-full w-full object-cover"
                {...galleryImageMotion}
              >
                <ResponsiveImage
                  src={activeSpacePhoto.src}
                  alt={activeSpacePhoto.alt}
                  imgClassName="h-full w-full object-cover"
                  loading="lazy"
                />
              </motion.div>
            </AnimatePresence>
            <AnimatePresence mode="wait" initial={false}>
              <motion.figcaption
                key={`${activeSpacePhoto.src}-caption`}
                className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/85 via-ink/45 to-transparent p-3 text-paper sm:p-6"
                {...galleryCaptionMotion}
              >
                <h3 className="text-xl leading-tight sm:text-2xl">{activeSpacePhoto.title}</h3>
                <p className="mt-1 max-w-2xl text-sm leading-5 text-paper/82 sm:mt-2 sm:leading-6">
                  {activeSpacePhoto.description}
                </p>
              </motion.figcaption>
            </AnimatePresence>
          </figure>

          <div className="grid grid-cols-3 gap-2 sm:gap-4 lg:grid-cols-1 lg:grid-rows-3">
            {spacePhotoOptions.map((photo) => {
              const photoIndex = localizedDojoPhotos.findIndex((item) => item.src === photo.src);

              return (
                <button
                  key={photo.src}
                  type="button"
                  onClick={() => setActiveSpacePhotoIndex(photoIndex)}
                  className="group relative aspect-square overflow-hidden rounded-[1rem] bg-paper/65 text-left shadow-line ring-1 ring-ink/10 transition hover:-translate-y-0.5 hover:bg-paper/90 hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bamboo sm:grid sm:aspect-auto sm:rounded-[1.35rem] sm:grid-rows-[auto_1fr] lg:min-h-0 lg:grid-cols-[7.5rem_minmax(0,1fr)] lg:grid-rows-1"
                  aria-label={t("a11y.showPhoto", { title: photo.title })}
                >
                  <ResponsiveImage
                    src={photo.src}
                    alt=""
                    imgClassName="h-full w-full object-cover sm:aspect-[4/3] lg:h-full lg:min-h-0"
                    loading="lazy"
                  />
                  <span className="absolute inset-x-0 bottom-0 block bg-gradient-to-t from-ink/80 to-transparent p-2 text-paper sm:static sm:bg-none sm:p-4 sm:text-ink">
                    <span className="block text-xs font-bold leading-tight sm:text-lg sm:font-normal">{photo.title}</span>
                    <span className="mt-1 hidden text-sm leading-5 text-charcoal/68 sm:line-clamp-2 sm:block">
                      {photo.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mb-5">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-charcoal/55">
            {t("home.photos.onMat")}
          </p>
        </div>
        <MediaSlider media={matMedia} label={t("home.photos.onMatGallery")} showIndexNavigation />
      </MotionSection>

      <MotionSection id="dojo-history" className="container-shell scroll-mt-28 pb-20">
        <div className="mb-9 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="eyebrow">{t("home.journey.eyebrow")}</p>
            <h2 className="section-title">{t("home.journey.title")}</h2>
            <p className="section-copy">
              {t("home.journey.copy")}
            </p>
          </div>
          <a
            href={siteInfo.foundationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary"
          >
            {t("common.sourceGallery")}
            <ExternalLink size={17} aria-hidden="true" />
          </a>
        </div>
        <DojoJourney photos={localizedDojoJourneyPhotos} />
      </MotionSection>

      <MotionSection id="location" className="container-shell scroll-mt-28 pb-20">
        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-stretch">
          <article className="rounded-[2rem] bg-paper/75 p-6 shadow-line ring-1 ring-ink/10 sm:p-10">
            <p className="eyebrow">{t("home.location.eyebrow")}</p>
            <h2 className="mt-4 text-3xl leading-tight text-ink sm:text-5xl">
              {t("home.location.title")}
            </h2>
            <p className="mt-5 text-charcoal/78">
              {t("home.location.copy")}
            </p>
            <Link to="/contact" className="btn-primary mt-7">
              {t("common.planYourVisit")}
            </Link>
          </article>
          <LocationCard />
        </div>
      </MotionSection>

      <MotionSection className="container-shell pb-20">
        <div className="rounded-[2rem] bg-bamboo/10 p-6 shadow-line ring-1 ring-bamboo/20 sm:p-10">
          <p className="eyebrow">{t("home.visiting.eyebrow")}</p>
          <h2 className="mt-4 max-w-3xl text-3xl leading-tight text-ink sm:text-5xl">
            {t("home.visiting.title")}
          </h2>
          <p className="mt-5 max-w-2xl text-charcoal/78">
            {t("home.visiting.copy")}
          </p>
          <Link to="/contact" className="btn-primary mt-7">
            <MessageCircle size={18} aria-hidden="true" />
            {t("common.getInTouch")}
          </Link>
        </div>
      </MotionSection>
    </>
  );
}
