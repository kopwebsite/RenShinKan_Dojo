import { useTranslation } from "../i18n";

export function ClassStructureLegend({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();

  return (
    <div className={`class-structure${compact ? " class-structure--compact" : ""}`}>
      <div className="class-structure__part class-structure__part--open">
        <span aria-hidden="true">60</span>
        <div>
          <p className="folio-mark">{t("classes.schedule.allLevelsTime")}</p>
          <h3>{t("classes.schedule.allLevelsTitle")}</h3>
          <p>{t("classes.schedule.allLevelsCopy")}</p>
        </div>
      </div>
      <div className="class-structure__part class-structure__part--advanced">
        <span aria-hidden="true">30</span>
        <div>
          <p className="folio-mark">{t("classes.schedule.advancedTime")}</p>
          <h3>{t("classes.schedule.advancedTitle")}</h3>
          <p>{t("classes.schedule.advancedCopy")}</p>
        </div>
      </div>
    </div>
  );
}
