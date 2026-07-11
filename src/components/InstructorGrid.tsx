import { instructors } from "../data/siteContent";
import { useTranslation } from "../i18n";
import { instructorKeys, translateInstructor } from "../utils/siteContentTranslations";
import { ResponsiveImage } from "./ResponsiveImage";

export function InstructorGrid({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const localizedInstructors = instructors.map((instructor, index) =>
    translateInstructor(t, instructor, instructorKeys[index]),
  );
  const visible = compact ? localizedInstructors.slice(0, 3) : localizedInstructors;

  return (
    <div className={compact ? "instructor-editorial instructor-editorial--compact" : "instructor-editorial"}>
      {visible.map((instructor, index) => (
        <article className={`instructor-profile instructor-profile--${(index % 3) + 1}`} key={instructor.name}>
          <figure>
            {instructor.imageSrc ? (
              <ResponsiveImage
                src={instructor.imageSrc}
                alt={instructor.imageAlt ?? `${instructor.name}, RenShinKan instructor`}
                imgClassName="h-full w-full object-cover object-[50%_22%]"
                loading="lazy"
              />
            ) : (
              <div className="ink-wash h-full w-full" role="img" aria-label={t("a11y.portraitPlaceholder", { name: instructor.name })} />
            )}
            <figcaption>{instructor.rank}</figcaption>
          </figure>
          <div className="instructor-profile__text">
            <p className="folio-mark">{instructor.role}</p>
            <h3>{instructor.name}</h3>
            <p>{instructor.trainingBackground}</p>
            {!compact && instructor.teachingFocus ? (
              <blockquote>{instructor.teachingFocus}</blockquote>
            ) : null}
            {!compact && instructor.languages ? (
              <p className="marginal-note">Languages: {instructor.languages}</p>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}
