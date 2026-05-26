import { CalendarDays, Filter } from "lucide-react";
import { useState } from "react";
import { workshops } from "../data/siteContent";

const filterOptions = ["All", "Beginner", "Children", "Weapons"] as const;
type WorkshopFilter = (typeof filterOptions)[number];

export function WorkshopCards() {
  const [filter, setFilter] = useState<WorkshopFilter>("All");
  const visibleWorkshops = workshops.filter(
    (workshop) => filter === "All" || workshop.category === filter,
  );

  return (
    <div>
      <div className="mb-8 flex flex-wrap gap-2" aria-label="Workshop filters">
        {filterOptions.map((option) => (
          <button
            key={option}
            type="button"
            className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold transition ${
              filter === option
                ? "border-ink bg-ink text-paper"
                : "border-ink/10 bg-paper/70 text-charcoal hover:border-vermilion/40 hover:text-vermilion"
            }`}
            aria-pressed={filter === option}
            onClick={() => setFilter(option)}
          >
            <Filter size={15} aria-hidden="true" />
            {option}
          </button>
        ))}
      </div>

      {visibleWorkshops.length > 0 ? (
        <div className="grid gap-5 md:grid-cols-3">
          {visibleWorkshops.map((workshop) => (
            <article
              key={workshop.title}
              className="surface card-hover flex min-h-[22rem] flex-col rounded-[2rem] p-6"
            >
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-vermilion/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-vermilion">
                  {workshop.category}
                </span>
              </div>
              <h3 className="mt-6 text-3xl leading-tight text-ink">{workshop.title}</h3>
              <p className="mt-4 text-sm text-charcoal/75">{workshop.description}</p>
              <dl className="mt-auto grid gap-3 pt-6 text-sm">
                <div className="flex gap-2 text-charcoal/80">
                  <CalendarDays className="mt-0.5 h-4 w-4 text-bamboo" aria-hidden="true" />
                  <div>
                    <dt className="sr-only">Date and time</dt>
                    <dd>{workshop.date} · {workshop.time}</dd>
                  </div>
                </div>
                <div>
                  <dt className="font-bold text-ink">For</dt>
                  <dd className="mt-1 text-charcoal/75">{workshop.audience}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      ) : (
        <div className="surface rounded-[2rem] p-8 text-center">
          <p className="font-serif text-3xl text-ink">
            New workshops are announced throughout the year.
          </p>
          <p className="mt-3 text-sm text-charcoal/75">
            Follow dojo updates or message the dojo about visiting class.
          </p>
        </div>
      )}
    </div>
  );
}
