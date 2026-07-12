import { ArrowDown, MapPin } from "lucide-react";
import { Link } from "react-router-dom";
import { BrushCircleLogo } from "../components/BrushCircleLogo";
import { ResponsiveImage } from "../components/ResponsiveImage";
import { useTranslation } from "../i18n";
import { assetPath } from "../utils/assetPath";
import { DojoPageSections } from "./DojoPageSections";

export function DojoPage() {
  const { t } = useTranslation();

  return (
    <>
      <section id="home" className="manuscript-hero scroll-mt-24">
        <div className="manuscript-hero__photo" aria-hidden="true">
          <ResponsiveImage
            src={assetPath("/dojo-photos/new-hero-poster.webp")}
            alt=""
            imgClassName="h-full w-full object-cover"
            loading="eager"
            width={1672}
            height={941}
            sizes="100vw"
            mobileWidth={640}
            fetchPriority="high"
          />
        </div>

        <div className="container-shell manuscript-hero__layout">
          <div className="manuscript-hero__title">
            <p className="folio-mark">Aikido · Chiang Mai · Est. 2013</p>
            <div className="hero-title-lockup">
              <BrushCircleLogo className="hero-seal" />
              <h1>{t("common.brand")}</h1>
            </div>
            <p>{t("home.hero.subtitle")}</p>
          </div>

          <aside className="manuscript-hero__invitation" aria-label="Visit RenShinKan Dojo">
            <MapPin size={18} aria-hidden="true" />
            <p>Hang Dong, Chiang Mai</p>
            <strong>Beginners, children and visiting aikidoka are welcome.</strong>
            <Link to="/classes#schedule">See class times</Link>
          </aside>

          <a className="manuscript-hero__continue" href="#visit-notes">
            Begin here <ArrowDown size={16} aria-hidden="true" />
          </a>
        </div>
      </section>

      <DojoPageSections />
    </>
  );
}
