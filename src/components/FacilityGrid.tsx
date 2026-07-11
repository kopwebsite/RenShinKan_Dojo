import { facilities } from "../data/siteContent";
import { useTranslation } from "../i18n";
import { facilityKeys, translateTitleDescription } from "../utils/siteContentTranslations";

export function FacilityGrid() {
  const { t } = useTranslation();
  const localizedFacilities = facilities.map((facility, index) =>
    translateTitleDescription(t, facility, facilityKeys[index]),
  );

  return (
    <ol className="facility-ledger">
      {localizedFacilities.map((facility, index) => {
        const Icon = facility.icon;
        return (
          <li key={facility.title}>
            <span className="facility-ledger__number">{String(index + 1).padStart(2, "0")}</span>
            <Icon aria-hidden="true" size={21} />
            <div>
              <h3>{facility.title}</h3>
              <p>{facility.description}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
