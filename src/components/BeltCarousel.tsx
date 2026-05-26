import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { assetPath } from "../utils/assetPath";

const photos = [
  assetPath("/renshinkan-gallery/belt-graduation/belt_graduation_large_class_group_01.jpg"),
  assetPath("/renshinkan-gallery/belt-graduation/belt_graduation_large_class_group_02.jpg"),
  assetPath("/renshinkan-gallery/belt-graduation/belt_graduation_certificate_mixed_group_01.jpg"),
  assetPath("/renshinkan-gallery/belt-graduation/belt_graduation_certificate_mixed_group_02.jpg"),
  assetPath("/renshinkan-gallery/belt-graduation/belt_graduation_certificate_mixed_group_03.jpg"),
  assetPath("/renshinkan-gallery/belt-graduation/belt_graduation_certificate_three_students_01.jpg"),
  assetPath("/renshinkan-gallery/belt-graduation/belt_graduation_certificate_two_students_01.jpg"),
  assetPath("/renshinkan-gallery/belt-graduation/belt_graduation_certificate_two_students_02.jpg"),
  assetPath("/renshinkan-gallery/belt-graduation/belt_graduation_certificate_two_students_03.jpg"),
  assetPath("/renshinkan-gallery/belt-graduation/belt_graduation_certificate_two_students_04.jpg"),
];

export function BeltCarousel() {
  const [active, setActive] = useState(0);
  const n = photos.length;
  const prevIdx = (active - 1 + n) % n;
  const nextIdx = (active + 1) % n;

  return (
    <div className="relative select-none">
      {/* Three-up image row */}
      <div className="flex items-center justify-center gap-3 overflow-hidden py-4 sm:gap-5">

        {/* Left — small + blurry */}
        <button
          type="button"
          onClick={() => setActive(prevIdx)}
          aria-label="Previous photo"
          className="relative hidden aspect-[4/3] w-[28%] max-w-[220px] shrink-0 cursor-pointer overflow-hidden rounded-2xl opacity-45 transition duration-300 hover:opacity-60 sm:block"
          style={{ filter: "blur(3px)" }}
        >
          <img
            src={photos[prevIdx]}
            alt=""
            aria-hidden="true"
            className="h-full w-full object-cover"
            loading="lazy"
          />
        </button>

        {/* Center — clear + large */}
        <div className="relative aspect-[4/3] w-full max-w-xl shrink-0 overflow-hidden rounded-[1.75rem] shadow-xl ring-1 ring-bamboo/25">
          <img
            key={active}
            src={photos[active]}
            alt={`Belt exam graduation photo ${active + 1} of ${n}`}
            className="h-full w-full object-cover"
          />
        </div>

        {/* Right — small + blurry */}
        <button
          type="button"
          onClick={() => setActive(nextIdx)}
          aria-label="Next photo"
          className="relative hidden aspect-[4/3] w-[28%] max-w-[220px] shrink-0 cursor-pointer overflow-hidden rounded-2xl opacity-45 transition duration-300 hover:opacity-60 sm:block"
          style={{ filter: "blur(3px)" }}
        >
          <img
            src={photos[nextIdx]}
            alt=""
            aria-hidden="true"
            className="h-full w-full object-cover"
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
        {photos.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setActive(i)}
            aria-label={`Go to photo ${i + 1}`}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === active ? "w-6 bg-bamboo" : "w-1.5 bg-ink/20"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
