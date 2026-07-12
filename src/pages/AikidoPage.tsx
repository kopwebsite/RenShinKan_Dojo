import { ArrowUpRight } from "lucide-react";
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
  instructors,
  pcfAikidoImages,
} from "../data/siteContent";
import { useTranslation } from "../i18n";
import { assetPath } from "../utils/assetPath";
import {
  aikidoAdultKeys,
  aikidoBenefitKeys,
  aikidoChildKeys,
  aikidoHistoricalPhotoKeys,
  aikidoHistorySectionKeys,
  aikidoHistorySourceKeys,
  instructorKeys,
  translateHistoricalPhoto,
  translateHistorySection,
  translateInstructor,
  translateTitleDescription,
} from "../utils/siteContentTranslations";

const PRINCIPLE_NUMERALS = ["一", "二", "三"];

function HistoricalFigure({ photo }: { photo: HistoricalPhoto }) {
  return (
    <figure className="photo-mat historical-figure">
      <ResponsiveImage
        src={photo.src}
        alt={photo.alt}
        imgClassName="w-full object-cover grayscale aspect-[4/3]"
        objectPosition={photo.objectPosition}
        loading="lazy"
      />
      <figcaption>
        <p className="folio-mark">{photo.date}</p>
        <h3>{photo.title}</h3>
        <p>{photo.caption}</p>
        <p className="historical-figure__credit">{photo.credit}</p>
        <a href={photo.sourceUrl} target="_blank" rel="noreferrer">
          {photo.sourceName}
          <ArrowUpRight size={13} aria-hidden="true" />
        </a>
      </figcaption>
    </figure>
  );
}

