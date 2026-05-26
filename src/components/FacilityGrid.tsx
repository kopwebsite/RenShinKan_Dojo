import { facilities } from "../data/siteContent";

export function FacilityGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {facilities.map((facility) => {
        const Icon = facility.icon;
        return (
          <article
            key={facility.title}
            className="surface card-hover rounded-[1.75rem] p-6"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-bamboo/10 text-bamboo">
              <Icon aria-hidden="true" size={22} />
            </div>
            <h3 className="mt-5 text-2xl text-ink">{facility.title}</h3>
            <p className="mt-3 text-sm text-charcoal/75">{facility.description}</p>
          </article>
        );
      })}
    </div>
  );
}
