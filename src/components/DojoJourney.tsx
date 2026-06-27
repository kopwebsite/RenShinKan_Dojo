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
    <div className="mx-auto grid max-w-6xl grid-cols-2 gap-3 min-[420px]:gap-4 md:grid-cols-3 md:gap-5 xl:grid-cols-4">
      {photos.map((photo) => (
        <figure
          key={photo.id}
          className="surface card-hover overflow-hidden rounded-[1.1rem] md:rounded-[1.35rem]"
        >
          <div className="relative aspect-[4/3] overflow-hidden bg-mist">
            <ResponsiveImage
              src={photo.src}
              alt={photo.alt}
              imgClassName="h-full w-full object-cover"
              loading="lazy"
            />
            <div
              className={`absolute left-2 top-2 rounded-full px-2.5 py-1 text-[0.63rem] font-bold uppercase leading-none shadow-sm md:left-3 md:top-3 md:px-3 md:text-[0.68rem] ${
                photo.dateDark
                  ? "bg-paper/75 text-ink"
                  : "bg-ink/55 text-paper"
              }`}
            >
              {photo.date}
            </div>
          </div>

          <figcaption className="space-y-2 p-3.5 min-[420px]:p-4 md:p-5">
            <div>
              <h3 className="text-[1.05rem] leading-tight text-ink min-[420px]:text-[1.15rem] md:text-xl">
                {photo.title}
              </h3>
              <p className="mt-1 line-clamp-3 text-xs leading-5 text-charcoal/76 md:mt-2 md:text-[0.82rem] md:leading-5">
                {photo.caption}
              </p>
            </div>

            <div className="hidden border-t border-ink/10 pt-3 text-xs leading-5 text-charcoal/64 xl:block">
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