export function AikidoPage() {
  const { t } = useTranslation();
  const localizedBenefits = aikidoBenefits.map((benefit, index) =>
    translateTitleDescription(t, benefit, aikidoBenefitKeys[index]),
  );
  const localizedChildItems = aikidoForChildren.map((item, index) =>
    translateTitleDescription(t, item, aikidoChildKeys[index]),
  );
  const localizedAdultItems = aikidoForAdults.map((item, index) =>
    translateTitleDescription(t, item, aikidoAdultKeys[index]),
  );
  const localizedInstructors = instructors.map((instructor, index) =>
    translateInstructor(t, instructor, instructorKeys[index]),
  );
  const localizedHistoricalPhotos = aikidoHistoricalPhotos.map((photo, index) =>
    translateHistoricalPhoto(t, photo, aikidoHistoricalPhotoKeys[index]),
  );
  const historicalPhotoById = new Map(
    localizedHistoricalPhotos.map((photo) => [photo.id, photo]),
  );
  const localizedHistorySections = aikidoHistorySections.map((section, index) =>
    translateHistorySection(t, section, aikidoHistorySectionKeys[index]),
  );

  const principles = [
    { title: t("aikido.about.point1Title"), body: t("aikido.about.point1Body") },
    { title: t("aikido.about.point2Title"), body: t("aikido.about.point2Body") },
    { title: t("aikido.about.point3Title"), body: t("aikido.about.point3Body") },
  ];

  // The nine qualities regrouped into three quiet themes; indices follow
  // the shared aikidoBenefits order so translations stay attached.
  const qualityClusters = [
    { name: t("aikido.why.clusterMind"), items: [0, 1, 2].map((i) => localizedBenefits[i]) },
    { name: t("aikido.why.clusterBody"), items: [4, 5, 6].map((i) => localizedBenefits[i]) },
    { name: t("aikido.why.clusterTogether"), items: [7, 8, 3].map((i) => localizedBenefits[i]) },
  ];

  const weapons = [
    { name: t("aikido.overview.bokkenName"), meaning: t("aikido.overview.bokkenMeaning"), description: t("aikido.overview.bokkenDesc") },
    { name: t("aikido.overview.joName"), meaning: t("aikido.overview.joMeaning"), description: t("aikido.overview.joDesc") },
    { name: t("aikido.overview.tantoName"), meaning: t("aikido.overview.tantoMeaning"), description: t("aikido.overview.tantoDesc") },
  ];

  return (
    <>
      {/* Aikido hero */}
      <section id="what-is-aikido" className="relative isolate min-h-[var(--hero-viewport-height)] overflow-hidden scroll-mt-28">
        <ResponsiveImage
          src={assetPath("/dojo-photos/aikido-hero-new.webp")}
          alt=""
          aria-hidden="true"
          imgClassName="absolute inset-0 h-full w-full object-cover"
          loading="eager"
          width={1881}
          height={836}
          sizes="100vw"
          mobileWidth={640}
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

      {/* A. Opening: peace through movement — with B. principles walked below */}
      <MotionSection id="aikido-overview" className="container-shell aikido-opening scroll-mt-28">
        <div className="aikido-opening__text">
          <p className="vertical-label">{t("aikido.about.eyebrow")}</p>
          <h2>{t("aikido.about.title")}</h2>
          <p>{t("aikido.about.copy")}</p>
        </div>
        <figure className="aikido-opening__photo">
          <ResponsiveImage
            src={aikidoActionImages.seminar.src}
            alt={aikidoActionImages.seminar.alt}
            loading="lazy"
            sizes="(max-width: 1050px) 100vw, 55vw"
          />
          <figcaption>{t("aikido.about.photoCaption")}</figcaption>
        </figure>
      </MotionSection>

      <MotionSection className="container-shell">
        <ol className="principle-walk">
          {principles.map((principle, index) => (
            <li key={principle.title}>
              <span className="principle-walk__numeral" aria-hidden="true">
                {PRINCIPLE_NUMERALS[index]}
              </span>
              <h3>{principle.title}</h3>
              <p>{principle.body}</p>
            </li>
          ))}
        </ol>
      </MotionSection>

      {/* C. Tradition and the dojo space: two studies at different scales */}
      <MotionSection className="container-shell tradition-study">
        <article>
          <figure>
            <ResponsiveImage
              src={pcfAikidoImages.bokkenRack.src}
              alt={pcfAikidoImages.bokkenRack.alt}
              loading="lazy"
              sizes="(max-width: 1050px) 100vw, 55vw"
            />
            <figcaption>{t("aikido.about.traditionCaption")}</figcaption>
          </figure>
          <h3>{t("aikido.about.traditionTitle")}</h3>
          <p>{t("aikido.about.traditionCopy")}</p>
        </article>
        <article>
          <figure>
            <ResponsiveImage
              src={pcfAikidoImages.kamiza.src}
              alt={pcfAikidoImages.kamiza.alt}
              loading="lazy"
              sizes="(max-width: 1050px) 50vw, 38vw"
            />
            <figcaption>{t("aikido.about.spaceCaption")}</figcaption>
          </figure>
          <h3>{t("aikido.about.spaceTitle")}</h3>
          <p>{t("aikido.about.spaceCopy")}</p>
        </article>
      </MotionSection>

      {/* D. Weapons: object-led study with labels tied to the image band */}
      <MotionSection className="container-shell weapon-study">
        <header className="weapon-study__head">
          <p className="eyebrow">{t("aikido.overview.eyebrow")}</p>
          <h3>{t("aikido.overview.weaponsTitle")}</h3>
          <p>{t("aikido.overview.weaponsIntro")}</p>
        </header>
        <figure className="weapon-study__image">
          <ResponsiveImage
            src={pcfAikidoImages.joBokken.src}
            alt={pcfAikidoImages.joBokken.alt}
            loading="lazy"
            sizes="(max-width: 767px) 100vw, 90vw"
          />
        </figure>
        <ol className="weapon-study__list">
          {weapons.map((weapon) => (
            <li key={weapon.name}>
              <h4>{weapon.name}</h4>
              <p className="weapon-study__meaning">{weapon.meaning}</p>
              <p>{weapon.description}</p>
            </li>
          ))}
        </ol>
        <p className="weapon-study__close marginal-note">{t("aikido.overview.weaponsClose")}</p>
      </MotionSection>

      {/* E. Paired practice: cinematic sequence, one photo dominates */}
      <MotionSection className="container-shell practice-cinema">
        <figure className="practice-cinema__main">
          <ResponsiveImage
            src={aikidoActionImages.joTraining.src}
            alt={aikidoActionImages.joTraining.alt}
            loading="lazy"
            sizes="(max-width: 767px) 100vw, 70vw"
          />
          <figcaption>{t("data.aikido.actionCaptions.jo")}</figcaption>
        </figure>
        <figure className="practice-cinema__inset photo-mat">
          <ResponsiveImage
            src={aikidoActionImages.tantoTechnique.src}
            alt={aikidoActionImages.tantoTechnique.alt}
            loading="lazy"
            sizes="(max-width: 767px) 74vw, 26rem"
          />
          <figcaption>{t("data.aikido.actionCaptions.tanto")}</figcaption>
        </figure>
      </MotionSection>

      {/* F. Qualities that grow with practice: three quiet clusters */}
      <MotionSection id="why-aikido" className="container-shell weapon-study scroll-mt-28">
        <header className="weapon-study__head">
          <p className="eyebrow">{t("aikido.why.eyebrow")}</p>
          <h3>{t("aikido.why.benefitsLabel")}</h3>
          <p>{t("aikido.why.intro")}</p>
        </header>
        <div className="quality-clusters">
          {qualityClusters.map((cluster, clusterIndex) => (
            <section key={cluster.name} aria-label={cluster.name}>
              <span className="folio-mark">{String(clusterIndex + 1).padStart(2, "0")}</span>
              <h3>{cluster.name}</h3>
              <ul>
                {cluster.items.map((item) => (
                  <li key={item.title}>
                    <strong>{item.title}</strong>
                    <p>{item.description}</p>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </MotionSection>

      {/* G. Learning to fall safely: a full-width photographic interruption */}
      <MotionSection className="ukemi-break">
        <figure className="ukemi-break__photo" aria-label={t("aikido.why.ukemiCaption")}>
          <ResponsiveImage
            src={aikidoActionImages.breakfall.src}
            alt={aikidoActionImages.breakfall.alt}
            loading="lazy"
            sizes="100vw"
          />
        </figure>
        <div className="container-shell">
          <div className="ukemi-break__panel">
            <h3>{t("aikido.why.ukemiTitle")}</h3>
            <p>{t("aikido.why.ukemi1")}</p>
            <p>{t("aikido.why.ukemi2")}</p>
          </div>
          <p className="ukemi-break__note marginal-note">{t("aikido.why.close")}</p>
        </div>
      </MotionSection>

      {/* H. Children and adults: two related but distinct narratives */}
      <MotionSection id="who-can-practice" className="container-shell who-narratives scroll-mt-28">
        <header className="section-masthead">
          <p className="eyebrow">{t("aikido.who.eyebrow")}</p>
          <h2>{t("aikido.who.title")}</h2>
          <p>{t("aikido.who.intro")}</p>
        </header>

        <div className="who-children">
          <figure className="photo-mat">
            <ResponsiveImage
              src={aikidoActionImages.pin.src}
              alt={aikidoActionImages.pin.alt}
              loading="lazy"
              sizes="(max-width: 1050px) 88vw, 32vw"
            />
          </figure>
          <div>
            <p className="eyebrow">{t("aikido.who.childrenTitle")}</p>
            <h3>{t("aikido.who.childrenLead")}</h3>
            <ul>
              {localizedChildItems.map((item) => (
                <li key={item.title}>
                  <strong>{item.title}</strong>
                  <p>{item.description}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="who-adults">
          <div>
            <p className="eyebrow">{t("aikido.who.adultsTitle")}</p>
            <h3>{t("aikido.who.adultsLead")}</h3>
            <ol>
              {localizedAdultItems.map((item, index) => (
                <li key={item.title}>
                  <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.description}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <figure>
            <ResponsiveImage
              src={aikidoActionImages.technique.src}
              alt={aikidoActionImages.technique.alt}
              loading="lazy"
              sizes="(max-width: 1050px) 88vw, 32vw"
            />
          </figure>
        </div>

        <div className="who-visitors">
          <h3>{t("aikido.who.visitorsTitle")}</h3>
          <p>{t("aikido.who.visitorsDesc")}</p>
        </div>
      </MotionSection>

      {/* I. Bridge into the people who teach here */}
      <MotionSection className="lineage-bridge">
        <figure>
          <ResponsiveImage
            src={pcfAikidoImages.classPractice.src}
            alt={pcfAikidoImages.classPractice.alt}
            loading="lazy"
            sizes="100vw"
          />
        </figure>
        <div className="lineage-bridge__plate">
          <p className="eyebrow">{t("aikido.instructors.eyebrow")}</p>
          <p>{t("aikido.instructors.title")}</p>
        </div>
      </MotionSection>

      <MotionSection className="container-shell aikido-instructor-rail">
        <header className="section-masthead">
          <p>{t("aikido.instructors.copy")}</p>
          <Link to="/instructors" className="text-link">
            {t("aikido.instructors.cta")} <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </header>
        <ul className="instructor-line__rail" aria-label={t("home.instructors.railLabel")}>
          {localizedInstructors.map((instructor) => (
            <li key={instructor.name}>
              <Link to="/instructors">
                <figure>
                  {instructor.imageSrc ? (
                    <ResponsiveImage
                      src={instructor.imageSrc}
                      alt={instructor.imageAlt ?? `${instructor.name}, RenShinKan instructor`}
                      loading="lazy"
                      sizes="(max-width: 600px) 62vw, 16vw"
                    />
                  ) : null}
                  <figcaption>{instructor.rank}</figcaption>
                </figure>
                <h4>{instructor.name}</h4>
                <p>{instructor.role}</p>
              </Link>
            </li>
          ))}
        </ul>
        <p className="marginal-note">
          {t("common.source")}: {t("data.aikido.instructorSourceLabel")}
        </p>
      </MotionSection>

      <MotionSection className="container-shell pb-20" id="aikido-history">
        <div className="grid gap-10 lg:grid-cols-[0.78fr_1.22fr] lg:items-start">
          <div className="lg:sticky lg:top-28">
            <p className="eyebrow">{t("aikido.history.eyebrow")}</p>
            <h2 className="section-title">{t("aikido.history.title")}</h2>
            <p className="section-copy">
              {t("aikido.history.copy")}
            </p>
            <div className="history-sources">
              <p className="eyebrow">{t("aikido.history.primarySources")}</p>
              <div className="mt-3 grid gap-2">
                {aikidoHistorySources.map((source, index) => (
                  <a
                    key={source.url}
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 text-sm font-semibold text-charcoal transition hover:text-vermilion"
                  >
                    {t(aikidoHistorySourceKeys[index])}
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
          {localizedHistorySections.map((section) => {
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
                    {imageFirst ? <HistoricalFigure photo={photo} /> : null}
                    {copy}
                    {!imageFirst ? <HistoricalFigure photo={photo} /> : null}
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
