import type { MouseEvent } from "react";
import { useEffect, useState } from "react";
import { aikidoTimeline } from "../data/siteContent";

export function Timeline() {
  const [activeSectionId, setActiveSectionId] = useState(
    aikidoTimeline[0]?.sectionId ?? "",
  );

  useEffect(() => {
    const sections = aikidoTimeline
      .map((item) => document.getElementById(item.sectionId))
      .filter((section): section is HTMLElement => Boolean(section));

    if (!sections.length || !("IntersectionObserver" in window)) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntry = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];

        if (visibleEntry?.target.id) {
          setActiveSectionId(visibleEntry.target.id);
        }
      },
      {
        rootMargin: "-28% 0px -58% 0px",
        threshold: 0.1,
      },
    );

    sections.forEach((section) => observer.observe(section));

    return () => observer.disconnect();
  }, []);

  const handleTimelineClick = (
    event: MouseEvent<HTMLAnchorElement>,
    sectionId: string,
  ) => {
    const section = document.getElementById(sectionId);

    if (!section) {
      return;
    }

    event.preventDefault();
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    section.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "start",
    });
    window.history.pushState(null, "", `#${sectionId}`);
    setActiveSectionId(sectionId);
  };

  return (
    <ol className="relative grid gap-3 border-l border-ink/15 pl-5">
      {aikidoTimeline.map((item) => (
        <li key={`${item.year}-${item.title}`} className="relative">
          <span
            className={`absolute -left-[26px] top-5 h-3 w-3 rounded-full ring-4 ring-paper transition ${
              activeSectionId === item.sectionId ? "bg-vermilion" : "bg-bamboo/45"
            }`}
            aria-hidden="true"
          />
          <a
            href={`#${item.sectionId}`}
            data-active={activeSectionId === item.sectionId}
            className="group block rounded-2xl px-4 py-3 transition hover:bg-paper/70 focus-visible:outline-vermilion data-[active=true]:bg-paper/80 data-[active=true]:shadow-line"
            onClick={(event) => handleTimelineClick(event, item.sectionId)}
          >
            <p className="text-sm font-bold text-bamboo">{item.year}</p>
            <h3 className="mt-1 text-2xl text-ink transition group-hover:text-vermilion">
              {item.title}
            </h3>
            <p className="mt-2 text-sm text-charcoal/75">{item.description}</p>
          </a>
        </li>
      ))}
    </ol>
  );
}
