import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { useTranslation, type TranslationKey } from "../i18n";

const faqItems = [
  "experience",
  "age",
  "childrenSafety",
  "parentsWatch",
  "beginnerClothes",
  "competition",
  "falling",
  "busySchedule",
  "monthlyFee",
  "firstVisit",
] as const;

const faqTranslations = faqItems.map((item) => ({
  id: item,
  questionKey: `classes.faq.items.${item}.question`,
  answerKey: `classes.faq.items.${item}.answer`,
})) satisfies Array<{ id: string; questionKey: TranslationKey; answerKey: TranslationKey }>;

export function FAQAccordion() {
  const { t } = useTranslation();
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <div className="grid gap-3">
      {faqTranslations.map((faq, index) => {
        const isOpen = openIndex === index;
        const panelId = `faq-panel-${index}`;
        const buttonId = `faq-button-${index}`;

        return (
          <article key={faq.id} className="surface rounded-[1.5rem]">
            <h3>
              <button
                id={buttonId}
                type="button"
                className="flex min-h-14 w-full items-center justify-between gap-4 rounded-[1.5rem] px-4 py-4 text-left font-bold text-ink sm:px-5"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpenIndex(isOpen ? -1 : index)}
              >
                <span>{t(faq.questionKey)}</span>
                <ChevronDown
                  className={`h-5 w-5 shrink-0 transition ${isOpen ? "rotate-180" : ""}`}
                  aria-hidden="true"
                />
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              hidden={!isOpen}
              className="px-5 pb-5 text-sm text-charcoal/78"
            >
              {t(faq.answerKey)}
            </div>
          </article>
        );
      })}
    </div>
  );
}
