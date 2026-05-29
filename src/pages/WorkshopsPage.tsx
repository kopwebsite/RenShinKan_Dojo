import { Link } from "react-router-dom";
import { MotionSection } from "../components/MotionSection";
import { WorkshopCards } from "../components/WorkshopCards";
import { useTranslation } from "../i18n";

export function WorkshopsPage() {
  const { t } = useTranslation();

  return (
    <>
      <MotionSection className="container-shell py-20">
        <p className="eyebrow">{t("workshops.intro.eyebrow")}</p>
        <h1 className="section-title">
          {t("workshops.intro.title")}
        </h1>
        <p className="section-copy">
          {t("workshops.intro.copy")}
        </p>
      </MotionSection>

      <MotionSection className="container-shell pb-20">
        <WorkshopCards />
      </MotionSection>

      <MotionSection className="container-shell pb-20">
        <div className="rounded-[2rem] bg-bamboo/90 p-8 text-paper backdrop-blur-sm sm:p-10">
          <p className="eyebrow text-paper/70">{t("workshops.updates.eyebrow")}</p>
          <h2 className="mt-4 max-w-2xl text-3xl leading-tight sm:text-5xl">
            {t("workshops.updates.title")}
          </h2>
          <Link to="/newsletter" className="btn-secondary mt-7 border-paper/20 bg-paper/10 text-paper hover:text-paper">
            {t("workshops.updates.cta")}
          </Link>
        </div>
      </MotionSection>
    </>
  );
}
