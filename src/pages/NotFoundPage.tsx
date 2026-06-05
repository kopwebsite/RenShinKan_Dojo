import { Home, Mail } from "lucide-react";
import { Link } from "react-router-dom";
import { MotionSection } from "../components/MotionSection";
import { useTranslation } from "../i18n";

export function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <MotionSection className="container-shell py-20">
      <div className="mx-auto max-w-3xl rounded-[2rem] bg-paper/80 p-7 text-center shadow-line ring-1 ring-ink/10 sm:p-10 lg:p-12">
        <p className="eyebrow">{t("notFound.eyebrow")}</p>
        <h1 className="mt-4 text-4xl leading-tight text-ink sm:text-5xl">
          {t("notFound.title")}
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-charcoal/75">
          {t("notFound.copy")}
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link to="/" className="btn-primary">
            <Home size={18} aria-hidden="true" />
            {t("notFound.homeCta")}
          </Link>
          <Link to="/contact" className="btn-secondary">
            <Mail size={18} aria-hidden="true" />
            {t("notFound.contactCta")}
          </Link>
        </div>
      </div>
    </MotionSection>
  );
}
