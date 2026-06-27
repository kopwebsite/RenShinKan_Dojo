import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ExternalLink, FileText, Play } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "../i18n";
import { documentKindLabel, documentTitle } from "../utils/documentMedia";
import { normalizeEmbedUrl } from "../utils/mediaEmbeds";
import { DeferredEmbed } from "./DeferredEmbed";
import { ResponsiveImage } from "./ResponsiveImage";

type SliderMediaItem = {
  id: string;
  type: "image" | "video" | "document";
  src: string;
  avif?: string;
  webp?: string;
  alt?: string;
  title?: string;
  caption?: string;
  documentKind?: "pdf" | "docx" | "ppt";
  fileName?: string;
  objectPosition?: string;
  width?: number;
  height?: number;
};

type MediaSliderProps = {
  media: SliderMediaItem[];
  label: string;
  className?: string;
  showIndexNavigation?: boolean;
  indexWindowSize?: number;
  indexJumpSize?: number;
};

export function MediaSlider({
  media,
  label,
  className = "",
  showIndexNavigation = false,
  indexWindowSize = 5,
  indexJumpSize = 10,
}: MediaSliderProps) {
  const { t } = useTranslation();
  const [activeIndex, setActiveIndex] = useState(0);

  if (media.length === 0) {
    return null;
  }

  const active = media[activeIndex];
  const captionTitle = active.title || active.caption;
  const showCaption = Boolean(captionTitle) || active.type === "video";
  const previous = () => setActiveIndex((index) => (index === 0 ? media.length - 1 : index - 1));
  const next = () => setActiveIndex((index) => (index + 1) % media.length);
  const visibleIndexCount = Math.min(indexWindowSize, media.length);
  const maxIndexStart = Math.max(media.length - visibleIndexCount, 0);
  const indexStart = Math.min(Math.max(activeIndex - Math.floor(visibleIndexCount / 2), 0), maxIndexStart);
  const visibleIndexes = Array.from({ length: visibleIndexCount }, (_, index) => indexStart + index);
  const jumpIndexes = (offset: number) => {
    setActiveIndex((index) => {
      const nextIndex = (index + offset) % media.length;
      return nextIndex < 0 ? nextIndex + media.length : nextIndex;
    });
  };

  return (
    <div className={className} aria-label={label}>
      <figure className="surface overflow-hidden rounded-[1.75rem]">
        <div className="relative aspect-[16/9] bg-ink">
          {active.type === "video" ? (
            <DeferredEmbed
              key={active.src}
              src={normalizeEmbedUrl(active.src)}
              title={active.title || active.caption || label}
              className="absolute inset-0 h-full w-full"
              buttonLabel={`${t("common.video")}: ${active.title || active.caption || label}`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          ) : active.type === "document" ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-paper p-6 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-bamboo/10 text-bamboo">
                <FileText size={26} aria-hidden="true" />
              </span>
              <p className="max-w-md text-xl font-bold text-ink">{documentTitle(active)}</p>
              <p className="text-sm text-charcoal/70">{documentKindLabel(active.documentKind)}</p>
              <a
                href={active.src}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary mt-2"
              >
                Open file
                <ExternalLink size={16} aria-hidden="true" />
              </a>
            </div>
          ) : (
            <ResponsiveImage
              key={active.src}
              src={active.src}
              avif={active.avif}
              webp={active.webp}
              alt={active.alt || active.title || ""}
              imgClassName="absolute inset-0 h-full w-full object-cover"
              objectPosition={active.objectPosition || "center"}
              loading="lazy"
              width={active.width}
              height={active.height}
            />
          )}

          {media.length > 1 ? (
            <>
              <button
                type="button"
                onClick={previous}
                className="absolute left-2 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-ink/70 text-paper transition hover:bg-ink sm:left-4"
                aria-label={t("a11y.previousMedia", { label })}
              >
                <ChevronLeft size={20} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={next}
                className="absolute right-2 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-ink/70 text-paper transition hover:bg-ink sm:right-4"
                aria-label={t("a11y.nextMedia", { label })}
              >
                <ChevronRight size={20} aria-hidden="true" />
              </button>
            </>
          ) : null}
        </div>

        {showCaption ? (
          <figcaption className="p-5">
            <div className="flex flex-wrap items-center gap-3">
              {captionTitle ? <p className="text-xl font-bold text-ink">{captionTitle}</p> : null}
              {active.type === "video" ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-vermilion/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-vermilion">
                  <Play size={12} aria-hidden="true" />
                  {t("common.video")}
                </span>
              ) : null}
            </div>
            {active.caption && active.caption !== captionTitle ? (
              <p className="mt-2 text-sm text-charcoal/72">{active.caption}</p>
            ) : null}
          </figcaption>
        ) : null}
      </figure>

      {showIndexNavigation && media.length > 1 ? (
        <nav
          className="mt-5 flex flex-wrap items-center justify-center gap-2"
          aria-label={t("a11y.mediaSlideNavigation", { label })}
        >
          <button
            type="button"
            onClick={() => jumpIndexes(-indexJumpSize)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-ink/10 bg-paper/70 text-ink transition hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bamboo"
            aria-label={t("a11y.skipBackMediaItems", { count: indexJumpSize, label })}
          >
            <ChevronsLeft size={18} aria-hidden="true" />
          </button>

          {visibleIndexes.map((mediaIndex) => {
            const isActive = mediaIndex === activeIndex;

            return (
              <button
                key={mediaIndex}
                type="button"
                onClick={() => setActiveIndex(mediaIndex)}
                className={`flex h-10 min-w-10 items-center justify-center rounded-full px-3 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bamboo ${
                  isActive
                    ? "bg-ink text-paper shadow-line"
                    : "border border-ink/10 bg-paper/70 text-ink hover:bg-paper"
                }`}
                aria-label={t("a11y.goToPhoto", { number: mediaIndex + 1 })}
                aria-current={isActive ? true : undefined}
              >
                {mediaIndex + 1}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => jumpIndexes(indexJumpSize)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-ink/10 bg-paper/70 text-ink transition hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bamboo"
            aria-label={t("a11y.skipAheadMediaItems", { count: indexJumpSize, label })}
          >
            <ChevronsRight size={18} aria-hidden="true" />
          </button>
        </nav>
      ) : null}
    </div>
  );
}
