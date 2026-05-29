import { MessageCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "../i18n";

export function FloatingFirstVisit() {
  const { t } = useTranslation();

  return (
    <Link
      to="/contact"
      className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-4 right-4 z-40 inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-vermilion px-4 py-3 text-center text-sm font-bold leading-tight text-paper shadow-soft transition hover:-translate-y-0.5 sm:left-auto md:hidden"
    >
      <MessageCircle size={18} aria-hidden="true" />
      {t("nav.firstVisitGuide")}
    </Link>
  );
}
