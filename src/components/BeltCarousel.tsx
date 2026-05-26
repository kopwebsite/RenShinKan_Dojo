import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { passedTestStudents, type PassedTestStudent } from "../data/editableContent";

type BeltCarouselProps = {
  students?: PassedTestStudent[];
};

export function BeltCarousel({ students = passedTestStudents }: BeltCarouselProps) {
  const [active, setActive] = useState(0);
  const n = students.length;
  const prevIdx = (active - 1 + n) % n;
  const nextIdx = (active + 1) % n;
  const activeStudent = students[active];

  if (students.length === 0) {
    return null;
  }

  return (
    <div className="relative select-none">
      {/* Three-up image row */}
      <div className="flex items-center justify-center gap-3 overflow-hidden py-4 sm:gap-5">

        {/* Left image */}
        <button
          type="button"
          onClick={() => setActive(prevIdx)}
          aria-label="Previous photo"
          className="relative hidden aspect-[4/3] w-[28%] max-w-[220px] shrink-0 cursor-pointer overflow-hidden rounded-2xl opacity-45 transition duration-300 hover:opacity-60 sm:block"
          style={{ filter: "blur(3px)" }}
        >
          <img
            src={students[prevIdx].image}
            alt=""
            aria-hidden="true"
            className="h-full w-full object-cover"
            style={{ objectPosition: students[prevIdx].objectPosition || "center" }}
            loading="lazy"
          />
        </button>

        {/* Center image */}
        <div className="relative aspect-[4/3] w-full max-w-xl shrink-0 overflow-hidden rounded-[1.75rem] shadow-xl ring-1 ring-bamboo/25">
          <img
            key={active}
            src={activeStudent.image}
            alt={activeStudent.caption || activeStudent.name || `Belt exam graduation photo ${active + 1} of ${n}`}
            className="h-full w-full object-cover"
            style={{ objectPosition: activeStudent.objectPosition || "center" }}
          />
        </div>

        {/* Right image */}
        <button
          type="button"
          onClick={() => setActive(nextIdx)}
          aria-label="Next photo"
          className="relative hidden aspect-[4/3] w-[28%] max-w-[220px] shrink-0 cursor-pointer overflow-hidden rounded-2xl opacity-45 transition duration-300 hover:opacity-60 sm:block"
          style={{ filter: "blur(3px)" }}
        >
          <img
            src={students[nextIdx].image}
            alt=""
            aria-hidden="true"
            className="h-full w-full object-cover"
            style={{ objectPosition: students[nextIdx].objectPosition || "center" }}
            loading="lazy"
          />
        </button>
      </div>

      {/* Prev arrow */}
      <button
        type="button"
        onClick={() => setActive(prevIdx)}
        aria-label="Previous photo"
        className="absolute left-0 top-1/2 z-10 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-ink/75 text-paper transition hover:bg-ink sm:-left-4"
      >
        <ChevronLeft size={18} aria-hidden="true" />
      </button>

      {/* Next arrow */}
      <button
        type="button"
        onClick={() => setActive(nextIdx)}
        aria-label="Next photo"
        className="absolute right-0 top-1/2 z-10 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-ink/75 text-paper transition hover:bg-ink sm:-right-4"
      >
        <ChevronRight size={18} aria-hidden="true" />
      </button>

      {/* Dot indicators */}
      <div className="mt-4 flex justify-center gap-1.5">
        {students.map((student, i) => (
          <button
            key={student.id}
            type="button"
            onClick={() => setActive(i)}
            aria-label={`Go to photo ${i + 1}`}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === active ? "w-6 bg-bamboo" : "w-1.5 bg-ink/20"
            }`}
          />
        ))}
      </div>
      <div className="mx-auto mt-5 max-w-2xl text-center">
        {activeStudent.name ? <h4 className="text-2xl text-ink">{activeStudent.name}</h4> : null}
        {activeStudent.caption ? <p className="mt-2 text-sm text-charcoal/72">{activeStudent.caption}</p> : null}
        {activeStudent.date ? <p className="mt-2 text-xs font-bold uppercase tracking-[0.14em] text-bamboo">{activeStudent.date}</p> : null}
      </div>
    </div>
  );
}
