import { Facebook } from "lucide-react";
import { LocationCard } from "../components/LocationCard";
import { MotionSection } from "../components/MotionSection";
import { siteInfo } from "../data/siteContent";
import { useTranslation, type TranslationKey } from "../i18n";

export function ContactPage() {
  const { t } = useTranslation();
  const visitItems: TranslationKey[] = [
    "contact.before.item1",
    "contact.before.item2",
    "contact.before.item3",
    "contact.before.item4",
  ];

  return (
    <>
      <MotionSection id="visit" className="container-shell scroll-mt-28 py-20">
        <p className="eyebrow">{t("contact.intro.eyebrow")}</p>
        <h1 className="section-title">{t("contact.intro.title")}</h1>
        <p className="section-copy">
          {t("contact.intro.copy", { address: siteInfo.address })}
        </p>
      </MotionSection>

      <MotionSection id="location" className="container-shell scroll-mt-28 pb-20">
        <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
          <LocationCard />
          <div className="grid gap-6">
            <article className="surface rounded-[2rem] p-6 sm:p-8">
              <p className="eyebrow">{t("contact.message.eyebrow")}</p>
              <h2 className="mt-3 text-4xl text-ink">{t("contact.message.title")}</h2>
              <p className="mt-4 text-charcoal/80 leading-7">
                {t("contact.message.copy")}
              </p>
              <a
                href={siteInfo.facebookUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary mt-6 inline-flex"
              >
                <Facebook size={18} aria-hidden="true" />
                {t("common.messageUsFacebook")}
              </a>
            </article>

            <article className="surface rounded-[2rem] p-6 sm:p-8">
              <p className="eyebrow">{t("contact.before.eyebrow")}</p>
              <h2 className="mt-3 text-4xl text-ink">{t("contact.before.title")}</h2>
              <p className="mt-4 leading-7 text-charcoal/80">
                {t("contact.before.copy")}
              </p>
              <ul className="mt-6 grid gap-3 text-sm text-charcoal/78">
                {visitItems.map((itemKey) => (
                  <li key={itemKey} className="flex items-start gap-3">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-vermilion" aria-hidden="true" />
                    {t(itemKey)}
                  </li>
                ))}
              </ul>
              <a
                href={siteInfo.facebookUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary mt-6 inline-flex"
              >
                <Facebook size={18} aria-hidden="true" />
                {t("contact.before.cta")}
              </a>
            </article>
          </div>
        </div>
      </MotionSection>
    </>
  );
}
