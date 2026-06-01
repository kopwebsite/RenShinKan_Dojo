import {
  ArrowUpRight,
  Camera,
  ShieldCheck,
  Sparkles,
  Swords,
  UsersRound,
} from "lucide-react";
import { Link } from "react-router-dom";
import { MotionSection } from "../components/MotionSection";
import { ResponsiveImage } from "../components/ResponsiveImage";
import { Timeline } from "../components/Timeline";
import type { HistoricalPhoto } from "../data/siteContent";
import {
  aikidoActionImages,
  aikidoBenefits,
  aikidoForAdults,
  aikidoForChildren,
  aikidoHistoricalPhotos,
  aikidoHistorySections,
  aikidoHistorySources,
  instructorSource,
  instructors,
  pcfAikidoImages,
} from "../data/siteContent";
import { useTranslation } from "../i18n";
import { assetPath } from "../utils/assetPath";

function HistoricalFigure({
  photo,
  featured = false,
  story = false,
}: {
  photo: HistoricalPhoto;
  featured?: boolean;
  story?: boolean;
}) {
  return (
    <figure
      className={`surface card-hover overflow-hidden rounded-[2rem] ${
        featured ? "md:col-span-2 xl:col-span-2" : ""
      }`}
    >
      <div className="relative bg-ink/5">
        <ResponsiveImage
          src={photo.src}
          alt={photo.alt}
          imgClassName={`w-full object-cover grayscale ${
            story || featured ? "aspect-[4/3]" : "aspect-[3/4]"
          }`}
          objectPosition={photo.objectPosition}
          loading={featured ? "eager" : "lazy"}
        />
        <div className="absolute left-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-paper/85 text-vermilion shadow-line">
          <Camera size={18} aria-hidden="true" />
        </div>
      </div>
      <figcaption className="p-5">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-bamboo">
          {photo.date}
        </p>
        <h3 className="mt-2 text-2xl text-ink">{photo.title}</h3>
        <p className="mt-2 text-sm text-charcoal/75">{photo.caption}</p>
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-charcoal/55">
          {photo.credit}
        </p>
        <p className="mt-3 text-xs leading-5 text-charcoal/65">{photo.rightsNote}</p>
        <a
          href={photo.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-[0.14em] text-vermilion transition hover:text-ink"
        >
          {photo.sourceName}
          <ArrowUpRight size={14} aria-hidden="true" />
        </a>
      </figcaption>
    </figure>
  );
}

export function AikidoPage() {
  const { t } = useTranslation();
  const historicalPhotoById = new Map(
    aikidoHistoricalPhotos.map((photo) => [photo.id, photo]),
  );

  return (
    <>
      {/* Aikido hero */}
      <section id="what-is-aikido" className="relative isolate min-h-[var(--hero-viewport-height)] overflow-hidden scroll-mt-28">
        <ResponsiveImage
          src={assetPath("/dojo-photos/aikido-hero-new.png")}
          alt=""
          aria-hidden="true"
          imgClassName="absolute inset-0 h-full w-full object-cover"
          loading="eager"
          width={1881}
          height={836}
          fetchPriority="high"
        />
        <div className="relative flex min-h-[var(--hero-viewport-height)] items-center justify-center py-16 text-center sm:py-20">
          <div className="mx-auto max-w-3xl px-5 sm:px-8">
            <h1 className="mx-auto mt-3 max-w-3xl text-4xl leading-[0.98] text-ink sm:text-6xl lg:text-7xl">
              {t("aikido.hero.title")}
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-charcoal/80 sm:text-lg sm:leading-8">
              {t("aikido.hero.subtitle")}
            </p>
          </div>
        </div>
      </section>

      {/* What Is Aikido? */}
      <MotionSection id="aikido-overview" className="container-shell scroll-mt-28 py-20">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <figure className="surface overflow-hidden rounded-[2rem]">
            <ResponsiveImage
              src={pcfAikidoImages.classPractice.src}
              alt={pcfAikidoImages.classPractice.alt}
              imgClassName="aspect-[4/3] w-full object-cover"
            />
          </figure>
          <div>
            <p className="eyebrow">{t("aikido.about.eyebrow")}</p>
            <h2 className="section-title">{t("aikido.about.title")}</h2>
            <p className="mt-5 text-base leading-7 text-charcoal/80 sm:text-lg">
              {t("aikido.about.copy")}
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {[
                {
                  title: t("aikido.about.point1Title"),
                  body: t("aikido.about.point1Body"),
                },
                {
                  title: t("aikido.about.point2Title"),
                  body: t("aikido.about.point2Body"),
                },
                {
                  title: t("aikido.about.point3Title"),
                  body: t("aikido.about.point3Body"),
                },
              ].map((pt) => (
                <div key={pt.title} className="rounded-2xl bg-bamboo/10 px-5 py-4">
                  <p className="text-sm font-bold text-ink">{pt.title}</p>
                  <p className="mt-1 text-xs leading-5 text-charcoal/70">{pt.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <figure className="surface card-hover overflow-hidden rounded-[2rem]">
            <ResponsiveImage
              src={pcfAikidoImages.joBokken.src}
              alt={pcfAikidoImages.joBokken.alt}
              imgClassName="aspect-video w-full object-cover"
              loading="lazy"
            />
            <figcaption className="p-5">
              <h3 className="text-2xl text-ink">{t("aikido.about.traditionTitle")}</h3>
              <p className="mt-2 text-sm text-charcoal/75">
                {t("aikido.about.traditionCopy")}
              </p>
            </figcaption>
          </figure>
          <figure className="surface card-hover overflow-hidden rounded-[2rem]">
            <ResponsiveImage
              src={pcfAikidoImages.kamiza.src}
              alt={pcfAikidoImages.kamiza.alt}
              imgClassName="aspect-video w-full object-cover"
              loading="lazy"
            />
            <figcaption className="p-5">
              <h3 className="text-2xl text-ink">{t("aikido.about.spaceTitle")}</h3>
              <p className="mt-2 text-sm text-charcoal/75">
                {t("aikido.about.spaceCopy")}
              </p>
            </figcaption>
          </figure>
        </div>

        <div className="surface mt-10 rounded-[2rem] p-6 sm:mt-12 sm:p-8 lg:p-10">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-bamboo/10 text-bamboo">
              <Swords size={20} aria-hidden="true" />
            </div>
            <div className="max-w-2xl">
              <h3 className="text-2xl text-ink sm:text-3xl">
                {t("aikido.overview.weaponsTitle")}
              </h3>
              <p className="mt-3 text-base leading-7 text-charcoal/80">
                {t("aikido.overview.weaponsIntro")}
              </p>
            </div>
          </div>
          <div className="mt-7 grid gap-3 min-[420px]:gap-4 sm:grid-cols-3">
            {[
              {
                name: t("aikido.overview.bokkenName"),
                meaning: t("aikido.overview.bokkenMeaning"),
                description: t("aikido.overview.bokkenDesc"),
              },
              {
                name: t("aikido.overview.joName"),
                meaning: t("aikido.overview.joMeaning"),
                description: t("aikido.overview.joDesc"),
              },
              {
                name: t("aikido.overview.tantoName"),
                meaning: t("aikido.overview.tantoMeaning"),
                description: t("aikido.overview.tantoDesc"),
              },
            ].map((weapon) => (
              <div key={weapon.name} className="rounded-2xl bg-bamboo/10 px-5 py-4">
                <h4 className="text-lg font-bold text-ink">{weapon.name}</h4>
                <p className="mt-0.5 text-[0.7rem] font-bold uppercase tracking-[0.14em] text-bamboo">
                  {weapon.meaning}
                </p>
                <p className="mt-2 text-sm leading-6 text-charcoal/75">
                  {weapon.description}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 sm:gap-4">
            {[
              {
                image: aikidoActionImages.joTraining,
                caption: "Paired jo practice",
              },
              {
                image: aikidoActionImages.tantoTechnique,
                caption: "Tanto disarm and throw",
              },
            ].map((item) => (
              <figure
                key={item.caption}
                className="overflow-hidden rounded-2xl border border-ink/10 bg-ink/5"
              >
                <ResponsiveImage
                  src={item.image.src}
                  alt={item.image.alt}
                  imgClassName="aspect-[16/10] w-full object-cover"
                  loading="lazy"
                />
                <figcaption className="px-4 py-3 text-[0.7rem] font-bold uppercase tracking-[0.14em] text-charcoal/60">
                  {item.caption}
                </figcaption>
              </figure>
            ))}
          </div>
          <p className="mt-6 max-w-3xl text-base leading-7 text-charcoal/80">
            {t("aikido.overview.weaponsClose")}
          </p>
        </div>
      </MotionSection>

      {/* Why Pick Aikido? */}
      <MotionSection id="why-aikido" className="container-shell scroll-mt-28 pb-20">
        <div className="max-w-3xl">
          <p className="eyebrow">{t("aikido.why.eyebrow")}</p>
          <h2 className="section-title">{t("aikido.why.title")}</h2>
          <p className="section-copy">{t("aikido.why.intro")}</p>
        </div>

        <div className="mt-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-bamboo">
            {t("aikido.why.benefitsLabel")}
          </p>
          <div className="mt-4 grid gap-3 min-[420px]:gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {aikidoBenefits.map((benefit) => (
              <div
                key={benefit.title}
                className="rounded-2xl border border-ink/10 bg-bamboo/10 p-5"
              >
                <p className="text-base font-bold text-ink">{benefit.title}</p>
                <p className="mt-1.5 text-sm leading-6 text-charcoal/75">
                  {benefit.description}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 grid gap-5 lg:grid-cols-2 lg:items-stretch">
          <div className="surface rounded-[2rem] p-6 sm:p-8">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-bamboo/10 text-bamboo">
              <ShieldCheck size={20} aria-hidden="true" />
            </div>
            <h3 className="mt-5 text-2xl text-ink sm:text-3xl">
              {t("aikido.why.ukemiTitle")}
            </h3>
            <div className="mt-4 grid gap-4 text-base leading-7 text-charcoal/80">
              <p>{t("aikido.why.ukemi1")}</p>
              <p>{t("aikido.why.ukemi2")}</p>
            </div>
          </div>
          <figure className="surface relative min-h-[18rem] overflow-hidden rounded-[2rem]">
            <ResponsiveImage
              src={aikidoActionImages.breakfall.src}
              alt={aikidoActionImages.breakfall.alt}
              imgClassName="absolute inset-0 h-full w-full object-cover"
              objectPosition="center 35%"
              loading="lazy"
            />
          </figure>
        </div>
        <div className="mt-5 rounded-[2rem] bg-bamboo/10 p-6 sm:p-8">
          <p className="max-w-3xl text-base leading-7 text-charcoal/80 sm:text-lg">
            {t("aikido.why.close")}
          </p>
        </div>
      </MotionSection>

      {/* Who Can Practice? */}
      <MotionSection id="who-can-practice" className="container-shell scroll-mt-28 pb-20">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div className="max-w-3xl">
            <p className="eyebrow">{t("aikido.who.eyebrow")}</p>
            <h2 className="section-title">{t("aikido.who.title")}</h2>
            <p className="section-copy">{t("aikido.who.intro")}</p>
          </div>
          <figure className="surface overflow-hidden rounded-[2rem]">
            <ResponsiveImage
              src={aikidoActionImages.trainingPin.src}
              alt={aikidoActionImages.trainingPin.alt}
              imgClassName="aspect-[3/4] w-full object-cover"
              loading="lazy"
            />
          </figure>
        </div>
        <div className="mt-12 grid gap-10">
          {[
            {
              title: t("aikido.who.childrenTitle"),
              icon: Sparkles,
              items: aikidoForChildren,
            },
            {
              title: t("aikido.who.adultsTitle"),
              icon: UsersRound,
              items: aikidoForAdults,
            },
          ].map((group) => {
            const Icon = group.icon;
            return (
              <div key={group.title}>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-bamboo/10 text-bamboo">
                    <Icon size={18} aria-hidden="true" />
                  </div>
                  <h3 className="text-2xl text-ink sm:text-3xl">{group.title}</h3>
                </div>
                <div className="mt-5 grid gap-3 min-[420px]:gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {group.items.map((item) => (
                    <div
                      key={item.title}
                      className="rounded-2xl border border-ink/10 bg-bamboo/10 p-5"
                    >
                      <p className="text-base font-bold text-ink">{item.title}</p>
                      <p className="mt-1.5 text-sm leading-6 text-charcoal/75">
                        {item.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </MotionSection>

      <MotionSection className="container-shell pb-20">
        <div className="mb-9 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="eyebrow">{t("aikido.instructors.eyebrow")}</p>
            <h2 className="section-title">{t("aikido.instructors.title")}</h2>
            <p className="section-copy">
              {t("aikido.instructors.copy")}
            </p>
          </div>
          <Link to="/instructors" className="btn-secondary">
            {t("aikido.instructors.cta")}
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 min-[420px]:gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {instructors.map((instructor) => (
            <article
              key={instructor.name}
              className="surface card-hover flex flex-col items-start gap-3 rounded-[1.35rem] p-3.5 min-[420px]:p-4 sm:flex-row sm:items-center sm:gap-4 sm:rounded-[1.75rem]"
            >
              {instructor.imageSrc ? (
                <ResponsiveImage
                  src={instructor.imageSrc}
                  alt={instructor.imageAlt ?? `${instructor.name} instructor portrait`}
                  imgClassName="h-16 w-16 shrink-0 rounded-full object-cover object-[50%_22%] sm:h-20 sm:w-20"
                  loading="lazy"
                />
              ) : null}
              <div className="min-w-0">
                <p className="text-[0.66rem] font-bold uppercase leading-tight tracking-[0.12em] text-bamboo sm:text-xs sm:tracking-[0.16em]">
                  {instructor.rank}
                </p>
                <h3 className="mt-1 text-[1.16rem] leading-tight text-ink min-[420px]:text-[1.3rem] sm:text-2xl">
                  {instructor.name}
                </h3>
                <p className="mt-1 text-xs leading-5 text-charcoal/70 sm:text-sm">{instructor.role}</p>
              </div>
            </article>
          ))}
        </div>
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-charcoal/55">
          {t("common.source")}: {instructorSource.label}
        </p>
      </MotionSection>

      <MotionSection className="container-shell pb-20">
        <div className="grid gap-10 lg:grid-cols-[0.78fr_1.22fr] lg:items-start">
          <div className="lg:sticky lg:top-28">
            <p className="eyebrow">{t("aikido.history.eyebrow")}</p>
            <h2 className="section-title">{t("aikido.history.title")}</h2>
            <p className="section-copy">
              {t("aikido.history.copy")}
            </p>
            <div className="mt-7 rounded-[2rem] border border-ink/10 bg-paper/70 p-5">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-bamboo">
                {t("aikido.history.primarySources")}
              </p>
              <div className="mt-3 grid gap-2">
                {aikidoHistorySources.map((source) => (
                  <a
                    key={source.url}
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 text-sm font-semibold text-charcoal transition hover:text-vermilion"
                  >
                    {source.label}
                    <ArrowUpRight size={14} aria-hidden="true" />
                  </a>
                ))}
              </div>
            </div>
          </div>
          <Timeline />
        </div>
      </MotionSection>

      <MotionSection id="history-philosophy" className="container-shell scroll-mt-28 pb-20">
        <div className="mb-10 max-w-3xl">
          <p className="eyebrow">{t("aikido.history.storyEyebrow")}</p>
          <h2 id="o-sensei" className="section-title scroll-mt-28">
            {t("aikido.history.storyTitle")}
          </h2>
          <p className="section-copy">
            {t("aikido.history.storyCopy")}
          </p>
        </div>

        <div className="divide-y divide-ink/10">
          {aikidoHistorySections.map((section) => {
            const photo = section.imageId
              ? historicalPhotoById.get(section.imageId)
              : undefined;
            const imageFirst = section.imagePosition === "left";

            const copy = (
              <div className="max-w-3xl">
                <p className="eyebrow">{section.eyebrow}</p>
                <h3 className="mt-3 text-3xl leading-tight text-ink sm:text-4xl">
                  {section.title}
                </h3>
                <div className="mt-5 grid gap-4 text-base text-charcoal/80 sm:text-lg">
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </div>
            );

            return (
              <article
                key={section.id}
                id={section.id}
                className="scroll-mt-28 py-12 first:pt-0 last:pb-0"
              >
                {photo ? (
                  <div className="grid gap-8 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
                    {imageFirst ? <HistoricalFigure photo={photo} story /> : null}
                    {copy}
                    {!imageFirst ? <HistoricalFigure photo={photo} story /> : null}
                  </div>
                ) : (
                  copy
                )}
              </article>
            );
          })}
        </div>
      </MotionSection>

    </>
  );
}
