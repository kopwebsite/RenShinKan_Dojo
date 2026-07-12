import { CalendarDays, Filter } from "lucide-react";
import { useState } from "react";
import { workshops } from "../data/siteContent";
import { useTranslation, type TranslationKey } from "../i18n";
import { translateWorkshop, workshopKeys } from "../utils/siteContentTranslations";

const filterOptions = ["All", "Beginner", "Children", "Weapons"] as const;
type WorkshopFilter = (typeof filterOptions)[number];

const filterLabelKeys: Record<WorkshopFilter, TranslationKey> = {
  All: "workshops.filters.all",
  Beginner: "workshops.filters.beginner",
  Children: "workshops.filters.children",
  Weapons: "workshops.filters.weapons",
};

export function WorkshopCards() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<WorkshopFilter>("All");
  const localizedWorkshops = workshops.map((workshop, index) =>
    translateWorkshop(t, workshop, workshopKeys[index]),
  );
  const visibleWorkshops = localizedWorkshops.filter(
    (workshop) => filter === "All" || workshop.category === filter,
  );

  return (
    <div className="workshop-index">
      <div className="workshop-index__filters" aria-label={t("workshops.filters.label")}>
        {filterOptions.map((option) => (
          <button
            key={option}
            type="button"
            className="workshop-index__filter"
            data-active={filter === option}
            aria-pressed={filter === option}
            onClick={() => setFilter(option)}
          >
            <Filter size={15} aria-hidden="true" />
            {t(filterLabelKeys[option])}
          </button>
        ))}
      </div>

      {visibleWorkshops.length > 0 ? (
        <ol className="workshop-index__list">
          {visibleWorkshops.map((workshop, index) => (
            <li
              key={workshop.title}
              className="workshop-entry"
            >
              <div className="workshop-entry__number" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </div>
              <div className="workshop-entry__copy">
                <p className="folio-mark">{t(filterLabelKeys[workshop.category])}</p>
                <h3>{workshop.title}</h3>
                <p>{workshop.description}</p>
              </div>
              <dl className="workshop-entry__details">
                <div>
                  <CalendarDays aria-hidden="true" />
                  <div>
                    <dt className="sr-only">{t("common.dateAndTime")}</dt>
                    <dd>{workshop.date} - {workshop.time}</dd>
                  </div>
                </div>
                <div>
                  <dt>{t("common.for")}</dt>
                  <dd>{workshop.audience}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ol>
      ) : (
        <div className="workshop-index__empty">
          <p>{t("workshops.empty.title")}</p>
          <small>{t("workshops.empty.copy")}</small>
        </div>
      )}
    </div>
  );
}
