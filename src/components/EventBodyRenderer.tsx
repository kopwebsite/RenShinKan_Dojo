import { Fragment } from "react";
import type { MediaItem } from "../types/editableContent";
import { normalizeBodyMediaPlacement, splitEventBodyParagraphs } from "../utils/eventBody";
import { normalizeEmbedUrl } from "../utils/mediaEmbeds";
import { ResponsiveImage } from "./ResponsiveImage";

type EventBodyRendererProps = {
  body: string;
  media?: MediaItem[];
  fallbackTitle?: string;
  className?: string;
};

function figureStyle(item: MediaItem, paragraphCount: number) {
  const placement = normalizeBodyMediaPlacement(item.bodyPlacement, paragraphCount);
  const align = placement.align;

  return {
    width: `min(100%, ${placement.widthPercent}%)`,
    marginLeft: align === "left" ? 0 : "auto",
    marginRight: align === "right" ? 0 : "auto",
  };
}

function EventMediaFigure({
  item,
  paragraphCount,
  fallbackTitle,
}: {
  item: MediaItem;
  paragraphCount: number;
  fallbackTitle?: string;
}) {
  const caption = item.caption || item.title;
  const title = item.title || item.caption || fallbackTitle || "Event media";

  return (
    <figure className="my-6" style={figureStyle(item, paragraphCount)}>
      {item.type === "video" ? (
        <div className="aspect-video overflow-hidden rounded-lg border border-ink/10 bg-ink">
          <iframe
            key={item.src}
            src={normalizeEmbedUrl(item.src)}
            title={title}
            className="h-full w-full"
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
      ) : (
        <ResponsiveImage
          src={item.src}
          avif={item.avif}
          webp={item.webp}
          alt={item.alt || title}
          imgClassName="h-auto w-full rounded-lg border border-ink/10"
          objectPosition={item.objectPosition || "center"}
          loading="lazy"
          width={item.width}
          height={item.height}
        />
      )}
      {caption ? <figcaption className="mt-2 text-sm text-charcoal/70">{caption}</figcaption> : null}
    </figure>
  );
}

function Paragraph({ text }: { text: string }) {
  const lines = text.split(/\n/);

  return (
    <p className="my-4 whitespace-normal text-sm leading-7 text-charcoal/80 sm:text-base">
      {lines.map((line, index) => (
        <Fragment key={`${line}-${index}`}>
          {index > 0 ? <br /> : null}
          {line}
        </Fragment>
      ))}
    </p>
  );
}

export function EventBodyRenderer({ body, media = [], fallbackTitle, className = "" }: EventBodyRendererProps) {
  const paragraphs = splitEventBodyParagraphs(body);
  const paragraphCount = paragraphs.length;
  const mediaByPosition = new Map<number, MediaItem[]>();

  media.forEach((item) => {
    const placement = normalizeBodyMediaPlacement(item.bodyPlacement, paragraphCount);
    const items = mediaByPosition.get(placement.position) ?? [];
    items.push(item);
    mediaByPosition.set(placement.position, items);
  });

  if (paragraphCount === 0 && media.length === 0) {
    return null;
  }

  const renderMediaAt = (position: number) =>
    (mediaByPosition.get(position) ?? []).map((item) => (
      <EventMediaFigure key={item.id} item={item} paragraphCount={paragraphCount} fallbackTitle={fallbackTitle} />
    ));

  return (
    <div className={className}>
      {renderMediaAt(0)}
      {paragraphs.map((paragraph, index) => (
        <Fragment key={`${paragraph}-${index}`}>
          <Paragraph text={paragraph} />
          {renderMediaAt(index + 1)}
        </Fragment>
      ))}
    </div>
  );
}
