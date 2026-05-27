import { Medal, UserRoundCheck } from "lucide-react";
import { instructors } from "../data/siteContent";
import { useTranslation } from "../i18n";
import { ResponsiveImage } from "./ResponsiveImage";

export function InstructorGrid() {
  const { t } = useTranslation();

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      {instructors.map((instructor) => (
        <article
          key={instructor.role}
          className="surface card-hover overflow-hidden rounded-[2rem]"
        >
          <div className="relative aspect-[4/3] overflow-hidden bg-ink/5">
            {instructor.imageSrc ? (
              <ResponsiveImage
                src={instructor.imageSrc}
                alt={instructor.imageAlt ?? `${instructor.name} instructor portrait`}
                imgClassName="h-full w-full object-cover object-[50%_22%]"
                loading="lazy"
              />
            ) : (
              <div
                className="ink-wash h-full w-full"
                role="img"
                aria-label={t("a11y.portraitPlaceholder", { name: instructor.name })}
              />
            )}
          </div>
          <div className="p-6">
            <p className="text-sm font-bold text-bamboo">{instructor.role}</p>
            <h3 className="mt-2 text-3xl text-ink">{instructor.name}</h3>
            <dl className="mt-6 grid gap-4 text-sm">
              <div>
                <dt className="flex items-center gap-2 font-bold text-ink">
                  <Medal size={16} aria-hidden="true" />
                  {t("common.rank")}
                </dt>
                <dd className="mt-1 text-charcoal/75">{instructor.rank}</dd>
              </div>
              <div>
                <dt className="flex items-center gap-2 font-bold text-ink">
                  <UserRoundCheck size={16} aria-hidden="true" />
                  {t("common.trainingBackground")}
                </dt>
                <dd className="mt-1 text-charcoal/75">
                  {instructor.trainingBackground}
                </dd>
              </div>
              {instructor.teachingFocus ? (
                <div>
                  <dt className="font-bold text-ink">{t("common.teachingFocus")}</dt>
                  <dd className="mt-1 text-charcoal/75">{instructor.teachingFocus}</dd>
                </div>
              ) : null}
              {instructor.languages ? (
                <div>
                  <dt className="font-bold text-ink">{t("common.languagesSpoken")}</dt>
                  <dd className="mt-1 text-charcoal/75">{instructor.languages}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        </article>
      ))}
    </div>
  );
}
