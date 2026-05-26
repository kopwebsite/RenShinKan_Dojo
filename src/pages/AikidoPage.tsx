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
          style={photo.objectPosition ? { objectPosition: photo.objectPosition } : undefined}
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
      <section id="what-is-aikido" className="relative isolate min-h-[100svh] overflow-hidden scroll-mt-28">
        <img
          src={assetPath("/dojo-photos/aikido-hero-new.png")}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover"
          fetchPriority="high"
        />
        <div className="relative flex min-h-[100svh] items-center justify-center py-20 text-center">
          <div className="mx-auto max-w-3xl px-5 sm:px-8">
            <h1 className="mx-auto mt-3 max-w-3xl text-5xl leading-[0.98] text-ink sm:text-6xl lg:text-7xl">
              What is Aikido?
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-charcoal/80 sm:text-lg sm:leading-8">
              A Japanese martial art of harmony, nonviolence, and lifelong personal growth.
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
            <img
              src={pcfAikidoImages.classPractice.src}
              alt={pcfAikidoImages.classPractice.alt}
              className="aspect-[4/3] w-full object-cover"
            />
          </figure>
          <div>
            <p className="eyebrow">About Aikido</p>
            <h2 className="section-title">Peace through movement, not force.</h2>
            <p className="mt-5 text-base leading-7 text-charcoal/80 sm:text-lg">
              Aikido is a Japanese martial art founded in the early 20th century by
              Morihei Ueshiba. It grew from classical traditions including jujutsu, judo, and
              the sword arts, but took a different direction. Instead of striking or
              overpowering, aikido teaches you to blend with incoming energy, redirect
              it, and resolve conflict without causing injury. There is no competition,
              no aggression. The practice is about composure, self-discipline, and learning
              to stay calm under pressure.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {[
                {
                  title: "Rooted in Japan",
                  body: "Founded by Morihei Ueshiba from classical jujutsu and aiki sword traditions.",
                },
                {
                  title: "Nonviolent",
                  body: "Redirects and neutralises force rather than meeting it. No striking, no competition.",
                },
                {
                  title: "Inner discipline",
                  body: "Builds composure, awareness, and respect. These qualities carry well beyond the mat.",
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
            <img
              src={pcfAikidoImages.joBokken.src}
              alt={pcfAikidoImages.joBokken.alt}
              className="aspect-video w-full object-cover"
              loading="lazy"
            />
            <figcaption className="p-5">
              <h3 className="text-2xl text-ink">Rooted in Tradition</h3>
              <p className="mt-2 text-sm text-charcoal/75">
                Bokken and jo practice connects aikido to the classical Japanese weapons
                arts from which it evolved, a living link to centuries of budo.
              </p>
            </figcaption>
          </figure>
          <figure className="surface card-hover overflow-hidden rounded-[2rem]">
            <img
              src={pcfAikidoImages.kamiza.src}
              alt={pcfAikidoImages.kamiza.alt}
              className="aspect-video w-full object-cover"
              loading="lazy"
            />
            <figcaption className="p-5">
              <h3 className="text-2xl text-ink">A Respectful Space</h3>
              <p className="mt-2 text-sm text-charcoal/75">
                The kamiza is a focal point of attention in every dojo. It reflects
                aikido's emphasis on sincerity, respect, and a settled, open mind.
              </p>
            </figcaption>
          </figure>
        </div>
      </MotionSection>

      <MotionSection className="container-shell pb-20">
        <div className="mb-9 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="eyebrow">RenshinKan Instructors</p>
            <h2 className="section-title">A line of practice rooted in Chiang Mai.</h2>
            <p className="section-copy">
              RenshinKan's instructors trained across Japan, Bangkok, and Chiang Mai,
              building a teaching line that now welcomes students of all ages
              and backgrounds.
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
              Each entry connects to the full written history below. Click
              any item to jump to that period of the story.
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
            Aikido (合気道) means "the way of harmonious spirit," a name that
            reflects its founding philosophy of blending, not clashing. Its
            history is not a straight line from violence to gentleness. It is
            a layered story of older martial skill, spiritual searching, wartime
            pressure, postwar reconstruction, and ordinary people learning to
            practice with respect.
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
