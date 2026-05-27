import { InstructorGrid } from "../components/InstructorGrid";
import { MotionSection } from "../components/MotionSection";
import { instructorSource } from "../data/siteContent";
import { useTranslation } from "../i18n";

export function InstructorsPage() {
  const { t } = useTranslation();

  return (
    <>
      <MotionSection className="container-shell py-20">
        <p className="eyebrow">{t("instructorsPage.eyebrow")}</p>
        <h1 className="section-title">{t("instructorsPage.title")}</h1>
        <p className="section-copy">
          {t("instructorsPage.copy")}
        </p>
      </MotionSection>

      <MotionSection className="container-shell pb-20">
        <p className="sr-only">{instructorSource.note}</p>
        <InstructorGrid />
      </MotionSection>
    </>
  );
}
