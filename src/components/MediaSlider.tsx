import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import { useState } from "react";
import type { EditableMedia } from "../data/editableContent";
import { normalizeEmbedUrl } from "../utils/mediaEmbeds";

type MediaSliderProps = {
  media: EditableMedia[];
  label: string;
  className?: string;
};

export function MediaSlider({ media, label, className = "" }: MediaSliderProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  if (media.length === 0) {
    return null;
  }

  const active = media[activeIndex];
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
            <img
              key={active.src}
              src={active.src}
              alt={active.alt || active.title || ""}
              className="absolute inset-0 h-full w-full object-cover"
              style={{ objectPosition: active.objectPosition || "center" }}
              loading={activeIndex === 0 ? "eager" : "lazy"}
            />
          )}

          {media.length > 1 ? (
            <>
              <button
                type="button"
                onClick={previous}
                className="absolute left-4 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-ink/70 text-paper transition hover:bg-ink"
                aria-label={`Previous ${label}`}
              >
                <ChevronLeft size={20} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={next}
                className="absolute right-4 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-ink/70 text-paper transition hover:bg-ink"
                aria-label={`Next ${label}`}
              >
                <ChevronRight size={20} aria-hidden="true" />
              </button>
            </>
          ) : null}
        </div>

        <figcaption className="p-5">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-xl font-bold text-ink">{active.title || active.caption || `Media ${activeIndex + 1}`}</p>
            {active.type === "video" ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-vermilion/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-vermilion">
                <Play size={12} aria-hidden="true" />
                Video
              </span>
            ) : null}
          </div>
          {active.caption ? <p className="mt-2 text-sm text-charcoal/72">{active.caption}</p> : null}
        </figcaption>
      </figure>

      {media.length > 1 ? (
        <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-6">
          {media.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveIndex(index)}
              aria-label={`Show ${item.title || item.caption || `media ${index + 1}`}`}
              aria-current={index === activeIndex}
              className={`relative aspect-[4/3] overflow-hidden rounded-xl bg-ink/10 transition ${
                index === activeIndex ? "ring-2 ring-bamboo ring-offset-2" : "opacity-65 hover:opacity-100"
              }`}
            >
              {item.type === "video" ? (
                <span className="flex h-full w-full items-center justify-center bg-ink/85 text-paper">
                  <Play size={22} aria-hidden="true" />
                </span>
              ) : (
                <img
                  src={item.src}
                  alt=""
                  aria-hidden="true"
                  className="h-full w-full object-cover"
                  style={{ objectPosition: item.objectPosition || "center" }}
                  loading="lazy"
                />
              )}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
