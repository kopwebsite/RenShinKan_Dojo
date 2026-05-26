import { ArrowRight, BookOpen, ChevronLeft, ChevronRight, ExternalLink, GraduationCap, MessageCircle } from "lucide-react";
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
import { getRecentDojoUpdates, onTheMatMedia } from "../data/editableContent";
import { renshinkanBuildPhotos, dojoPhotos, siteInfo } from "../data/siteContent";
import { assetPath } from "../utils/assetPath";

export function DojoPage() {
  const recentUpdates = getRecentDojoUpdates(3);
  const [activeSpacePhotoIndex, setActiveSpacePhotoIndex] = useState(0);
  const activeSpacePhoto = dojoPhotos[activeSpacePhotoIndex];
  const spacePhotoOptions = dojoPhotos.filter((_, index) => index !== activeSpacePhotoIndex);
  const shouldReduceMotion = useReducedMotion();
  const [recentEventIndex, setRecentEventIndex] = useState(0);

  useEffect(() => {
    if (shouldReduceMotion) return;
    const timer = setInterval(() => {
      setRecentEventIndex((i) => (i + 1) % recentUpdates.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [recentUpdates.length, shouldReduceMotion]);

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
      <section id="home" className="relative isolate min-h-[100svh] scroll-mt-28 overflow-hidden">
        {/* Watercolour koi background */}
        <img
          src={assetPath("/dojo-photos/new-hero-poster.png")}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover"
          fetchPriority="high"
        />

        <div className="relative container-shell grid min-h-[100svh] place-items-center py-16 text-center">
          <div className="relative mx-auto max-w-5xl">
            <div className="absolute left-1/2 top-1/2 -z-10 h-[18rem] w-[18rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-bamboo/15 sm:h-[27rem] sm:w-[27rem]" />
            <BrushCircleLogo paintOn className="mx-auto mb-5 h-28 w-28 sm:h-40 sm:w-40" />
            <h1 className="mx-auto mt-3 max-w-4xl text-5xl leading-[0.98] text-ink sm:text-6xl lg:text-7xl">
              RenShinKan Dojo
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-charcoal/80 sm:text-lg sm:leading-8">
              Traditional aikido and martial arts training in Hang Dong, Chiang Mai.
              Beginner friendly classes, children welcome, and visiting aikidoka invited.
            </p>
            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link to="/classes" className="btn-primary">
                <GraduationCap size={18} aria-hidden="true" />
                Visit a Class
              </Link>
              <Link to="/aikido#history-philosophy" className="btn-secondary">
                <BookOpen size={18} aria-hidden="true" />
                Learn about Aikido
              </Link>
            </div>
          </div>
        </div>
      </section>

      <MotionSection className="container-shell py-16">
        <div className="rounded-[2rem] bg-paper/75 p-6 shadow-line ring-1 ring-ink/10 sm:p-10 lg:p-12">
          <div className="grid gap-10 lg:grid-cols-[0.72fr_1.28fr] lg:items-start">
            <div>
              <p className="eyebrow">Recent Events</p>
              <h2 className="mt-3 text-3xl leading-tight text-ink sm:text-4xl">
                Recent dojo updates, gathered in one place.
              </h2>
              <p className="mt-4 text-charcoal/78">
                The three newest updates from training days, examinations,
                seminars, and community moments at RenshinKan.
              </p>
              <Link to="/newsletter#recent-events" className="btn-secondary mt-6">
                Read More
                <ArrowRight size={17} aria-hidden="true" />
              </Link>
            </div>
            <div>
              <div className="relative overflow-hidden rounded-[1.75rem] border border-ink/10 bg-paper/65">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={recentEventIndex}
                    initial={shouldReduceMotion ? false as const : { opacity: 0, x: 28 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: -20 }}
                    transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
                    className="grid gap-0 lg:grid-cols-[0.86fr_1fr]"
                  >
                    <img
                      src={recentUpdates[recentEventIndex].mainImage}
                      alt={`${recentUpdates[recentEventIndex].subject} at RenshinKan Dojo.`}
                      className="aspect-[4/3] h-full w-full object-cover"
                      loading="lazy"
                    />
                    <div className="p-7 sm:p-9">
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-bamboo">
                        {recentUpdates[recentEventIndex].date}
                      </p>
                      <h3 className="mt-4 text-3xl leading-tight text-ink sm:text-4xl">
                        {recentUpdates[recentEventIndex].subject}
                      </h3>
                      <p className="mt-4 text-sm leading-7 text-charcoal/75">
                        {recentUpdates[recentEventIndex].summary}
                      </p>
                      <Link
                        to={`/newsletter#${recentUpdates[recentEventIndex].slug}`}
                        className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-vermilion transition hover:text-ink"
                      >
                        View update
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
                      aria-label={`Go to event ${i + 1}`}
                    />
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setRecentEventIndex((i) => (i === 0 ? recentUpdates.length - 1 : i - 1))}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-ink/10 bg-paper/65 transition hover:bg-paper/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bamboo"
                    aria-label="Previous event"
                  >
                    <ChevronLeft size={18} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecentEventIndex((i) => (i + 1) % recentUpdates.length)}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-ink/10 bg-paper/65 transition hover:bg-paper/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bamboo"
                    aria-label="Next event"
                  >
                    <ChevronRight size={18} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </MotionSection>

      <MotionSection id="facilities" className="container-shell pb-20">
        <div className="mb-8 max-w-3xl">
          <p className="eyebrow">Our Dojo</p>
          <h2 className="section-title">A welcoming practice space for students of all ages in Hang Dong.</h2>
          <p className="section-copy">
            RenshinKan was built in {siteInfo.builtYear} on a quiet property in
            Hang Dong. The space is designed for comfortable, focused practice
            for students of all ages.
          </p>
        </div>
        <FacilityGrid />
      </MotionSection>

      <MotionSection id="instructors" className="container-shell scroll-mt-28 pb-20">
        <div className="mb-9 max-w-3xl">
          <p className="eyebrow">Who Teaches Here</p>
          <h2 className="section-title">People who genuinely love what they teach.</h2>
          <p className="section-copy">
            Our instructors have been practicing for decades and they care about
            the people they teach. You will find them patient, encouraging, and
            consistent at every level.
          </p>
        </div>
        <InstructorGrid />
      </MotionSection>

      <MotionSection id="dojo-photos" className="container-shell scroll-mt-28 pb-20">
        <div className="mb-9">
          <p className="eyebrow">Dojo Photos</p>
          <h2 className="section-title">A peek inside RenshinKan.</h2>
          <p className="section-copy">
            Take a look at the dojo and the people who train here.
          </p>
        </div>

        <p className="mb-5 text-xs font-bold uppercase tracking-[0.16em] text-charcoal/55">
          The Space
        </p>
        <div className="mb-10 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
          <figure className="relative aspect-[16/9] overflow-hidden rounded-[1.75rem] bg-paper/70 shadow-line ring-1 ring-ink/10">
            <AnimatePresence mode="wait" initial={false}>
              <motion.img
                key={activeSpacePhoto.src}
                src={activeSpacePhoto.src}
                alt={activeSpacePhoto.alt}
                className="absolute inset-0 h-full w-full object-cover"
                loading="lazy"
                {...galleryImageMotion}
              />
            </AnimatePresence>
            <AnimatePresence mode="wait" initial={false}>
              <motion.figcaption
                key={`${activeSpacePhoto.src}-caption`}
                className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/85 via-ink/45 to-transparent p-5 text-paper sm:p-6"
                {...galleryCaptionMotion}
              >
                <h3 className="text-2xl leading-tight">{activeSpacePhoto.title}</h3>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-paper/82">
                  {activeSpacePhoto.description}
                </p>
              </motion.figcaption>
            </AnimatePresence>
          </figure>

          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1 lg:grid-rows-3">
            {spacePhotoOptions.map((photo) => {
              const photoIndex = dojoPhotos.findIndex((item) => item.src === photo.src);

              return (
                <button
                  key={photo.src}
                  type="button"
                  onClick={() => setActiveSpacePhotoIndex(photoIndex)}
                  className="group grid overflow-hidden rounded-[1.35rem] bg-paper/65 text-left shadow-line ring-1 ring-ink/10 transition hover:-translate-y-0.5 hover:bg-paper/90 hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bamboo sm:grid-rows-[auto_1fr] lg:min-h-0 lg:grid-cols-[7.5rem_minmax(0,1fr)] lg:grid-rows-1"
                  aria-label={`Show ${photo.title}`}
                >
                  <img
                    src={photo.src}
                    alt=""
                    className="aspect-[4/3] w-full object-cover lg:h-full lg:min-h-0"
                    loading="lazy"
                  />
                  <span className="block p-4">
                    <span className="block text-lg leading-tight text-ink">{photo.title}</span>
                    <span className="mt-1 line-clamp-2 block text-sm leading-5 text-charcoal/68">
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
            On the Mat
          </p>
          <p className="mt-2 max-w-2xl text-sm text-charcoal/70">
            Current class photos, techniques, seminars, and practice moments.
          </p>
        </div>
        <MediaSlider media={onTheMatMedia} label="On the Mat gallery" />
      </MotionSection>

      <MotionSection id="dojo-history" className="container-shell scroll-mt-28 pb-20">
        <div className="mb-9 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="eyebrow">Dojo Journey</p>
            <h2 className="section-title">From open ground to a working mat.</h2>
            <p className="section-copy">
              Photos from the Peace Culture Foundation build gallery, following
              RenshinKan from an empty plot of land all the way to opening
              practice on the mat.
            </p>
          </div>
          <a
            href={siteInfo.foundationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary"
          >
            Source Gallery
            <ExternalLink size={17} aria-hidden="true" />
          </a>
        </div>
        <DojoJourney photos={renshinkanBuildPhotos} />
      </MotionSection>

      <MotionSection id="location" className="container-shell scroll-mt-28 pb-20">
        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-stretch">
          <article className="rounded-[2rem] bg-paper/75 p-8 shadow-line ring-1 ring-ink/10 sm:p-10">
            <p className="eyebrow">Getting Here</p>
            <h2 className="mt-4 text-4xl leading-tight text-ink sm:text-5xl">
              Find the dojo before your first visit.
            </h2>
            <p className="mt-5 text-charcoal/78">
              RenshinKan Dojo is in Baan Waen, Hang Dong. Parents and visitors
              can use the map to plan arrival, then message ahead so the dojo can
              confirm the best class time and where to observe.
            </p>
            <Link to="/contact" className="btn-primary mt-7">
              Plan Your Visit
            </Link>
          </article>
          <LocationCard />
        </div>
      </MotionSection>

      <MotionSection className="container-shell pb-20">
        <div className="rounded-[2rem] bg-bamboo/10 p-8 shadow-line ring-1 ring-bamboo/20 sm:p-10">
          <p className="eyebrow">Visiting RenshinKan</p>
          <h2 className="mt-4 max-w-3xl text-4xl leading-tight text-ink sm:text-5xl">
            Drop-ins are always welcome.
          </h2>
          <p className="mt-5 max-w-2xl text-charcoal/78">
            If you're new, feel free to come along. Just turn up at class time.
            If you're a visiting aikidoka, we'd love a quick message ahead so we
            can make sure the timing works and someone can greet you properly.
          </p>
          <Link to="/contact" className="btn-primary mt-7">
            <MessageCircle size={18} aria-hidden="true" />
            Get in Touch
          </Link>
        </div>
      </MotionSection>
    </>
  );
}
