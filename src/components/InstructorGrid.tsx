import { instructors } from "../data/siteContent";
import { useTranslation } from "../i18n";
import { instructorKeys, translateInstructor } from "../utils/siteContentTranslations";
import { ResponsiveImage } from "./ResponsiveImage";

export function InstructorGrid() {
  const { t } = useTranslation();
  const localizedInstructors = instructors.map((instructor, index) =>
    translateInstructor(t, instructor, instructorKeys[index]),
  );

  return (
    <div className="instructor-editorial">
      {localizedInstructors.map((instructor, index) => (
        <article className={`instructor-profile instructor-profile--${(index % 3) + 1}`} key={instructor.name}>
          <figure>
            {instructor.imageSrc ? (
              <ResponsiveImage
                src={instructor.imageSrc}
                alt={instructor.imageAlt ?? `${instructor.name}, RenShinKan instructor`}
                imgClassName="h-full w-full object-cover object-[50%_22%]"
                loading={index === 0 ? "eager" : "lazy"}
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
            {instructor.teachingFocus ? (
              <blockquote>{instructor.teachingFocus}</blockquote>
            ) : null}
            {instructor.languages ? (
              <p className="marginal-note">Languages: {instructor.languages}</p>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}
