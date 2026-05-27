import { ArrowUpRight, MapPin } from "lucide-react";
import { Link } from "react-router-dom";
import { NewsletterSignup } from "./NewsletterSignup";
import { googleMapsUrl, siteInfo, socialLinks } from "../data/siteContent";
import { useTranslation, type TranslationKey } from "../i18n";

const footerNavigation: Array<{ labelKey: TranslationKey; path: string }> = [
  { labelKey: "nav.home", path: "/" },
  { labelKey: "nav.ourDojo", path: "/#dojo" },
  { labelKey: "nav.classes", path: "/classes" },
  { labelKey: "nav.aikido", path: "/aikido" },
  { labelKey: "nav.community", path: "/community" },
  { labelKey: "nav.support", path: "/support" },
  { labelKey: "nav.contact", path: "/contact" },
];

export function Footer() {
  const { t } = useTranslation();

  return (
    <footer className="border-t border-ink/10 bg-charcoal/90 text-paper backdrop-blur-sm">
      <div className="container-shell grid gap-10 py-14 lg:grid-cols-[1.15fr_0.85fr_1fr]">
        <div>
          <p className="eyebrow text-mist/75">{t("common.brand")}</p>
          <h2 className="mt-3 max-w-md text-4xl leading-tight">
            {t("footer.tagline")}
          </h2>
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-5 flex max-w-md gap-3 rounded-2xl text-sm leading-6 text-paper/75 transition hover:text-paper focus-visible:outline-vermilion"
            aria-label={t("a11y.openAddressInMaps", { address: siteInfo.address })}
          >
            <MapPin className="mt-1 h-5 w-5 shrink-0 text-vermilion" aria-hidden="true" />
            <span>{siteInfo.address}</span>
          </a>
        </div>

        <nav aria-label={t("a11y.footerNavigation")}>
          <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-paper/60">
            {t("footer.explore")}
          </h3>
          <div className="mt-5 grid grid-cols-2 gap-3">
            {footerNavigation.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className="text-sm text-paper/75 transition hover:text-paper"
              >
                {t(item.labelKey)}
              </Link>
            ))}
          </div>
        </nav>

        <div>
          <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-paper/60">
            {t("footer.stayConnected")}
          </h3>
          <p className="mt-5 text-sm leading-6 text-paper/75">
            {t("footer.stayConnectedCopy")}
          </p>
          <Link to="/newsletter" className="btn-secondary mt-5 border-paper/20 bg-paper/10 text-paper hover:text-paper">
            {t("footer.updatesCta")}
          </Link>
          <div className="mt-7 flex flex-wrap gap-3">
            {socialLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-full border border-paper/15 px-4 py-2 text-xs font-bold text-paper/75 transition hover:border-vermilion/60 hover:text-paper"
              >
                {link.label}
                <ArrowUpRight size={14} aria-hidden="true" />
              </a>
            ))}
          </div>
        </div>
      </div>
      <div className="container-shell pb-12">
        <NewsletterSignup compact idPrefix="footer-newsletter" />
      </div>
    </footer>
  );
}
