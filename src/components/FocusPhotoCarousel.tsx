import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type FocusCarouselPhoto = {
  src: string;
  alt: string;
  title: string;
  caption?: string;
};

type FocusPhotoCarouselProps = {
  photos: FocusCarouselPhoto[];
  label: string;
};

const carouselOffsets = [-2, -1, 0, 1, 2] as const;

const frameStyles: Record<(typeof carouselOffsets)[number], string> = {
  "-2": "w-[15%] scale-[0.82] opacity-35 blur-[1.5px]",
  "-1": "w-[18%] scale-90 opacity-65 blur-[0.8px]",
  0: "z-10 w-[34%] scale-100 opacity-100 blur-0",
  1: "w-[18%] scale-90 opacity-65 blur-[0.8px]",
  2: "w-[15%] scale-[0.82] opacity-35 blur-[1.5px]",
};

const imageHeights: Record<(typeof carouselOffsets)[number], string> = {
  "-2": "h-24 sm:h-36 lg:h-44",
  "-1": "h-32 sm:h-48 lg:h-60",
  0: "h-44 sm:h-64 lg:h-80",
  1: "h-32 sm:h-48 lg:h-60",
  2: "h-24 sm:h-36 lg:h-44",
};

function wrapIndex(index: number, total: number) {
  return ((index % total) + total) % total;
}

export function FocusPhotoCarousel({ photos, label }: FocusPhotoCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const activePhoto = photos[activeIndex];

  const goToPrevious = () => {
    setActiveIndex((currentIndex) => wrapIndex(currentIndex - 1, photos.length));
  };

  const goToNext = () => {
    setActiveIndex((currentIndex) => wrapIndex(currentIndex + 1, photos.length));
  };

  if (photos.length === 0) {
    return null;
  }

  return (
    <div className="relative" aria-label={label}>
      <div className="flex min-h-[12.5rem] items-center justify-center gap-2 overflow-hidden px-12 sm:min-h-[18rem] sm:gap-4 lg:min-h-[23rem]">
        {carouselOffsets.map((offset) => {
          const photo = photos[wrapIndex(activeIndex + offset, photos.length)];
          const isActive = offset === 0;

          return (
            <figure
              key={`${photo.src}-${offset}`}
              className={`${frameStyles[offset]} shrink-0 transition-all duration-500 ease-out`}
              aria-hidden={!isActive}
            >
              <img
                src={photo.src}
                alt={isActive ? photo.alt : ""}
                className={`${imageHeights[offset]} w-full rounded-[1.25rem] object-cover shadow-line ring-1 ring-ink/10`}
                loading={isActive ? "eager" : "lazy"}
              />
            </figure>
          );
        })}
      </div>

      <button
        type="button"
        onClick={goToPrevious}
        className="absolute left-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-ink/15 bg-paper/90 text-ink shadow-line transition hover:-translate-x-0.5 hover:border-vermilion/50 hover:text-vermilion"
        aria-label={`Previous ${label}`}
      >
        <ChevronLeft size={22} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={goToNext}
        className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-ink/15 bg-paper/90 text-ink shadow-line transition hover:translate-x-0.5 hover:border-vermilion/50 hover:text-vermilion"
        aria-label={`Next ${label}`}
      >
        <ChevronRight size={22} aria-hidden="true" />
      </button>

      <div className="mx-auto mt-4 max-w-2xl text-center" aria-live="polite">
        <h3 className="text-2xl text-ink">{activePhoto.title}</h3>
        {activePhoto.caption ? (
          <p className="mt-2 text-sm text-charcoal/72">{activePhoto.caption}</p>
        ) : null}
      </div>
    </div>
  );
}
