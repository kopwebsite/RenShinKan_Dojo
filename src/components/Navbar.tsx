import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { siteInfo } from "../data/siteMeta";
import { languageOptions, useTranslation, type Language, type TranslationKey } from "../i18n";
import { BrushCircleLogo } from "./BrushCircleLogo";
import styles from "./Navbar.module.css";

type DropdownLink = {
  labelKey: TranslationKey;
  to: string;
};

type DropdownNavItem = {
  id: string;
  labelKey: TranslationKey;
  to: string;
  dropdown: DropdownLink[];
};

type PlainNavItem = {
  id: string;
  labelKey: TranslationKey;
  to: string;
};

type NavItem = DropdownNavItem | PlainNavItem;

type NavbarProps = {
  currentPath: string;
};

const dropdownNavItems: DropdownNavItem[] = [
  {
    id: "our-dojo",
    labelKey: "nav.ourDojo",
    to: "/",
    dropdown: [
      { labelKey: "nav.home", to: "/" },
      { labelKey: "nav.instructors", to: "/#instructors" },
      { labelKey: "nav.dojoPhotos", to: "/#dojo-photos" },
      { labelKey: "nav.dojoHistory", to: "/#dojo-history" },
      { labelKey: "nav.location", to: "/#location" },
    ],
  },
  {
    id: "classes",
    labelKey: "nav.classes",
    to: "/classes",
    dropdown: [
      { labelKey: "nav.information", to: "/classes#information" },
      { labelKey: "nav.classSchedule", to: "/classes#schedule" },
      { labelKey: "nav.firstVisitGuide", to: "/classes#first-visit" },
      { labelKey: "nav.beltExams", to: "/classes#belt-exams" },
      { labelKey: "nav.gallery", to: "/classes#gallery" },
      { labelKey: "nav.faq", to: "/classes#faq" },
    ],
  },
  {
    id: "aikido",
    labelKey: "nav.aikido",
    to: "/aikido",
    dropdown: [
      { labelKey: "nav.whatIsAikido", to: "/aikido#what-is-aikido" },
      { labelKey: "nav.historyOfAikido", to: "/aikido#history-philosophy" },
      { labelKey: "nav.oSensei", to: "/aikido#o-sensei" },
    ],
  },
  {
    id: "community",
    labelKey: "nav.community",
    to: "/community",
    dropdown: [
      { labelKey: "nav.upcomingEvents", to: "/community#upcoming-events" },
      { labelKey: "nav.pastEvents", to: "/community#past-events" },
      { labelKey: "nav.peaceCultureFoundation", to: "/community#peace-culture" },
      { labelKey: "nav.chiangMaiCmu", to: "/community#cmu-aikido" },
    ],
  },
];

const supportNavItem: DropdownNavItem = {
  id: "support",
  labelKey: "nav.support",
  to: "/support",
  dropdown: [
    { labelKey: "nav.monthlyContribution", to: "/support#monthly-contribution" },
    { labelKey: "nav.donations", to: "/support#donations" },
  ],
};

const navItems: NavItem[] = [
  ...dropdownNavItems,
  { id: "newsletter", labelKey: "nav.newsletter", to: "/newsletter" },
  { id: "contact", labelKey: "nav.contact", to: "/contact" },
  supportNavItem,
];

const languageFlagClassByCode: Record<Language, string> = {
  en: styles.languageFlagEN,
  th: styles.languageFlagTH,
  "zh-CN": styles.languageFlagZH,
  ja: styles.languageFlagJA,
};

const languageLabelKeyByCode: Record<Language, TranslationKey> = {
  en: "language.en",
  th: "language.th",
  "zh-CN": "language.zhCN",
  ja: "language.ja",
};

function hasDropdown(item: NavItem): item is DropdownNavItem {
  return "dropdown" in item;
}

function normalizePath(path: string) {
  if (!path) {
    return "/";
  }

  return path.endsWith("/") && path.length > 1 ? path.slice(0, -1) : path;
}

function pathMatches(currentPath: string, target: string) {
  const [currentPathname, currentHash = ""] = normalizePath(currentPath).split("#");
  const [targetPathname, targetHash = ""] = normalizePath(target).split("#");

  return currentPathname === targetPathname && (!targetHash || currentHash === targetHash);
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.iconSvg}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.iconSvg}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.socialSvg}>
      <path d="M14 8.2h2.2V5.1A11 11 0 0 0 13.1 5c-3 0-5 1.8-5 5.1v2.8H5v3.5h3.1V24h3.8v-7.6H15l.5-3.5h-3.6v-2.4c0-1 .3-2.3 2.1-2.3Z" />
    </svg>
  );
}

