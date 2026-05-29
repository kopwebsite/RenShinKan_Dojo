import { ExternalLink } from "lucide-react";
import { renshinkanBuildPhotos, type DojoBuildPhoto } from "../data/siteContent";
import { useTranslation } from "../i18n";
import { ResponsiveImage } from "./ResponsiveImage";

type DojoJourneyProps = {
  photos?: DojoBuildPhoto[];
};

export function DojoJourney({ photos = renshinkanBuildPhotos }: DojoJourneyProps) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-2 gap-3 min-[420px]:gap-4 md:gap-5 xl:grid-cols-3">
      {photos.map((photo, index) => (
        <figure
          key={photo.id}
          className={`surface card-hover overflow-hidden rounded-[1.35rem] md:rounded-[2rem] ${
            index === 0 ? "md:col-span-2" : ""
          }`}
        >
          <div className="relative aspect-[4/3] overflow-hidden bg-mist">
            <ResponsiveImage
              src={photo.src}
              alt={photo.alt}
              imgClassName="h-full w-full object-cover"
              loading={index < 2 ? "eager" : "lazy"}
            />
            <div
              className={`absolute left-2 top-2 rounded-full px-2.5 py-1 text-[0.63rem] font-bold uppercase leading-none shadow-sm md:left-4 md:top-4 md:px-3 md:text-xs ${
                photo.dateDark
                  ? "bg-paper/75 text-ink"
                  : "bg-ink/55 text-paper"
              }`}
            >
              {photo.date}
            </div>
          </div>

          <figcaption className="space-y-2 p-3.5 min-[420px]:p-4 md:space-y-3 md:p-6">
            <div>
              <h3 className="text-[1.18rem] leading-tight text-ink min-[420px]:text-[1.3rem] md:text-2xl">
                {photo.title}
              </h3>
              <p className="mt-1 line-clamp-3 text-xs leading-5 text-charcoal/76 md:mt-2 md:text-sm md:leading-6">
                {photo.caption}
              </p>
            </div>

            <div className="hidden border-t border-ink/10 pt-3 text-xs leading-5 text-charcoal/64 lg:block">
              <p>
                <span className="font-semibold text-ink/80">{t("common.source")}: </span>
                {photo.sourceName}; {photo.sourceFile}.
              </p>
              <p>{photo.credit}</p>
              <p>{photo.rightsNote}</p>
              <a
                href={photo.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 font-semibold text-vermilion transition hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-vermilion"
              >
                {t("common.sourceGallery")}
                <ExternalLink size={13} aria-hidden="true" />
              </a>
            </div>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
