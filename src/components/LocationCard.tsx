import { ArrowUpRight, MapPin } from "lucide-react";
import { googleMapsUrl, siteInfo } from "../data/siteContent";

const mapQuery = `${siteInfo.name}, ${siteInfo.address}`;
const mapEmbedSrc = `https://www.google.com/maps?q=${encodeURIComponent(
  mapQuery,
)}&output=embed`;
export function LocationCard() {
  return (
    <article className="surface overflow-hidden rounded-[2rem]">
      <div className="relative min-h-[22rem] overflow-hidden bg-mist">
        <iframe
          title={`${siteInfo.name} Google map`}
          src={mapEmbedSrc}
          className="absolute inset-0 h-full w-full border-0"
          loading="lazy"
          allowFullScreen
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
      <div className="p-6">
        <p className="eyebrow">Location</p>
        <h3 className="mt-2 flex items-center gap-3 text-3xl text-ink">
          <MapPin className="h-7 w-7 shrink-0 text-vermilion" aria-hidden="true" />
          {siteInfo.location}
        </h3>
        <p className="mt-4 text-charcoal/78">{siteInfo.address}</p>
        <a
          href={googleMapsUrl}
          target="_blank"
          rel="noreferrer"
          className="btn-secondary mt-6"
        >
          Open Map
          <ArrowUpRight size={16} aria-hidden="true" />
        </a>
      </div>
    </article>
  );
}
