import { BookOpen, GraduationCap } from "lucide-react";
import { lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { BrushCircleLogo } from "../components/BrushCircleLogo";
import { ResponsiveImage } from "../components/ResponsiveImage";
import { useTranslation } from "../i18n";
import { assetPath } from "../utils/assetPath";

const DojoPageSections = lazy(() =>
  import("./DojoPageSections").then((module) => ({ default: module.DojoPageSections })),
);

export function DojoPage() {
  const { t } = useTranslation();

  return (
    <>
      <section id="home" className="relative isolate min-h-[var(--hero-viewport-height)] scroll-mt-28 overflow-hidden">
        <ResponsiveImage
          src={assetPath("/dojo-photos/new-hero-poster.webp")}
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

      <Suspense fallback={<div className="container-shell h-16" aria-hidden="true" />}>
        <DojoPageSections />
      </Suspense>
    </>
  );
}
