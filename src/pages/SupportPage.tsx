import { ChevronDown, Heart, Repeat2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { ContributionForm } from "../components/ContributionForm";
import { MotionSection } from "../components/MotionSection";
import { ResponsiveImage } from "../components/ResponsiveImage";
import { useTranslation, type TranslationKey } from "../i18n";
import { assetPath } from "../utils/assetPath";

const dojoExpenses = [
  {
    labelKey: "support.expenses.utilities.label",
    noteKey: "support.expenses.utilities.note",
  },
  {
    labelKey: "support.expenses.mats.label",
    noteKey: "support.expenses.mats.note",
  },
  {
    labelKey: "support.expenses.building.label",
    noteKey: "support.expenses.building.note",
  },
  {
    labelKey: "support.expenses.equipment.label",
    noteKey: "support.expenses.equipment.note",
  },
  {
    labelKey: "support.expenses.safety.label",
    noteKey: "support.expenses.safety.note",
  },
  {
    labelKey: "support.expenses.events.label",
    noteKey: "support.expenses.events.note",
  },
  {
    labelKey: "support.expenses.garden.label",
    noteKey: "support.expenses.garden.note",
  },
  {
    labelKey: "support.expenses.welfare.label",
    noteKey: "support.expenses.welfare.note",
  },
  {
    labelKey: "support.expenses.admin.label",
    noteKey: "support.expenses.admin.note",
  },
] satisfies { labelKey: TranslationKey; noteKey: TranslationKey }[];

const contributionHighlights = [
  {
    valueKey: "support.highlights.dueDate.value",
    labelKey: "support.highlights.dueDate.label",
    noteKey: "support.highlights.dueDate.note",
  },
  {
    valueKey: "support.highlights.returned.value",
    labelKey: "support.highlights.returned.label",
    noteKey: "support.highlights.returned.note",
  },
  {
    valueKey: "support.highlights.shared.value",
    labelKey: "support.highlights.shared.label",
    noteKey: "support.highlights.shared.note",
  },
] satisfies { valueKey: TranslationKey; labelKey: TranslationKey; noteKey: TranslationKey }[];

const donationUseKeys = [
  "support.donations.uses.workshops",
  "support.donations.uses.equipment",
  "support.donations.uses.exams",
  "support.donations.uses.outreach",
  "support.donations.uses.access",
] satisfies TranslationKey[];

// Dojo bank / PromptPay details for direct transfers. Keep these in sync with
// BANK_DETAILS in src/components/ContributionForm.tsx ("Pay with PromptPay QR code").
const BANK_DETAILS = {
  promptPayId: "0969380064", // same as the dojo mobile number
  accountNumber: "232-2-86409-7",
  bankName: "Kasikorn Bank",
};

const PROMPTPAY_QR_IMAGE = "/images/promptpay-qr.png";

export function SupportPage() {
  const { t } = useTranslation();
  const [transferOpen, setTransferOpen] = useState(false);
  const localizedTransferDetails = [
    { label: t("support.transfer.accountName"), value: `${t("common.brand")} / Peace Culture Foundation` },
    { label: t("support.transfer.bank"), value: BANK_DETAILS.bankName },
    { label: t("support.transfer.accountNumber"), value: BANK_DETAILS.accountNumber },
    { label: t("support.transfer.promptPayId"), value: BANK_DETAILS.promptPayId },
    { label: t("support.transfer.reference"), value: "Mr. Pass Thummaprugsa" },
  ];

  return (
    <>
      <MotionSection className="container-shell py-20">
        <div className="grid items-center gap-10 lg:grid-cols-[1fr_0.85fr]">
          <div>
            <p className="eyebrow">{t("support.intro.eyebrow")}</p>
            <h1 className="section-title">{t("support.intro.title")}</h1>
            <p className="section-copy">
              {t("support.intro.copy")}
            </p>
          </div>
          <div className="flex items-center justify-center">
            <ResponsiveImage
              src={assetPath("/dojo-photos/image-community.webp")}
              alt={t("support.intro.imageAlt")}
              imgClassName="w-full max-w-md rounded-[2rem] object-cover"
              style={{ maskImage: "radial-gradient(ellipse 88% 88% at 50% 50%, black 55%, transparent 100%)", WebkitMaskImage: "radial-gradient(ellipse 88% 88% at 50% 50%, black 55%, transparent 100%)" }}
              loading="eager"
              width={1448}
              height={1086}
            />
          </div>
        </div>
      </MotionSection>

      <MotionSection id="monthly-contribution" className="container-shell scroll-mt-28 pb-20">
        <div className="mb-12 border-y border-ink/15 py-10">
          <div className="grid items-center gap-10 lg:grid-cols-[1fr_0.75fr]">
            <div>
              <div className="mb-6 flex items-center gap-3">
                <Repeat2 size={20} className="text-vermilion" aria-hidden="true" />
                <p className="eyebrow text-xs tracking-widest text-vermilion/80">{t("support.monthly.eyebrow")}</p>
              </div>
              <h2 className="max-w-2xl text-3xl leading-snug text-ink sm:text-4xl">
                {t("support.monthly.title")}
              </h2>
              <p className="mt-5 max-w-2xl text-base leading-7 text-charcoal/75">
                {t("support.monthly.copy1", { amount: t("support.monthly.amount") })}
              </p>
              <p className="mt-4 max-w-2xl text-base leading-7 text-charcoal/75">
                {t("support.monthly.copy2")}
              </p>
              <div className="mt-7 flex max-w-full items-start gap-3 border-l-2 border-vermilion/60 bg-vermilion/5 px-4 py-3 sm:inline-flex sm:items-center">
                <ShieldCheck size={18} className="shrink-0 text-vermilion" aria-hidden="true" />
                <p className="text-sm text-charcoal/70">
                  <span className="font-semibold text-ink">{t("support.monthly.noteStrong")}</span>{" "}
                  {t("support.monthly.note")}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-center">
              <div className="support-dojo-art" role="img" aria-label={t("support.monthly.supportImageAlt")}>
                <span className="support-dojo-art__sun" aria-hidden="true" />
                <span className="support-dojo-art__shoji" aria-hidden="true" />
                <span className="support-dojo-art__figure support-dojo-art__figure--one" aria-hidden="true"><i /><b /></span>
                <span className="support-dojo-art__figure support-dojo-art__figure--two" aria-hidden="true"><i /><b /></span>
                <span className="support-dojo-art__tatami" aria-hidden="true" />
                <span className="support-dojo-art__enso" aria-hidden="true">合</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
          {/* Warm, parent friendly monthly contribution form.
              All wording and the backend connection points live inside
              src/components/ContributionForm.tsx so it is easy to edit later. */}
          <ContributionForm />

          <article className="contribution-breakdown flex h-full flex-col">
            <header className="contribution-breakdown__intro">
              <h3 className="text-3xl text-ink">{t("support.monthly.coversTitle")}</h3>
              <p className="mt-4 text-sm leading-6 text-charcoal/75">
                {t("support.monthly.coversCopy")}
              </p>
            </header>

            <div className="contribution-highlights" role="list" aria-label={t("support.monthly.coversTitle")}>
              {contributionHighlights.map((item) => (
                <div className="contribution-highlight" role="listitem" key={item.labelKey}>
                  <strong className="contribution-highlight__value">{t(item.valueKey)}</strong>
                  <p className="contribution-highlight__label">{t(item.labelKey)}</p>
                  <p className="contribution-highlight__note">{t(item.noteKey)}</p>
                </div>
              ))}
            </div>

            <ul className="contribution-expenses">
              {dojoExpenses.map((expense, index) => (
                <li className="contribution-expense" key={expense.labelKey}>
                  <span className="contribution-expense__number" aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <p className="contribution-expense__label">{t(expense.labelKey)}</p>
                    <p className="contribution-expense__note">{t(expense.noteKey)}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="contribution-callouts">
              <div className="contribution-callout contribution-callout--why">
                <p className="contribution-callout__eyebrow">
                  {t("support.monthly.whyTitle")}
                </p>
                <p className="contribution-callout__copy">
                  {t("support.monthly.whyCopy")}
                </p>
              </div>
              <div className="contribution-callout contribution-callout--reminder">
                <p className="contribution-callout__eyebrow">{t("support.monthly.reminderEyebrow")}</p>
                <p className="contribution-callout__copy">
                  {t("support.monthly.reminderCopy")}
                </p>
              </div>
            </div>
          </article>
        </div>
      </MotionSection>

      <MotionSection id="donations" className="container-shell scroll-mt-28 pb-20">
        <div className="mb-10 max-w-3xl">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-vermilion/10 text-vermilion">
            <Heart size={26} aria-hidden="true" />
          </div>
          <p className="eyebrow mt-7">{t("support.donations.eyebrow")}</p>
          <h2 className="section-title">{t("support.donations.title")}</h2>
          <p className="section-copy">
            {t("support.donations.copy")}
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-[auto_1fr]">
          <div className="flex flex-col items-center gap-4">
            <div className="w-72 max-w-full rounded-[2rem] border border-ink/10 bg-paper p-3 shadow-soft">
              <img
                src={assetPath(PROMPTPAY_QR_IMAGE)}
                alt={t("support.donations.promptPayQrAlt")}
                className="aspect-square w-full rounded-[1.4rem] object-contain"
                width={720}
                height={720}
                loading="lazy"
                decoding="async"
              />
              <div className="px-3 pb-2 pt-4 text-center">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-charcoal/50">{t("support.donations.qrTitle")}</p>
                <p className="mt-2 text-xs text-charcoal/55">
                  {t("support.donations.qrCopy")}
                </p>
              </div>
            </div>
            <p className="max-w-[16rem] text-center text-xs text-charcoal/55">
              {t("support.donations.qrNote")}
            </p>
          </div>

          <div className="flex flex-col gap-8">
            <article className="border-t-4 border-double border-ink/35 pt-6">
              <h3 className="text-3xl text-ink">{t("support.donations.whereTitle")}</h3>
              <ul className="mt-5 grid gap-3">
                {donationUseKeys.map((itemKey) => (
                  <li key={itemKey} className="flex items-start gap-3 text-sm text-charcoal/80">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-vermilion" aria-hidden="true" />
                    {t(itemKey)}
                  </li>
                ))}
              </ul>
              <p className="mt-6 border-l-2 border-bamboo/70 bg-bamboo/5 py-3 pl-4 text-sm font-bold text-ink">
                {t("support.donations.noSalary")}
              </p>
            </article>

            <div className="border-y border-ink/15">
              <button
                type="button"
                className="flex min-h-14 w-full items-center justify-between gap-4 py-5 text-left"
                aria-expanded={transferOpen}
                onClick={() => setTransferOpen((open) => !open)}
              >
                <span className="font-bold text-ink">{t("support.donations.transfer")}</span>
                <ChevronDown
                  size={20}
                  className={`shrink-0 text-charcoal/50 transition ${transferOpen ? "rotate-180" : ""}`}
                  aria-hidden="true"
                />
              </button>
              {transferOpen && (
                <div className="border-t border-ink/10 pb-7 pt-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    {localizedTransferDetails.map((detail) => (
                      <div key={detail.label}>
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-charcoal/50">
                          {detail.label}
                        </p>
                        <p className="mt-1 font-bold text-ink">{detail.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </MotionSection>
    </>
  );
}
