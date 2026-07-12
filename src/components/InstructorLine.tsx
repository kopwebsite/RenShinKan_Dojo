import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { instructors } from "../data/siteContent";
import { useTranslation } from "../i18n";
import { instructorKeys, translateInstructor } from "../utils/siteContentTranslations";
import { ResponsiveImage } from "./ResponsiveImage";

/**
 * Homepage "line of practice": the founder opens the line and every current
 * instructor from the shared data source follows along one baseline, so
 * adding or removing an instructor in siteContent updates this section too.
 */
export function InstructorLine() {
  const { t } = useTranslation();
  const localized = instructors.map((instructor, index) =>
    translateInstructor(t, instructor, instructorKeys[index]),
  );
  const [lead, ...line] = localized;

  return (
    <div className="instructor-line">
      <article className="instructor-line__lead">
        <figure>
          {lead.imageSrc ? (
            <ResponsiveImage
              src={lead.imageSrc}
              alt={lead.imageAlt ?? `${lead.name}, RenShinKan instructor`}
              loading="lazy"
            />
          ) : (
            <div className="ink-wash h-full w-full" role="img" aria-label={t("a11y.portraitPlaceholder", { name: lead.name })} />
          )}
          <figcaption>{lead.rank}</figcaption>
        </figure>
        <div>
          <p className="folio-mark">{lead.role}</p>
          <h3><Link to="/instructors">{lead.name}</Link></h3>
          <p>{lead.trainingBackground}</p>
          <Link to="/instructors" className="text-link">
            {t("common.readBiographies")} <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </article>

      <ul className="instructor-line__rail" aria-label={t("home.instructors.railLabel")}>
        {line.map((instructor) => (
          <li key={instructor.name}>
            <Link to="/instructors">
              <figure>
                {instructor.imageSrc ? (
                  <ResponsiveImage
                    src={instructor.imageSrc}
                    alt={instructor.imageAlt ?? `${instructor.name}, RenShinKan instructor`}
                    loading="lazy"
                    sizes="(max-width: 600px) 62vw, 20vw"
                  />
                ) : (
                  <div className="ink-wash h-full w-full" role="img" aria-label={t("a11y.portraitPlaceholder", { name: instructor.name })} />
                )}
                <figcaption>{instructor.rank}</figcaption>
              </figure>
              <h4>{instructor.name}</h4>
              <p>{instructor.role}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