function LanguageSelector({ mobile = false }: { mobile?: boolean }) {
  const { language, setLanguage, t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const selectorRef = useRef<HTMLDivElement>(null);
  const selectedOption =
    languageOptions.find((option) => option.code === language) ?? languageOptions[0];
  const menuId = mobile ? "mobile-language-menu" : "desktop-language-menu";

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (
        selectorRef.current &&
        event.target instanceof Node &&
        !selectorRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleSelectLanguage = (nextLanguage: typeof language) => {
    setLanguage(nextLanguage);
    setIsOpen(false);
  };

  return (
    <div
      ref={selectorRef}
      className={mobile ? styles.mobileLanguageSwitcher : styles.languageSwitcher}
      data-open={isOpen}
      aria-label={t("a11y.languageSelector")}
    >
      <button
        type="button"
        className={styles.languageTrigger}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={menuId}
        aria-label={t("a11y.currentLanguage", {
          language: t(languageLabelKeyByCode[selectedOption.code]),
        })}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span
          className={`${styles.languageFlag} ${languageFlagClassByCode[selectedOption.code]}`}
          aria-hidden="true"
        />
        <span className={styles.languageCurrent}>
          {mobile ? selectedOption.nativeLabel : selectedOption.shortLabel}
        </span>
        <ChevronDown className={styles.languageChevron} aria-hidden="true" />
      </button>
      {isOpen ? (
        <div
            id={menuId}
            className={styles.languageMenu}
            role="menu"
            aria-label={t("a11y.chooseLanguage")}
          >
            <div className={styles.languageMenuPanel}>
              {languageOptions.map((option) => (
                <button
                  key={option.code}
                  type="button"
                  className={styles.languageOption}
                  data-active={language === option.code}
                  role="menuitemradio"
                  aria-checked={language === option.code}
                  onClick={() => handleSelectLanguage(option.code)}
                >
                  <span className={styles.languageOptionText}>{option.nativeLabel}</span>
                  <span
                    className={`${styles.languageOptionFlag} ${languageFlagClassByCode[option.code]}`}
                    aria-hidden="true"
                  />
                </button>
              ))}
            </div>
        </div>
      ) : null}
    </div>
  );
}

export function Navbar({ currentPath }: NavbarProps) {
  const { t } = useTranslation();
  const [isScrolled, setIsScrolled] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [openAccordion, setOpenAccordion] = useState<string | null>(null);
  const hoverTimeoutRef = useRef<number | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const isAdmin = currentPath.split("#")[0].startsWith("/admin");

  useEffect(() => {
    setIsMobileOpen(false);
    setActiveDropdown(null);
    setOpenAccordion(null);
  }, [currentPath]);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 40);

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveDropdown(null);
        setIsMobileOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!isMobileOpen) {
      document.body.style.overflow = "";
      previouslyFocusedElementRef.current?.focus();
      return undefined;
    }

    previouslyFocusedElementRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    const handleFocusTrap = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !overlayRef.current) {
        return;
      }

      const focusableElements = overlayRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (!firstElement || !lastElement) {
        return;
      }

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener("keydown", handleFocusTrap);

    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleFocusTrap);
    };
  }, [isMobileOpen]);

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        window.clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  const isNavItemActive = (item: NavItem) => {
    if (pathMatches(currentPath, item.to)) {
      return true;
    }

    return hasDropdown(item)
      ? item.dropdown.some((dropdownItem) => pathMatches(currentPath, dropdownItem.to))
      : false;
  };

  const clearHoverTimeout = () => {
    if (hoverTimeoutRef.current) {
      window.clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  };

  const handleDropdownMouseEnter = (itemId: string) => {
    clearHoverTimeout();
    hoverTimeoutRef.current = window.setTimeout(() => {
      setActiveDropdown(itemId);
    }, 150);
  };

  const handleDropdownMouseLeave = () => {
    clearHoverTimeout();
    setActiveDropdown(null);
  };

  const toggleAccordion = (itemId: string) => {
    setOpenAccordion((current) => (current === itemId ? null : itemId));
  };

  if (isAdmin) {
    return (
      <header className={`${styles.header} ${styles.adminHeader} ${isScrolled ? styles.headerScrolled : ""}`}>
        <div className={styles.headerInner}>
          <Link to="/" className={styles.logoLockup} aria-label={`${t("common.brand")} home`}>
            <BrushCircleLogo decorative className={styles.logoIcon} />
            <span className={styles.wordmark}>{t("common.brand")} <span className={styles.adminMark}>/ Admin</span></span>
          </Link>
          <nav className={styles.adminNav} aria-label="Admin navigation">
            <Link to="/">Public website</Link>
            <Link to="/admin">Admin home</Link>
            <Link to="/admin/students">Students</Link>
          </nav>
        </div>
      </header>
    );
  }

  return (
    <>
      <header className={`${styles.header} ${isScrolled ? styles.headerScrolled : ""}`}>
        <div className={styles.headerInner}>
          <Link
            to="/"
            className={styles.logoLockup}
            aria-label={`${t("common.brand")} ${t("nav.home")}`}
          >
            <BrushCircleLogo decorative className={styles.logoIcon} />
            <span className={styles.wordmark}>{t("common.brand")}</span>
          </Link>

          <div className={styles.desktopCluster}>
            <nav className={styles.desktopNav} aria-label={t("a11y.mainNavigation")}>
              {dropdownNavItems.map((item) => {
                const isActive = isNavItemActive(item);
                const itemLabel = t(item.labelKey);
                const isOpen = activeDropdown === item.id;

                return (
                  <div
                    key={item.id}
                    className={styles.navDropdown}
                    onMouseEnter={() => handleDropdownMouseEnter(item.id)}
                    onMouseLeave={handleDropdownMouseLeave}
                    onBlur={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget)) {
                        setActiveDropdown(null);
                      }
                    }}
                  >
                    <div className={styles.navSplit} data-active={isActive}>
                      <Link to={item.to} className={styles.navLink} data-active={isActive}>
                        {itemLabel}
                      </Link>
                      <button
                        type="button"
                        className={styles.navChevronButton}
                        aria-expanded={isOpen}
                        aria-haspopup="menu"
                        aria-controls={`desktop-${item.id}-dropdown`}
                        aria-label={t(isOpen ? "a11y.collapseMenu" : "a11y.expandMenu", { label: itemLabel })}
                        onClick={() => setActiveDropdown((current) => current === item.id ? null : item.id)}
                      >
                        <ChevronDown className={styles.chevron} aria-hidden="true" />
                      </button>
                    </div>

                    {isOpen ? (
                      <div
                          id={`desktop-${item.id}-dropdown`}
                          className={styles.dropdownWrap}
                        >
                          <div className={styles.dropdownPanel}>
                            {item.dropdown.map((dropdownItem) => (
                              <Link
                                key={dropdownItem.to}
                                to={dropdownItem.to}
                                className={styles.dropdownItem}
                                data-active={pathMatches(currentPath, dropdownItem.to)}
                                onClick={() => setActiveDropdown(null)}
                              >
                                {t(dropdownItem.labelKey)}
                              </Link>
                            ))}
                          </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </nav>
            <div className={styles.desktopUtility}>
              <Link to="/newsletter" className={styles.utilityLink} data-active={pathMatches(currentPath, "/newsletter")}>
                {t("nav.newsletter")}
              </Link>
              <Link to="/contact" className={styles.utilityLink} data-active={pathMatches(currentPath, "/contact")}>
                {t("nav.contact")}
              </Link>
              <div
                className={`${styles.navDropdown} ${styles.supportDropdown}`}
                onMouseEnter={() => handleDropdownMouseEnter(supportNavItem.id)}
                onMouseLeave={handleDropdownMouseLeave}
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) setActiveDropdown(null);
                }}
              >
                <div className={`${styles.navSplit} ${styles.supportSplit}`} data-active={isNavItemActive(supportNavItem)}>
                  <Link to={supportNavItem.to} className={styles.supportNavLink} data-active={isNavItemActive(supportNavItem)}>
                    {t(supportNavItem.labelKey)}
                  </Link>
                  <button
                    type="button"
                    className={styles.supportChevronButton}
                    aria-expanded={activeDropdown === supportNavItem.id}
                    aria-haspopup="menu"
                    aria-controls="desktop-support-dropdown"
                    aria-label={t(activeDropdown === supportNavItem.id ? "a11y.collapseMenu" : "a11y.expandMenu", { label: t(supportNavItem.labelKey) })}
                    onClick={() => setActiveDropdown((current) => current === supportNavItem.id ? null : supportNavItem.id)}
                  >
                    <ChevronDown className={styles.chevron} aria-hidden="true" />
                  </button>
                </div>
                {activeDropdown === supportNavItem.id ? (
                  <div id="desktop-support-dropdown" className={`${styles.dropdownWrap} ${styles.dropdownWrapRight}`}>
                    <div className={styles.dropdownPanel}>
                      {supportNavItem.dropdown.map((dropdownItem) => (
                        <Link
                          key={dropdownItem.to}
                          to={dropdownItem.to}
                          className={styles.dropdownItem}
                          data-active={pathMatches(currentPath, dropdownItem.to)}
                          onClick={() => setActiveDropdown(null)}
                        >
                          {t(dropdownItem.labelKey)}
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
              <LanguageSelector />
            </div>
          </div>

          <button
            type="button"
            className={styles.mobileMenuButton}
            aria-label={isMobileOpen ? t("a11y.closeNavigationMenu") : t("a11y.openNavigationMenu")}
            aria-expanded={isMobileOpen}
            aria-controls="mobile-navigation-overlay"
            onClick={() => setIsMobileOpen((open) => !open)}
          >
            {isMobileOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </header>

      {isMobileOpen ? (
        <div
            id="mobile-navigation-overlay"
            ref={overlayRef}
            className={styles.mobileOverlay}
            role="dialog"
            aria-modal="true"
            aria-label={t("a11y.mobileNavigation")}
          >
            <div className={styles.mobileOverlayTop}>
              <Link to="/" className={styles.mobileOverlayBrand} onClick={() => setIsMobileOpen(false)}>
                <BrushCircleLogo decorative className={styles.mobileOverlayLogo} />
                <span>{t("common.brand")}</span>
              </Link>
              <button
                ref={closeButtonRef}
                type="button"
                className={styles.mobileCloseButton}
                aria-label={t("a11y.closeNavigationMenu")}
                onClick={() => setIsMobileOpen(false)}
              >
                <CloseIcon />
              </button>
            </div>

            <nav className={styles.mobileNav} aria-label={t("a11y.mobileNavigation")}>
              {navItems.map((item) => {
                const itemLabel = t(item.labelKey);

                if (!hasDropdown(item)) {
                  return (
                    <Link
                      key={item.id}
                      to={item.to}
                      className={`${styles.mobileNavLink} ${item.id === "support" ? styles.mobileSupportNavLink : ""}`}
                      data-active={isNavItemActive(item)}
                      onClick={() => setIsMobileOpen(false)}
                    >
                      {itemLabel}
                    </Link>
                  );
                }

                const isOpen = openAccordion === item.id;

                return (
                  <div key={item.id} className={styles.mobileAccordion}>
                    <div
                      className={`${styles.mobileAccordionButton} ${
                        item.id === "support" ? styles.mobileSupportAccordion : ""
                      }`}
                      data-active={isNavItemActive(item)}
                    >
                      <Link
                        to={item.to}
                        className={styles.mobileAccordionLabel}
                        onClick={() => setIsMobileOpen(false)}
                      >
                        {itemLabel}
                      </Link>
                      <button
                        type="button"
                        className={styles.mobileChevronButton}
                        aria-expanded={isOpen}
                        aria-controls={`mobile-${item.id}-accordion`}
                        aria-label={t(isOpen ? "a11y.collapseMenu" : "a11y.expandMenu", {
                          label: itemLabel,
                        })}
                        onClick={() => toggleAccordion(item.id)}
                      >
                        <span className={styles.mobileChevron} aria-hidden="true">
                          v
                        </span>
                      </button>
                    </div>

                    {isOpen ? (
                      <div
                          id={`mobile-${item.id}-accordion`}
                          className={styles.mobileSubnav}
                        >
                          <div className={styles.mobileSubnavInner}>
                            {item.dropdown.map((dropdownItem) => (
                              <Link
                                key={dropdownItem.to}
                                to={dropdownItem.to}
                                className={styles.mobileSubnavLink}
                                data-active={pathMatches(currentPath, dropdownItem.to)}
                                onClick={() => setIsMobileOpen(false)}
                              >
                                {t(dropdownItem.labelKey)}
                              </Link>
                            ))}
                          </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
              <div className={styles.mobileLanguageBlock}>
                <LanguageSelector mobile />
              </div>
            </nav>

            <div className={styles.mobileBottom}>
              <div className={styles.socialRow} aria-label={t("a11y.socialLinks")}>
                <a
                  href={siteInfo.facebookUrl}
                  className={styles.socialLink}
                  aria-label="Facebook"
                  target="_blank"
                  rel="noreferrer"
                >
                  <FacebookIcon />
                </a>
              </div>
            </div>
        </div>
      ) : null}
    </>
  );
}
