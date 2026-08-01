import { ArrowDown, ArrowRight } from "lucide-react";
import { Link } from "react-router";
import { BrushCircleLogo } from "../components/BrushCircleLogo";
import { LatestDojoNewsletters } from "../components/LatestDojoNewsletters";
import { ResponsiveImage } from "../components/ResponsiveImage";
import { useTranslation } from "../i18n";
import { assetPath } from "../utils/assetPath";
import { DojoPageSections } from "./DojoPageSections";

export function DojoPage() {
  const { t } = useTranslation();

  return (
    <>
      <section id="home" className="koi-hero scroll-mt-24">
        <div className="koi-hero__art" aria-hidden="true">
          <ResponsiveImage
            src={assetPath("/dojo-photos/new-hero-poster.webp")}
            alt=""
            loading="eager"
            width={1672}
            height={941}
            sizes="100vw"
            mobileWidth={640}
            fetchPriority="high"
          />
        </div>
        <div className="koi-hero__veil" aria-hidden="true" />

        <div className="container-shell koi-hero__inner">
          <p className="koi-hero__place">{t("home.hero.place")}</p>
          <BrushCircleLogo className="koi-hero__crest" decorative paintOn />
          <h1>{t("common.brand")}</h1>
          <div className="koi-hero__actions">
            <Link to="/classes#schedule" className="btn-primary">{t("home.hero.cta")}</Link>
            <Link to="/classes#first-visit" className="text-link">
              {t("home.hero.visit")} <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </div>

        <a className="koi-hero__continue" href="#dojo">
          {t("home.hero.continue")} <ArrowDown size={15} aria-hidden="true" />
        </a>
      </section>

      <LatestDojoNewsletters />
      <DojoPageSections />
    </>
  );
}
