import { Fragment } from "react";
import { ExternalLink, FileText, Presentation } from "lucide-react";
import type { MediaItem } from "../types/editableContent";
import {
  canUseRemoteDocumentViewer,
  documentKindLabel,
  documentTitle,
  formatFileSize,
  officeDocumentEmbedUrl,
} from "../utils/documentMedia";
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

  return {
    width: `min(100%, ${placement.widthPercent}%)`,
  };
}

function figureClassName(item: MediaItem, paragraphCount: number) {
  const placement = normalizeBodyMediaPlacement(item.bodyPlacement, paragraphCount);

  if (placement.align === "left") {
    return "my-4 sm:float-left sm:mb-3 sm:mr-6 sm:mt-2";
  }

  if (placement.align === "right") {
    return "my-4 sm:float-right sm:mb-3 sm:ml-6 sm:mt-2";
  }

  return "clear-both my-6 mx-auto";
}

function DocumentIcon({ item }: { item: MediaItem }) {
  if (item.documentKind === "ppt") {
    return <Presentation size={20} aria-hidden="true" />;
  }

  return <FileText size={20} aria-hidden="true" />;
}

function DocumentCard({ item }: { item: MediaItem }) {
  const size = formatFileSize(item.fileSize);

  return (
    <div className="rounded-lg border border-ink/10 bg-paper/70 p-4">
      <div className="flex items-start gap-3">
        <span className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bamboo/10 text-bamboo">
          <DocumentIcon item={item} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold leading-snug text-ink">{documentTitle(item)}</p>
          <p className="mt-1 text-sm text-charcoal/70">
            {[documentKindLabel(item.documentKind), size].filter(Boolean).join(" - ")}
          </p>
          <a
            href={item.src}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-vermilion underline-offset-4 hover:underline"
          >
            Open file
            <ExternalLink size={14} aria-hidden="true" />
          </a>
        </div>
      </div>
    </div>
  );
}

function DocumentViewer({ item }: { item: MediaItem }) {
  const title = documentTitle(item);

  if (item.displayMode === "link") {
    return <DocumentCard item={item} />;
  }

  if (item.documentKind === "pdf") {
    return (
      <div className="overflow-hidden rounded-lg border border-ink/10 bg-white">
        <iframe src={item.src} title={title} className="h-[520px] w-full" loading="lazy" />
      </div>
    );
  }

  if (!canUseRemoteDocumentViewer(item.src)) {
    return <DocumentCard item={item} />;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-ink/10 bg-white">
      <iframe
        src={officeDocumentEmbedUrl(item.src)}
        title={title}
        className={item.documentKind === "ppt" ? "aspect-video w-full" : "h-[520px] w-full"}
        loading="lazy"
      />
    </div>
  );
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
  const caption = item.type === "document" && item.displayMode === "link" ? item.caption : item.caption || item.title;
  const title = item.title || item.caption || fallbackTitle || "Event media";

  return (
    <figure className={figureClassName(item, paragraphCount)} style={figureStyle(item, paragraphCount)}>
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
      ) : item.type === "document" ? (
        <DocumentViewer item={item} />
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
    <div className={`flow-root ${className}`}>
      {renderMediaAt(0)}
      {paragraphs.map((paragraph, index) => (
        <Fragment key={`${paragraph}-${index}`}>
          <Paragraph text={paragraph} />
          {renderMediaAt(index + 1)}
        </Fragment>
      ))}
      <div className="clear-both" />
    </div>
  );
}
