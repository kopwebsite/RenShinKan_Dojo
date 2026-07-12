import { Link } from "react-router-dom";
import { MotionSection } from "../components/MotionSection";
import { ResponsiveImage } from "../components/ResponsiveImage";
import { WorkshopCards } from "../components/WorkshopCards";
import { useTranslation } from "../i18n";
import { assetPath } from "../utils/assetPath";

export function WorkshopsPage() {
  const { t } = useTranslation();

  return (
    <>
      <MotionSection className="container-shell page-opening workshop-opening">
        <div>
          <p className="folio-mark">{t("workshops.intro.eyebrow")}</p>
          <h1>{t("workshops.intro.title")}</h1>
          <p>{t("workshops.intro.copy")}</p>
        </div>
        <figure>
          <ResponsiveImage
            src={assetPath("/pcf-aikido/jo-bokken.webp")}
            alt={t("aikido.overview.weaponsCaption")}
            imgClassName="h-full w-full object-cover"
            loading="eager"
          />
          <figcaption>{t("aikido.overview.weaponsCaption")}</figcaption>
        </figure>
      </MotionSection>

      <MotionSection className="container-shell pb-20">
        <WorkshopCards />
      </MotionSection>

      <MotionSection className="workshop-colophon">
        <div className="container-shell workshop-colophon__inner">
          <p className="vertical-label">{t("workshops.updates.eyebrow")}</p>
          <h2>{t("workshops.updates.title")}</h2>
          <Link to="/newsletter" className="text-link">
            {t("workshops.updates.cta")}
          </Link>
        </div>
      </MotionSection>
    </>
  );
}
