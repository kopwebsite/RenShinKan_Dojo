import { ChevronDown } from "lucide-react";
import { useTranslation, type TranslationKey } from "../i18n";

const groups = [
  { label: "New students", items: ["experience", "age", "beginnerClothes", "firstVisit"] },
  { label: "Parents & safety", items: ["childrenSafety", "parentsWatch", "falling"] },
  { label: "Practice & attendance", items: ["competition", "busySchedule", "monthlyFee"] },
] as const;

export function FAQAccordion() {
  const { t } = useTranslation();

  return (
    <div className="faq-index">
      {groups.map((group) => (
        <section key={group.label} aria-labelledby={`faq-${group.label.replace(/\W+/g, "-").toLowerCase()}`}>
          <h3 id={`faq-${group.label.replace(/\W+/g, "-").toLowerCase()}`}>{group.label}</h3>
          <div>
            {group.items.map((item) => (
              <details key={item}>
                <summary>
                  <span>{t(`classes.faq.items.${item}.question` as TranslationKey)}</span>
                  <ChevronDown size={18} aria-hidden="true" />
                </summary>
                <p>{t(`classes.faq.items.${item}.answer` as TranslationKey)}</p>
              </details>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
