import { InstructorGrid } from "../components/InstructorGrid";
import { MotionSection } from "../components/MotionSection";
import { ResponsiveImage } from "../components/ResponsiveImage";
import { instructorSource } from "../data/siteContent";
import { useTranslation } from "../i18n";
import { assetPath } from "../utils/assetPath";

export function InstructorsPage() {
  const { t } = useTranslation();

  return (
    <>
      <MotionSection className="container-shell instructor-opening">
        <div>
          <p className="vertical-label">{t("instructorsPage.eyebrow")}</p>
          <h1>{t("instructorsPage.title")}</h1>
          <p>{t("instructorsPage.copy")}</p>
        </div>
        <figure>
          <ResponsiveImage
            src={assetPath("/renshinkan-gallery/group-photos/group-photo-001.jpg")}
            alt={t("instructorsPage.groupCaption")}
            imgClassName="h-full w-full object-cover"
            loading="eager"
          />
          <figcaption>{t("instructorsPage.groupCaption")}</figcaption>
        </figure>
      </MotionSection>

      <MotionSection className="container-shell pb-20">
        <p className="sr-only">{instructorSource.note}</p>
        <InstructorGrid />
      </MotionSection>
    </>
  );
}
