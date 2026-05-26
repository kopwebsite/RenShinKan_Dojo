import { ArrowUpRight, Camera } from "lucide-react";
import { Link } from "react-router-dom";
import { MotionSection } from "../components/MotionSection";
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
        <img
          src={photo.src}
          alt={photo.alt}
          className={`w-full object-cover grayscale ${
            story || featured ? "aspect-[4/3]" : "aspect-[3/4]"
          }`}
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
  const historicalPhotoById = new Map(
    aikidoHistoricalPhotos.map((photo) => [photo.id, photo]),
  );

  return (
    <>
      {/* Aikido hero */}
      <section id="what-is-aikido" className="relative isolate min-h-[68svh] overflow-hidden scroll-mt-28">
        <img
          src={assetPath("/dojo-photos/aikido-hero.png")}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover"
          fetchPriority="high"
        />
        <div className="relative flex min-h-[68svh] items-center justify-center py-20 text-center">
          <div className="mx-auto max-w-3xl px-5 sm:px-8">
            <p className="eyebrow">What Is Aikido?</p>
            <h1 className="mx-auto mt-3 max-w-3xl text-5xl leading-[0.98] text-ink sm:text-6xl lg:text-7xl">
              A martial art for harmony, balance, and calm self-development.
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-charcoal/80 sm:text-lg sm:leading-8">
              Aikido was founded by Morihei Ueshiba. At RenshinKan, it is
              introduced as non-competitive partner practice where students learn
              to blend, redirect, break balance, throw, pin, and fall safely —
              with care for each other.
            </p>
          </div>
        </div>
      </section>

      <MotionSection className="container-shell pb-20">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {aikidoValues.map((value) => {
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

      <MotionSection className="container-shell pb-20">
        <div className="mb-9 max-w-3xl">
          <p className="eyebrow">Aikido In Chiang Mai</p>
          <h2 className="section-title">Movement, place, and tools of practice.</h2>
          <p className="section-copy">
            These images from the Peace Culture Foundation Aikido page help ground
            the mock site in the real dojo while a final photo set is prepared.
          </p>
        </div>
        <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <figure className="surface card-hover overflow-hidden rounded-[2rem]">
            <img
              src={pcfAikidoImages.classPractice.src}
              alt={pcfAikidoImages.classPractice.alt}
              className="aspect-[4/3] w-full object-cover"
            />
            <figcaption className="p-6">
              <h3 className="text-3xl text-ink">Class Practice</h3>
              <p className="mt-2 text-sm text-charcoal/75">
                Partner practice teaches students to move with timing, awareness,
                and care.
              </p>
            </figcaption>
          </figure>
          <div className="grid gap-5">
            <figure className="surface card-hover overflow-hidden rounded-[2rem]">
              <img
                src={pcfAikidoImages.joBokken.src}
                alt={pcfAikidoImages.joBokken.alt}
                className="aspect-[16/10] w-full object-cover"
                loading="lazy"
              />
              <figcaption className="p-5">
                <h3 className="text-2xl text-ink">Wooden Weapons</h3>
                <p className="mt-2 text-sm text-charcoal/75">
                  Weapons training refines line, posture, distance, and respect.
                </p>
              </figcaption>
            </figure>
            <figure className="surface card-hover overflow-hidden rounded-[2rem]">
              <img
                src={pcfAikidoImages.kamiza.src}
                alt={pcfAikidoImages.kamiza.alt}
                className="aspect-[16/10] w-full object-cover"
                loading="lazy"
              />
              <figcaption className="p-5">
                <h3 className="text-2xl text-ink">Dojo Atmosphere</h3>
                <p className="mt-2 text-sm text-charcoal/75">
                  A quiet training space helps students arrive with attention.
                </p>
              </figcaption>
            </figure>
          </div>
        </div>
      </MotionSection>

      <MotionSection className="container-shell pb-20">
        <div className="mb-9 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="eyebrow">RenshinKan Instructors</p>
            <h2 className="section-title">A line of practice rooted in Chiang Mai.</h2>
            <p className="section-copy">
              These instructor profiles are sourced from the Peace Culture Foundation
              page, excluding the requested omitted profile, teaching assistants,
              and visiting instructors.
            </p>
          </div>
          <Link to="/instructors" className="btn-secondary">
            Full Instructor Profiles
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {instructors.map((instructor) => (
            <article
              key={instructor.name}
              className="surface card-hover flex items-center gap-4 rounded-[1.75rem] p-4"
            >
              {instructor.imageSrc ? (
                <img
                  src={instructor.imageSrc}
                  alt={instructor.imageAlt ?? `${instructor.name} instructor portrait`}
                  className="h-20 w-20 shrink-0 rounded-full object-cover object-[50%_22%]"
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
          Source: {instructorSource.label}
        </p>
      </MotionSection>

      <MotionSection className="container-shell pb-20">
        <div className="grid gap-10 lg:grid-cols-[0.78fr_1.22fr] lg:items-start">
          <div className="lg:sticky lg:top-28">
            <p className="eyebrow">Aikido History</p>
            <h2 className="section-title">From older budo to a living local practice.</h2>
            <p className="section-copy">
              This timeline now follows the same story as the written history
              below. Select any item to jump to the matching section.
            </p>
            <div className="mt-7 rounded-[2rem] border border-ink/10 bg-paper/70 p-5">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-bamboo">
                Primary Sources
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
          <p className="eyebrow">Historical Story</p>
          <h2 id="o-sensei" className="section-title scroll-mt-28">
            O Sensei, aikido, and the path from force to harmony.
          </h2>
          <p className="section-copy">
            Aikido's history is not a straight line from violence to gentleness.
            It is a layered story of older martial skill, spiritual searching,
            wartime pressure, postwar reconstruction, and ordinary people learning
            to practice with respect.
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
