import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { passedTestStudents } from "../data/editableContent";
import { useTranslation } from "../i18n";
import { ResponsiveImage } from "./ResponsiveImage";

type PassedTestStudent = {
  id: string;
  image: string;
  name?: string;
  caption?: string;
  date?: string;
  objectPosition?: string;
};

type BeltCarouselProps = {
  students?: PassedTestStudent[];
};

export function BeltCarousel({ students = passedTestStudents }: BeltCarouselProps) {
  const { t } = useTranslation();
  const [active, setActive] = useState(0);
  const n = students.length;

  if (students.length === 0) {
    return null;
  }

  const prevIdx = (active - 1 + n) % n;
  const nextIdx = (active + 1) % n;
  const activeStudent = students[active];
  const dotWindowSize = 11;
  const dotStart = Math.max(
    0,
    Math.min(active - Math.floor(dotWindowSize / 2), n - dotWindowSize),
  );
  const visibleDots = students.slice(dotStart, dotStart + dotWindowSize);
  const hasStudentText = Boolean(activeStudent.name || activeStudent.caption || activeStudent.date);

  return (
    <div className="relative select-none">
      {/* Three-up image row */}
      <div className="flex items-center justify-center gap-3 overflow-hidden py-4 sm:gap-5">

        {/* Left image */}
        <button
          type="button"
          onClick={() => setActive(prevIdx)}
          aria-label={t("a11y.previousPhoto")}
          className="relative hidden aspect-[4/3] w-[28%] max-w-[220px] shrink-0 cursor-pointer overflow-hidden rounded-2xl opacity-45 transition duration-300 hover:opacity-60 sm:block"
          style={{ filter: "blur(3px)" }}
        >
          <ResponsiveImage
            src={students[prevIdx].image}
            alt=""
            aria-hidden="true"
            imgClassName="h-full w-full object-cover"
            objectPosition={students[prevIdx].objectPosition || "center"}
            loading="lazy"
          />
        </button>

        {/* Center image */}
        <div className="relative aspect-[4/3] w-full max-w-xl shrink-0 overflow-hidden rounded-[1.75rem] shadow-xl ring-1 ring-bamboo/25">
          <ResponsiveImage
            key={active}
            src={activeStudent.image}
            alt={activeStudent.caption || activeStudent.name || `Belt exam graduation photo ${active + 1} of ${n}`}
            imgClassName="h-full w-full object-cover"
            objectPosition={activeStudent.objectPosition || "center"}
          />
        </div>

        {/* Right image */}
        <button
          type="button"
          onClick={() => setActive(nextIdx)}
          aria-label={t("a11y.nextPhoto")}
          className="relative hidden aspect-[4/3] w-[28%] max-w-[220px] shrink-0 cursor-pointer overflow-hidden rounded-2xl opacity-45 transition duration-300 hover:opacity-60 sm:block"
          style={{ filter: "blur(3px)" }}
        >
          <ResponsiveImage
            src={students[nextIdx].image}
            alt=""
            aria-hidden="true"
            imgClassName="h-full w-full object-cover"
            objectPosition={students[nextIdx].objectPosition || "center"}
            loading="lazy"
          />
        </button>
      </div>

      {/* Prev arrow */}
      <button
        type="button"
        onClick={() => setActive(prevIdx)}
        aria-label={t("a11y.previousPhoto")}
        className="absolute left-0 top-1/2 z-10 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-ink/75 text-paper transition hover:bg-ink sm:-left-4"
      >
        <ChevronLeft size={18} aria-hidden="true" />
      </button>

      {/* Next arrow */}
      <button
        type="button"
        onClick={() => setActive(nextIdx)}
        aria-label={t("a11y.nextPhoto")}
        className="absolute right-0 top-1/2 z-10 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-ink/75 text-paper transition hover:bg-ink sm:-right-4"
      >
        <ChevronRight size={18} aria-hidden="true" />
      </button>

      {/* Dot indicators */}
      <div className="mt-4 flex justify-center gap-1.5">
        {visibleDots.map((student, visibleIndex) => {
          const i = dotStart + visibleIndex;

          return (
            <button
              key={student.id}
              type="button"
              onClick={() => setActive(i)}
              aria-label={t("a11y.goToPhoto", { number: i + 1 })}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === active ? "w-6 bg-bamboo" : "w-1.5 bg-ink/20"
              }`}
            />
          );
        })}
      </div>
      {hasStudentText ? (
        <div className="mx-auto mt-5 max-w-2xl text-center">
          {activeStudent.name ? <h4 className="text-2xl text-ink">{activeStudent.name}</h4> : null}
          {activeStudent.caption ? <p className="mt-2 text-sm text-charcoal/72">{activeStudent.caption}</p> : null}
          {activeStudent.date ? <p className="mt-2 text-xs font-bold uppercase tracking-[0.14em] text-bamboo">{activeStudent.date}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
