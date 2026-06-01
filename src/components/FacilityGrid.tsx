import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { facilities } from "../data/siteContent";

export function FacilityGrid() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const scrollToIndex = useCallback((index: number) => {
    const container = scrollRef.current;
    if (!container) return;
    const clamped = Math.max(0, Math.min(index, facilities.length - 1));
    const card = container.children[clamped] as HTMLElement | undefined;
    card?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, []);

  const handleScroll = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    const center = container.scrollLeft + container.clientWidth / 2;
    let closest = 0;
    let closestDistance = Number.POSITIVE_INFINITY;
    Array.from(container.children).forEach((child, index) => {
      const el = child as HTMLElement;
      const elCenter = el.offsetLeft + el.offsetWidth / 2;
      const distance = Math.abs(elCenter - center);
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = index;
      }
    });
    setActiveIndex(closest);
  }, []);

  // Keep the active index correct after resize (e.g. switching to/from desktop grid).
  useEffect(() => {
    window.addEventListener("resize", handleScroll);
    return () => window.removeEventListener("resize", handleScroll);
  }, [handleScroll]);

  const atStart = activeIndex === 0;
  const atEnd = activeIndex === facilities.length - 1;

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden min-[420px]:gap-4 lg:mx-0 lg:grid lg:grid-cols-5 lg:overflow-visible lg:px-0 lg:pb-0"
      >
        {facilities.map((facility) => {
          const Icon = facility.icon;
          return (
            <article
              key={facility.title}
              className="surface card-hover flex shrink-0 basis-[82%] snap-center flex-col rounded-[1.35rem] p-4 min-[420px]:basis-[68%] min-[420px]:p-5 sm:basis-[42%] sm:rounded-[1.75rem] lg:basis-auto lg:p-6"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-bamboo/10 text-bamboo sm:h-12 sm:w-12">
                <Icon aria-hidden="true" size={20} />
              </div>
              <h3 className="mt-4 text-[1.24rem] leading-tight text-ink min-[420px]:text-[1.36rem] sm:mt-5 sm:text-2xl">
                {facility.title}
              </h3>
              <p className="mt-2 text-xs leading-5 text-charcoal/75 sm:mt-3 sm:text-sm">
                {facility.description}
              </p>
            </article>
          );
        })}
      </div>

      {/* Swipe controls — mobile/tablet only; desktop shows the full grid. */}
      <div className="mt-5 flex items-center justify-between lg:hidden">
        <button
          type="button"
          onClick={() => scrollToIndex(activeIndex - 1)}
          disabled={atStart}
          aria-label="Previous facility"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-ink/10 bg-paper/60 text-ink backdrop-blur-md transition hover:border-vermilion/30 hover:text-vermilion disabled:cursor-not-allowed disabled:opacity-35"
        >
          <ChevronLeft aria-hidden="true" size={20} />
        </button>

        <div className="flex items-center gap-2" role="tablist" aria-label="Facilities">
          {facilities.map((facility, index) => (
            <button
              key={facility.title}
              type="button"
              onClick={() => scrollToIndex(index)}
              aria-label={`Go to ${facility.title}`}
              aria-current={index === activeIndex}
              className={`h-2 rounded-full transition-all ${
                index === activeIndex ? "w-6 bg-bamboo" : "w-2 bg-ink/20"
              }`}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => scrollToIndex(activeIndex + 1)}
          disabled={atEnd}
          aria-label="Next facility"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-ink/10 bg-paper/60 text-ink backdrop-blur-md transition hover:border-vermilion/30 hover:text-vermilion disabled:cursor-not-allowed disabled:opacity-35"
        >
          <ChevronRight aria-hidden="true" size={20} />
        </button>
      </div>
    </div>
  );
}
