import { facilities } from "../data/siteContent";

export function FacilityGrid() {
  return (
    <div className="grid grid-cols-2 gap-3 min-[420px]:gap-4 lg:grid-cols-5">
      {facilities.map((facility) => {
        const Icon = facility.icon;
        return (
          <article
            key={facility.title}
            className="surface card-hover rounded-[1.35rem] p-4 min-[420px]:p-5 sm:rounded-[1.75rem] lg:p-6"
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
  );
}
