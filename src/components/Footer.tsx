import { ArrowUpRight, MapPin } from "lucide-react";
import { Link } from "react-router-dom";
import { googleMapsUrl, siteInfo, socialLinks } from "../data/siteMeta";
import { useTranslation, type TranslationKey } from "../i18n";
import { recordsCopy } from "../data/recordsCopy";

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
  const { t, language } = useTranslation();

  return (
    <footer className="site-footer">
      <div className="container-shell site-footer__grid">
        <div className="site-footer__brand">
          <p className="eyebrow">{t("common.brand")}</p>
          <h2>
            {t("footer.tagline")}
          </h2>
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noreferrer"
            className="site-footer__address"
            aria-label={t("a11y.openAddressInMaps", { address: siteInfo.address })}
          >
            <MapPin className="mt-1 h-5 w-5 shrink-0 text-vermilion" aria-hidden="true" />
            <span>{siteInfo.address}</span>
          </a>
        </div>

        <nav className="site-footer__nav" aria-label={t("a11y.footerNavigation")}>
          <h3>
            {t("footer.explore")}
          </h3>
          <div>
            {footerNavigation.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className="site-footer__link"
              >
                {t(item.labelKey)}
              </Link>
            ))}
            <Link to="/student-records" className="site-footer__link">
              {recordsCopy[language].eyebrow}
            </Link>
          </div>
        </nav>

        <div className="site-footer__connect">
          <h3>
            {t("footer.stayConnected")}
          </h3>
          <p>
            {t("footer.stayConnectedCopy")}
          </p>
          <Link to="/newsletter#newsletter-signup" className="btn-secondary site-footer__cta">
            {t("footer.updatesCta")}
          </Link>
          <div className="site-footer__socials">
            {socialLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="site-footer__social"
              >
                {link.label}
                <ArrowUpRight size={14} aria-hidden="true" />
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
