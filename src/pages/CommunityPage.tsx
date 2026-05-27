import {
  ArrowUpRight,
  CalendarDays,
  GraduationCap,
  HeartHandshake,
  MapPin,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { Link } from "react-router-dom";
import { MediaSlider } from "../components/MediaSlider";
import { MotionSection } from "../components/MotionSection";
import { ResponsiveImage } from "../components/ResponsiveImage";
import { historyMedia } from "../data/editableContent";
import {
  cmuAikidoClub,
  communityValues,
  pcfDojoPhotos,
  peaceCultureFoundation,
  relatedDojos,
} from "../data/siteContent";
import { useTranslation } from "../i18n";
import { useEditableContent } from "../lib/content";
import { assetPath } from "../utils/assetPath";

const upcomingEvents = [
  {
    title: "Community Practice Day",
    date: "Posted through dojo updates",
    description:
      "An open training session welcoming students from RenshinKan, AikidoCMU, and other connected dojos.",
  },
  {
    title: "Peace Culture Workshop",
    date: "Posted through dojo updates",
    description:
      "A foundation-connected workshop on peace education, safety, and community-building through aikido.",
  },
  {
    title: "Dojo Gathering",
    date: "Posted through dojo updates",
    description:
      "A student gathering with a shared meal, open mat, or volunteer day. Confirmed details are shared in the dojo updates.",
  },
];

export function CommunityPage() {
  const { t } = useTranslation();
  const { content } = useEditableContent();
  const activeHistoryMedia = content.historyMedia.length ? content.historyMedia : historyMedia;
  const [cmuHeroPhoto, ...cmuGalleryPhotos] = cmuAikidoClub.photos;

  return (
    <>
      {/* Intro */}
      <MotionSection className="container-shell py-20">
        <div className="grid items-center gap-10 lg:grid-cols-[1fr_0.85fr]">
          <div>
            <p className="eyebrow">{t("community.intro.eyebrow")}</p>
            <h1 className="section-title">
              {t("community.intro.title")}
            </h1>
            <p className="section-copy">
              {t("community.intro.copy")}
            </p>
          </div>
          <div className="flex items-center justify-center">
            <ResponsiveImage
              src={assetPath("/dojo-photos/pcf.png")}
              alt={t("community.intro.imageAlt")}
              imgClassName="w-full max-w-md rounded-[2rem] object-cover"
              style={{ maskImage: "radial-gradient(ellipse 88% 88% at 50% 50%, black 55%, transparent 100%)", WebkitMaskImage: "radial-gradient(ellipse 88% 88% at 50% 50%, black 55%, transparent 100%)" }}
              loading="eager"
              width={1459}
              height={1078}
            />
          </div>
        </div>
      </MotionSection>

      {/* Values */}
      <MotionSection className="container-shell pb-20">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {communityValues.map((value) => {
            const Icon = value.icon;
            return (
              <article key={value.title} className="surface card-hover rounded-[1.75rem] p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-bamboo/10 text-bamboo">
                  <Icon size={22} aria-hidden="true" />
                </div>
                <h2 className="mt-5 text-2xl text-ink">{value.title}</h2>
                <p className="mt-3 text-sm text-charcoal/75">{value.description}</p>
              </article>
            );
          })}
        </div>
      </MotionSection>

      {/* Upcoming Events */}
      <MotionSection id="upcoming-events" className="container-shell scroll-mt-28 pb-20">
        <div className="mb-8 max-w-3xl">
          <p className="eyebrow">{t("community.events.eyebrow")}</p>
          <h2 className="section-title">{t("community.events.title")}</h2>
          <p className="section-copy">
            {t("community.events.copy")}
          </p>
        </div>
        <div className="surface rounded-[2.5rem] overflow-hidden">
          {upcomingEvents.map((event, i) => (
            <div
              key={event.title}
              className={`flex items-start gap-6 px-10 py-9 sm:gap-10 sm:px-14 sm:py-11${
                i < upcomingEvents.length - 1 ? " border-b border-ink/[0.07]" : ""
              }`}
            >
              <div className="flex-none flex h-14 w-14 items-center justify-center rounded-full bg-vermilion/10 text-vermilion mt-0.5">
                <CalendarDays size={24} aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-bamboo">
                  {event.date}
                </p>
                <h3 className="mt-2 font-serif text-3xl text-ink sm:text-4xl">{event.title}</h3>
                <p className="mt-3 text-base text-charcoal/75 max-w-2xl">{event.description}</p>
              </div>
            </div>
          ))}
        </div>
      </MotionSection>

      {/* Past Events */}
      <MotionSection id="past-events" className="container-shell scroll-mt-28 pb-20">
        <div className="mb-8 max-w-3xl">
          <p className="eyebrow">{t("community.past.eyebrow")}</p>
          <h2 className="section-title">{t("community.past.title")}</h2>
          <p className="section-copy">
            {t("community.past.copy")}
          </p>
        </div>

        <MediaSlider media={activeHistoryMedia} label={t("community.past.sliderLabel")} />
      </MotionSection>

      {/* Peace Culture Foundation */}
      <MotionSection id="peace-culture" className="container-shell scroll-mt-28 pb-20">
        <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
          <article className="rounded-[2rem] bg-ink/90 p-8 text-paper backdrop-blur-sm sm:p-10">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="inline-flex w-fit rounded-[1.35rem] bg-paper px-4 py-3 shadow-soft">
                <img
                  src={peaceCultureFoundation.logo.src}
                  alt={peaceCultureFoundation.logo.alt}
                  className="h-16 w-auto object-contain"
                  loading="eager"
                />
              </div>
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-vermilion text-paper">
                <HeartHandshake size={26} aria-hidden="true" />
              </div>
            </div>
            <p className="eyebrow mt-7 text-mist/70">{t("community.foundation.eyebrow")}</p>
            <h2 className="mt-4 max-w-3xl text-4xl leading-tight sm:text-5xl">
              {t("community.foundation.title")}
            </h2>
            <p className="mt-5 max-w-2xl text-paper/75">
              {t("community.foundation.copy")}
            </p>
            <p className="mt-4 max-w-2xl text-paper/75">
              {peaceCultureFoundation.aikidoConnection}
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <a
                href={peaceCultureFoundation.homepageUrl}
                target="_blank"
                rel="noreferrer"
                className="btn-secondary border-paper/20 bg-paper/10 text-paper hover:text-paper"
              >
                {t("community.foundation.visit")}
                <ArrowUpRight size={16} aria-hidden="true" />
              </a>
              <a
                href={peaceCultureFoundation.advocacyUrl}
                target="_blank"
                rel="noreferrer"
                className="btn-secondary border-paper/20 bg-paper/10 text-paper hover:text-paper"
              >
                {t("community.foundation.advocacy")}
                <ArrowUpRight size={16} aria-hidden="true" />
              </a>
            </div>
          </article>

          <article className="surface rounded-[2rem] p-8 sm:p-10">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-bamboo/10 text-bamboo">
              <ShieldCheck size={26} aria-hidden="true" />
            </div>
            <p className="eyebrow mt-7">{t("community.foundation.groomingEyebrow")}</p>
            <h2 className="mt-4 text-4xl leading-tight text-ink sm:text-5xl">
              {t("community.foundation.groomingTitle")}
            </h2>
            <p className="mt-5 text-charcoal/78">
              {peaceCultureFoundation.groomingPrevention}
            </p>
            <ul className="mt-6 grid gap-3">
              {peaceCultureFoundation.pillars.map((pillar) => (
                <li key={pillar} className="flex items-center gap-3 text-sm font-bold text-charcoal/80">
                  <span className="h-2.5 w-2.5 rounded-full bg-vermilion" aria-hidden="true" />
                  {pillar}
                </li>
              ))}
            </ul>
            <a
              href={peaceCultureFoundation.groomingPreventionUrl}
              target="_blank"
              rel="noreferrer"
              className="btn-primary mt-7"
            >
              {t("community.foundation.groomingCta")}
              <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          </article>
        </div>

        {/* PCF Photo Gallery */}
        <div className="mt-8">
          <p className="mb-5 text-xs font-bold uppercase tracking-[0.16em] text-charcoal/55">
            {t("community.foundation.photoEyebrow")}
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pcfDojoPhotos.map((photo) => {
              if ((photo as typeof photo & { featured?: boolean }).featured) {
                return (
                  <figure
                    key={photo.src}
                    className="surface overflow-hidden rounded-[1.75rem] sm:col-span-2 lg:col-span-3"
                  >
                    <div className="grid sm:grid-cols-[auto_1fr] sm:items-center">
                      <img
                        src={photo.src}
                        alt={photo.alt}
                        className="w-full object-contain sm:w-auto sm:max-h-56 sm:max-w-sm"
                        loading="lazy"
                      />
                      <figcaption className="border-t border-ink/10 p-6 sm:border-l sm:border-t-0 sm:p-8">
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
                  className="surface card-hover overflow-hidden rounded-[1.75rem]"
                >
                  <img
                    src={photo.src}
                    alt={photo.alt}
                    className="aspect-[4/3] w-full object-cover"
                    loading="lazy"
                  />
                  <figcaption className="p-5">
                    <p className="font-bold text-ink">{photo.title}</p>
                    <p className="mt-2 text-sm text-charcoal/70">{photo.caption}</p>
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
        className="container-shell scroll-mt-28 pb-20"
        ariaLabelledby="cmu-aikido-heading"
      >
        <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
          <article className="surface overflow-hidden rounded-[2rem]">
            <div className="relative min-h-[25rem] overflow-hidden bg-ink">
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
              <div className="absolute left-5 top-5 rounded-2xl bg-paper/95 px-4 py-3 shadow-soft">
                <img
                  src={cmuAikidoClub.logo.src}
                  alt={cmuAikidoClub.logo.alt}
                  className="h-12 w-auto"
                  loading="lazy"
                />
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-6 text-paper sm:p-8">
                <p className="eyebrow text-paper/70">{t("community.cmu.heroEyebrow")}</p>
                <h2 className="mt-3 max-w-2xl text-4xl leading-tight sm:text-5xl">
                  {t("community.cmu.heroTitle")}
                </h2>
                <p className="mt-4 max-w-xl text-sm text-paper/75">
                  {cmuHeroPhoto.caption}
                </p>
              </div>
            </div>
            <div className="grid divide-y divide-ink/10 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <div className="p-5">
                <CalendarDays className="text-vermilion" size={22} aria-hidden="true" />
                <p className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-charcoal/55">
                  {t("community.cmu.publicDays")}
                </p>
                <p className="mt-2 text-lg font-bold text-ink">
                  {cmuAikidoClub.practice.days}
                </p>
              </div>
              <div className="p-5">
                <UsersRound className="text-bamboo" size={22} aria-hidden="true" />
                <p className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-charcoal/55">
                  {t("community.cmu.community")}
                </p>
                <p className="mt-2 text-lg font-bold text-ink">
                  {t("community.cmu.studentsGuests")}
                </p>
              </div>
              <div className="p-5">
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

          <div>
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

            <div className="mt-7 rounded-[2rem] bg-paper/70 p-6 shadow-line ring-1 ring-ink/10">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-vermilion/10 text-vermilion">
                  <CalendarDays size={22} aria-hidden="true" />
                </div>
                <div>
                  <h3 className="text-2xl text-ink">{t("community.cmu.publicPractice")}</h3>
                  <p className="mt-2 text-sm font-bold text-charcoal">
                    {cmuAikidoClub.practice.days} · {cmuAikidoClub.practice.time}
                  </p>
                  <p className="mt-3 text-sm text-charcoal/75">
                    {cmuAikidoClub.practice.location}
                  </p>
                  <p className="mt-3 text-sm font-bold text-vermilion">
                    {cmuAikidoClub.practice.note}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-7 flex items-start gap-3 text-sm text-charcoal/75">
              <MapPin className="mt-1 shrink-0 text-bamboo" size={20} aria-hidden="true" />
              <p>{cmuAikidoClub.address}</p>
            </div>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              {cmuAikidoClub.links.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary"
                >
                  {link.label}
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
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {cmuGalleryPhotos.map((photo) => (
            <figure
              key={photo.src}
              className="surface card-hover overflow-hidden rounded-[1.5rem]"
            >
              <ResponsiveImage
                src={photo.src}
                alt={photo.alt}
                imgClassName="aspect-[4/3] w-full object-cover"
                loading="lazy"
              />
              <figcaption className="p-5">
                <span className="text-lg font-bold text-ink">{photo.title}</span>
                <p className="mt-2 text-sm text-charcoal/72">{photo.caption}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </MotionSection>

      {/* Other Dojos */}
      <MotionSection id="other-dojos" className="container-shell scroll-mt-28 pb-20">
        <div className="mb-8 max-w-3xl">
          <p className="eyebrow">{t("community.otherDojos.eyebrow")}</p>
          <h2 className="section-title">{t("community.otherDojos.title")}</h2>
          <p className="section-copy">
            {t("community.otherDojos.copy")}
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {relatedDojos.map((dojo) => (
            <article
              key={dojo.name}
              className="surface card-hover rounded-[1.75rem] p-6 flex flex-col"
            >
              {dojo.logo ? (
                <div className="h-14 w-14 flex-none">
                  <img
                    src={dojo.logo}
                    alt={`${dojo.name} logo`}
                    className="h-full w-full object-contain"
                  />
                </div>
              ) : (
                <div className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-bamboo/10 text-bamboo">
                  <UsersRound size={22} aria-hidden="true" />
                </div>
              )}
              <h3 className="mt-5 text-2xl text-ink">{dojo.name}</h3>
              <p className="mt-1 text-xs font-bold uppercase tracking-[0.14em] text-charcoal/50">
                {dojo.location}
              </p>
              <p className="mt-3 flex-1 text-sm text-charcoal/75">{dojo.description}</p>
              {dojo.url ? (
                <a
                  href={dojo.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-vermilion transition hover:text-ink"
                >
                  {t("common.visitWebsite")}
                  <ArrowUpRight size={15} aria-hidden="true" />
                </a>
              ) : dojo.facebook ? (
                <a
                  href={dojo.facebook}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-vermilion transition hover:text-ink"
                >
                  {t("common.facebookPage")}
                  <ArrowUpRight size={15} aria-hidden="true" />
                </a>
              ) : null}
            </article>
          ))}
        </div>
        <div className="mt-8 rounded-[1.75rem] bg-bamboo/10 p-6 ring-1 ring-bamboo/20">
          <p className="text-sm text-charcoal/78">
            <span className="font-bold text-ink">{t("community.otherDojos.know")}</span>{" "}
            {t("community.otherDojos.knowCopy")}{" "}
            <Link to="/contact" className="font-bold text-vermilion hover:text-ink transition">
              {t("common.contactUs")}
            </Link>
          </p>
        </div>
      </MotionSection>
    </>
  );
}
