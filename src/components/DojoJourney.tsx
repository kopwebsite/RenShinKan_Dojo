import { ExternalLink } from "lucide-react";
import { renshinkanBuildPhotos, type DojoBuildPhoto } from "../data/siteContent";

type DojoJourneyProps = {
  photos?: DojoBuildPhoto[];
};

export function DojoJourney({ photos = renshinkanBuildPhotos }: DojoJourneyProps) {
  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {photos.map((photo, index) => (
        <figure
          key={photo.id}
          className={`surface card-hover overflow-hidden rounded-[2rem] ${
            index === 0 ? "md:col-span-2" : ""
          }`}
        >
          <div className="relative aspect-[4/3] overflow-hidden bg-mist">
            <img
              src={photo.src}
              alt={photo.alt}
              className="h-full w-full object-cover"
              loading={index < 2 ? "eager" : "lazy"}
            />
            <div
              className={`absolute left-4 top-4 rounded-full px-3 py-1 text-xs font-bold uppercase shadow-sm ${
                photo.dateDark
                  ? "bg-paper/75 text-ink"
                  : "bg-ink/55 text-paper"
              }`}
            >
              {photo.date}
            </div>
          </div>

          <figcaption className="space-y-3 p-6">
            <div>
              <h3 className="text-2xl text-ink">{photo.title}</h3>
              <p className="mt-2 text-sm leading-6 text-charcoal/76">
                {photo.caption}
              </p>
            </div>

            <div className="border-t border-ink/10 pt-3 text-xs leading-5 text-charcoal/64">
              <p>
                <span className="font-semibold text-ink/80">Source: </span>
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
                Source gallery
                <ExternalLink size={13} aria-hidden="true" />
              </a>
            </div>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
