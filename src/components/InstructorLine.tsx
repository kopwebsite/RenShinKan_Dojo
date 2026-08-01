import { ArrowRight } from "lucide-react";
import { Link } from "react-router";
import { instructors } from "../data/siteContent";
import { useTranslation } from "../i18n";
import { instructorKeys, translateInstructor } from "../utils/siteContentTranslations";
import { ResponsiveImage } from "./ResponsiveImage";

export function InstructorLine() {
  const { t } = useTranslation();
  const localized = instructors.map((instructor, index) =>
    translateInstructor(t, instructor, instructorKeys[index]),
  );

  return (
    <div className="instructor-line">
      <ol className="instructor-line__rail" aria-label={t("home.instructors.railLabel")}>
        {localized.map((instructor, index) => (
          <li key={instructor.name}>
            <Link to="/instructors">
              <figure>
                {instructor.imageSrc ? (
                  <ResponsiveImage
                    src={instructor.imageSrc}
                    alt={instructor.imageAlt ?? `${instructor.name}, RenShinKan instructor`}
                    loading={index < 3 ? "eager" : "lazy"}
                    sizes="(max-width: 600px) 90vw, (max-width: 1050px) 45vw, 30vw"
                  />
                ) : (
                  <div className="ink-wash h-full w-full" role="img" aria-label={t("a11y.portraitPlaceholder", { name: instructor.name })} />
                )}
                <figcaption className="rank-seal">{instructor.rank}</figcaption>
              </figure>
              <div>
                <p className="folio-mark">{instructor.role}</p>
                <h3>{instructor.name}</h3>
              </div>
            </Link>
          </li>
        ))}
      </ol>
      <Link to="/instructors" className="text-link instructor-line__cta">
        {t("common.readBiographies")} <ArrowRight size={16} aria-hidden="true" />
      </Link>
    </div>
  );
}
