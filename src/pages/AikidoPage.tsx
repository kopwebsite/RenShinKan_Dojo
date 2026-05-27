import { ArrowUpRight, Camera } from "lucide-react";
import { Link } from "react-router-dom";
import { MotionSection } from "../components/MotionSection";
import { ResponsiveImage } from "../components/ResponsiveImage";
import { Timeline } from "../components/Timeline";
import type { HistoricalPhoto } from "../data/siteContent";
import {
  aikidoHistoricalPhotos,
  aikidoHistorySections,
  aikidoHistorySources,
  aikidoValues,
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
      <section id="what-is-aikido" className="relative isolate min-h-[100svh] overflow-hidden scroll-mt-28">
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
        <div className="relative flex min-h-[100svh] items-center justify-center py-20 text-center">
          <div className="mx-auto max-w-3xl px-5 sm:px-8">
            <h1 className="mx-auto mt-3 max-w-3xl text-5xl leading-[0.98] text-ink sm:text-6xl lg:text-7xl">
              {t("aikido.hero.title")}
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-charcoal/80 sm:text-lg sm:leading-8">
              {t("aikido.hero.subtitle")}
            </p>
          </div>
        </div>
      </section>

      <MotionSection className="container-shell py-20">
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-5">
          {aikidoValues.map((value) => {
            const Icon = value.icon;
            return (
              <article key={value.title} className="surface card-hover rounded-[1.75rem] p-7">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-bamboo/10 text-bamboo">
                  <Icon size={20} aria-hidden="true" />
                </div>
                <h2 className="mt-6 text-2xl text-ink">{value.title}</h2>
                <p className="mt-3 text-sm leading-6 text-charcoal/75">{value.description}</p>
              </article>
            );
          })}
        </div>
      </MotionSection>

      <MotionSection className="container-shell pb-20">
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {instructors.map((instructor) => (
            <article
              key={instructor.name}
              className="surface card-hover flex items-center gap-4 rounded-[1.75rem] p-4"
            >
              {instructor.imageSrc ? (
                <ResponsiveImage
                  src={instructor.imageSrc}
                  alt={instructor.imageAlt ?? `${instructor.name} instructor portrait`}
                  imgClassName="h-20 w-20 shrink-0 rounded-full object-cover object-[50%_22%]"
                  loading="lazy"
                />
              ) : null}
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-bamboo">
                  {instructor.rank}
                </p>
                <h3 className="mt-1 text-2xl leading-tight text-ink">
                  {instructor.name}
                </h3>
                <p className="mt-1 text-sm text-charcoal/70">{instructor.role}</p>
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
                <h3 className="mt-3 text-4xl leading-tight text-ink">
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
