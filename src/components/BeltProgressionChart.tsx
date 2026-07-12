import { Printer } from "lucide-react";
import { beltLevels } from "../data/siteContent";
import { useTranslation } from "../i18n";
import { beltShortNames } from "../utils/beltVisual";
import { BeltMark } from "./BeltMark";

const stages = [
  { title: "Beginning", note: "Foundations, safe falling and clear posture", levels: beltLevels.slice(0, 4) },
  { title: "Developing", note: "A broader range of attacks, pins and movement", levels: beltLevels.slice(4, 8) },
  { title: "Advanced", note: "Free movement, weapons work and integrated practice", levels: beltLevels.slice(8) },
];

export function BeltProgressionChart() {
  const { t } = useTranslation();

  return (
    <div className="belt-path" aria-label={t("a11y.beltProgressionChart")}>
      <div className="belt-path__tools">
        <p>Minimum practice days are shown as guidance. The instructor decides when a student is ready to examine.</p>
        <button type="button" className="text-link" onClick={() => window.print()}><Printer size={16} /> Print progression</button>
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
                <details>
                  <summary>Technique requirements</summary>
                  <p>{level.techniques}</p>
                </details>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
