import { renshinkanBuildPhotos, type DojoBuildPhoto } from "../data/siteContent";
import { ResponsiveImage } from "./ResponsiveImage";

type DojoJourneyProps = { photos?: DojoBuildPhoto[] };

export function DojoJourney({ photos = renshinkanBuildPhotos }: DojoJourneyProps) {
  return (
    <ol className="construction-timeline">
      {photos.map((photo, index) => (
        <li key={photo.id} className={index % 2 ? "construction-timeline__entry is-right" : "construction-timeline__entry"}>
          <div className="construction-timeline__mark" aria-hidden="true" />
          <figure>
            <ResponsiveImage src={photo.src} alt={photo.alt} imgClassName="h-full w-full object-cover" loading="lazy" />
            <figcaption>{photo.date}</figcaption>
          </figure>
          <div className="construction-timeline__copy">
            <p className="folio-mark">Archive {String(index + 1).padStart(2, "0")}</p>
            <h3>{photo.title}</h3>
            <p>{photo.caption}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
