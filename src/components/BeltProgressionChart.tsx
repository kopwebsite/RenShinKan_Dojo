import { Printer } from "lucide-react";
import { beltLevels } from "../data/siteContent";
import { useTranslation } from "../i18n";
import { beltShortNames } from "../utils/beltVisual";
import { BeltMark } from "./BeltMark";

export function BeltProgressionChart() {
  const { t } = useTranslation();
  const stages = [
    {
      title: t("classes.beltExams.progression.beginningTitle"),
      note: t("classes.beltExams.progression.beginningNote"),
      levels: beltLevels.slice(0, 4),
    },
    {
      title: t("classes.beltExams.progression.developingTitle"),
      note: t("classes.beltExams.progression.developingNote"),
      levels: beltLevels.slice(4, 8),
    },
    {
      title: t("classes.beltExams.progression.advancedTitle"),
      note: t("classes.beltExams.progression.advancedNote"),
      levels: beltLevels.slice(8),
    },
  ];

  return (
    <div className="belt-path" aria-label={t("a11y.beltProgressionChart")}>
      <div className="belt-path__tools">
        <p>{t("classes.beltExams.progression.guidance")}</p>
        <button type="button" className="text-link" onClick={() => window.print()}>
          <Printer size={16} /> {t("classes.beltExams.progression.print")}
        </button>
      </div>
      {stages.map((stage, stageIndex) => (
        <section key={stage.title} className="belt-stage">
          <header>
            <span>{String(stageIndex + 1).padStart(2, "0")}</span>
            <div><h3>{stage.title}</h3><p>{stage.note}</p></div>
          </header>
          <ol>
            {stage.levels.map((level) => (
              <li key={level.level}>
                <BeltMark beltKey={level.color} variant="swatch" decorative />
                <div className="belt-rank">
                  <strong>{level.level}</strong>
                  <span>{beltShortNames[level.color]} belt</span>
                  <span>{level.days} {t("common.days")}</span>
                </div>
                <div className="belt-requirements">
                  <h4>{t("classes.beltExams.progression.requirements")}</h4>
                  <p>{level.techniques}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
