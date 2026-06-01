import { aikidoTimeline } from "../data/siteContent";

export function Timeline() {
  return (
    <ol className="relative grid gap-3 border-l border-ink/15 pl-5">
      {aikidoTimeline.map((item) => (
        <li key={`${item.year}-${item.title}`} className="relative">
          <span
            className="absolute -left-[26px] top-5 h-3 w-3 rounded-full bg-bamboo/45 ring-4 ring-paper"
            aria-hidden="true"
          />
          <div className="block rounded-2xl px-4 py-3">
            <p className="text-sm font-bold text-bamboo">{item.year}</p>
            <h3 className="mt-1 text-2xl text-ink">{item.title}</h3>
            <p className="mt-2 text-sm text-charcoal/75">{item.description}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
