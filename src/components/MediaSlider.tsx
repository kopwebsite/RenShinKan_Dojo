import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "../i18n";
import { normalizeEmbedUrl } from "../utils/mediaEmbeds";
import { ResponsiveImage } from "./ResponsiveImage";

type SliderMediaItem = {
  id: string;
  type: "image" | "video";
  src: string;
  avif?: string;
  webp?: string;
  alt?: string;
  title?: string;
  caption?: string;
  objectPosition?: string;
  width?: number;
  height?: number;
};

type MediaSliderProps = {
  media: SliderMediaItem[];
  label: string;
  className?: string;
};

export function MediaSlider({ media, label, className = "" }: MediaSliderProps) {
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

  return (
    <div className={className} aria-label={label}>
      <figure className="surface overflow-hidden rounded-[1.75rem]">
        <div className="relative aspect-[16/9] bg-ink">
          {active.type === "video" ? (
            <iframe
              key={active.src}
              src={normalizeEmbedUrl(active.src)}
              title={active.title || active.caption || label}
              className="absolute inset-0 h-full w-full"
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          ) : (
            <ResponsiveImage
              key={active.src}
              src={active.src}
              avif={active.avif}
              webp={active.webp}
              alt={active.alt || active.title || ""}
              imgClassName="absolute inset-0 h-full w-full object-cover"
              objectPosition={active.objectPosition || "center"}
              loading={activeIndex === 0 ? "eager" : "lazy"}
              width={active.width}
              height={active.height}
            />
          )}

          {media.length > 1 ? (
            <>
              <button
                type="button"
                onClick={previous}
                className="absolute left-4 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-ink/70 text-paper transition hover:bg-ink"
                aria-label={t("a11y.previousMedia", { label })}
              >
                <ChevronLeft size={20} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={next}
                className="absolute right-4 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-ink/70 text-paper transition hover:bg-ink"
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

    </div>
  );
}
