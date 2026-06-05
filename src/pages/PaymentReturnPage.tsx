import { AlertTriangle, CheckCircle2, Mail, RotateCcw } from "lucide-react";
import { Link } from "react-router-dom";
import { MotionSection } from "../components/MotionSection";
import { siteInfo, socialLinks } from "../data/siteMeta";
import { useTranslation, type TranslationKey } from "../i18n";

type PaymentReturnContent = {
  icon: typeof CheckCircle2;
  eyebrowKey: TranslationKey;
  titleKey: TranslationKey;
  copyKey: TranslationKey;
  noteKey: TranslationKey;
  nextTitleKey: TranslationKey;
  nextItemKeys: TranslationKey[];
  tone: "success" | "warning";
};

const successContent: PaymentReturnContent = {
  icon: CheckCircle2,
  eyebrowKey: "support.paymentReturn.success.eyebrow",
  titleKey: "support.paymentReturn.success.title",
  copyKey: "support.paymentReturn.success.copy",
  noteKey: "support.paymentReturn.success.note",
  nextTitleKey: "support.paymentReturn.success.nextTitle",
  nextItemKeys: [
    "support.paymentReturn.success.nextItem1",
    "support.paymentReturn.success.nextItem2",
    "support.paymentReturn.success.nextItem3",
  ],
  tone: "success",
};

const incompleteContent: PaymentReturnContent = {
  icon: AlertTriangle,
  eyebrowKey: "support.paymentReturn.incomplete.eyebrow",
  titleKey: "support.paymentReturn.incomplete.title",
  copyKey: "support.paymentReturn.incomplete.copy",
  noteKey: "support.paymentReturn.incomplete.note",
  nextTitleKey: "support.paymentReturn.incomplete.nextTitle",
  nextItemKeys: [
    "support.paymentReturn.incomplete.nextItem1",
    "support.paymentReturn.incomplete.nextItem2",
    "support.paymentReturn.incomplete.nextItem3",
  ],
  tone: "warning",
};

export function PaymentSuccessPage() {
  return <PaymentReturnPage content={successContent} />;
}

export function PaymentIncompletePage() {
  return <PaymentReturnPage content={incompleteContent} />;
}

function PaymentReturnPage({ content }: { content: PaymentReturnContent }) {
  const { t } = useTranslation();
  const Icon = content.icon;
  const isSuccess = content.tone === "success";
  const facebookLink = socialLinks.find((link) => link.label === "Facebook")?.href ?? siteInfo.facebookUrl;

  return (
    <MotionSection className="container-shell py-20">
      <div className="mx-auto max-w-4xl">
        <div className="surface rounded-[2rem] p-7 sm:p-10 lg:p-12">
          <div
            className={`flex h-16 w-16 items-center justify-center rounded-full ${
              isSuccess ? "bg-bamboo/15 text-bamboo" : "bg-vermilion/10 text-vermilion"
            }`}
          >
            <Icon size={32} aria-hidden="true" />
          </div>

          <p className="eyebrow mt-7">{t(content.eyebrowKey)}</p>
          <h1 className="mt-3 max-w-3xl text-4xl leading-tight text-ink sm:text-5xl">
            {t(content.titleKey)}
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-charcoal/75">
            {t(content.copyKey)}
          </p>

          <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_0.85fr]">
            <div className="rounded-[1.5rem] border border-ink/10 bg-paper/60 p-5">
              <h2 className="text-2xl text-ink">{t(content.nextTitleKey)}</h2>
              <ul className="mt-4 grid gap-3">
                {content.nextItemKeys.map((itemKey) => (
                  <li key={itemKey} className="flex items-start gap-3 text-sm leading-6 text-charcoal/78">
                    <CheckCircle2
                      size={17}
                      className={`mt-1 shrink-0 ${isSuccess ? "text-bamboo" : "text-vermilion"}`}
                      aria-hidden="true"
                    />
                    <span>{t(itemKey)}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-[1.5rem] bg-ink/90 p-5 text-paper">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-mist/70">
                {t("support.paymentReturn.helpTitle")}
              </p>
              <p className="mt-3 text-sm leading-6 text-paper/85">
                {t(content.noteKey)}
              </p>
              <div className="mt-5 grid gap-3">
                <a
                  href={`mailto:${siteInfo.email}`}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-paper px-5 py-2.5 text-sm font-bold text-ink transition hover:bg-mist"
                >
                  <Mail size={17} aria-hidden="true" />
                  {t("support.paymentReturn.emailCta")}
                </a>
                <a
                  href={facebookLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-paper/30 px-5 py-2.5 text-sm font-bold text-paper transition hover:bg-paper/10"
                >
                  {t("support.paymentReturn.facebookCta")}
                </a>
              </div>
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link to="/support#monthly-contribution" className="btn-primary">
              <RotateCcw size={18} aria-hidden="true" />
              {t("support.paymentReturn.formCta")}
            </Link>
            <Link
              to="/support"
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-ink/15 bg-paper px-5 py-2.5 text-sm font-bold text-ink transition hover:border-vermilion/40 hover:bg-vermilion/5"
            >
              {t("support.paymentReturn.supportCta")}
            </Link>
          </div>
        </div>
      </div>
    </MotionSection>
  );
}
