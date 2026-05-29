import { Medal, UserRoundCheck } from "lucide-react";
import { instructors } from "../data/siteContent";
import { useTranslation } from "../i18n";
import { ResponsiveImage } from "./ResponsiveImage";

export function InstructorGrid() {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-2 gap-3 min-[420px]:gap-4 sm:gap-5 lg:grid-cols-3">
      {instructors.map((instructor) => (
        <article
          key={instructor.name}
          className="surface card-hover overflow-hidden rounded-[1.35rem] sm:rounded-[2rem]"
        >
          <div className="relative aspect-[4/5] overflow-hidden bg-ink/5 sm:aspect-[4/3]">
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
          <div className="p-3.5 min-[420px]:p-4 sm:p-6">
            <p className="text-[0.68rem] font-bold uppercase leading-snug tracking-[0.12em] text-bamboo sm:text-sm sm:normal-case sm:tracking-normal">
              {instructor.role}
            </p>
            <h3 className="mt-1.5 text-[1.28rem] leading-[1.05] text-ink min-[420px]:text-[1.42rem] sm:mt-2 sm:text-3xl">
              {instructor.name}
            </h3>
            <p className="mt-2 text-sm font-semibold leading-tight text-charcoal/76 sm:hidden">
              {instructor.rank}
            </p>
            <details className="mt-3 sm:hidden">
              <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.12em] text-vermilion">
                {t("common.trainingBackground")}
              </summary>
              <p className="mt-2 text-xs leading-5 text-charcoal/72">
                {instructor.trainingBackground}
              </p>
            </details>
            <dl className="mt-6 hidden gap-4 text-sm sm:grid">
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
