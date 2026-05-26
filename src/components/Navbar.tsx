import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { siteInfo } from "../data/siteContent";
import { BrushCircleLogo } from "./BrushCircleLogo";
import styles from "./Navbar.module.css";

type Language = "en" | "th";

const languageOptions: Record<Language, { label: string; flag: string }> = {
  en: { label: "English", flag: "🇬🇧" },
  th: { label: "Thai", flag: "🇹🇭" },
};

type DropdownLink = {
  label: string;
  to: string;
};

type DropdownNavItem = {
  id: string;
  label: string;
  to: string;
  dropdown: DropdownLink[];
};

type PlainNavItem = {
  id: string;
  label: string;
  to: string;
};

type NavItem = DropdownNavItem | PlainNavItem;

type NavbarProps = {
  currentPath: string;
  onLanguageChange?: (lang: Language) => void;
  defaultLanguage?: Language;
};

const dropdownNavItems: DropdownNavItem[] = [
  {
    id: "our-dojo",
    label: "Our Dojo",
    to: "/",
    dropdown: [
      { label: "Home", to: "/" },
      { label: "Instructors", to: "/#instructors" },
      { label: "Dojo Photos", to: "/#dojo-photos" },
      { label: "Dojo History", to: "/#dojo-history" },
      { label: "Location", to: "/#location" },
    ],
  },
  {
    id: "classes",
    label: "Classes",
    to: "/classes",
    dropdown: [
      { label: "Information", to: "/classes#information" },
      { label: "Class Schedule", to: "/classes#schedule" },
      { label: "First Visit Guide", to: "/classes#first-visit" },
      { label: "Belt Exams", to: "/classes#belt-exams" },
      { label: "Gallery", to: "/classes#gallery" },
      { label: "FAQ", to: "/classes#faq" },
    ],
  },
  {
    id: "aikido",
    label: "Aikido",
    to: "/aikido",
    dropdown: [
      { label: "What Is Aikido", to: "/aikido#what-is-aikido" },
      { label: "History of Aikido", to: "/aikido#history-philosophy" },
      { label: "O Sensei", to: "/aikido#o-sensei" },
    ],
  },
  {
    id: "community",
    label: "Community",
    to: "/community",
    dropdown: [
      { label: "Upcoming Events", to: "/community#upcoming-events" },
      { label: "Past Events", to: "/community#past-events" },
      { label: "Peace Culture Foundation", to: "/community#peace-culture" },
      { label: "Chiang Mai CMU", to: "/community#cmu-aikido" },
      { label: "Other Dojos", to: "/community#other-dojos" },
    ],
  },
  {
    id: "support",
    label: "Support",
    to: "/support",
    dropdown: [
      { label: "Monthly Contribution", to: "/support#monthly-contribution" },
      { label: "Donations", to: "/support#donations" },
    ],
  },
];

const navItems: NavItem[] = [
  ...dropdownNavItems,
  { id: "newsletter", label: "Newsletter", to: "/newsletter" },
  { id: "contact", label: "Contact Us", to: "/contact" },
];

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

  return (
    currentPathname === targetPathname &&
    (!targetHash || currentHash === targetHash)
  );
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

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.socialSvg}>
      <rect x="5" y="5" width="14" height="14" rx="4" />
      <circle cx="12" cy="12" r="3.2" />
      <path d="M16.4 7.7h.01" />
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

export function Navbar({
  currentPath,
  onLanguageChange,
  defaultLanguage = "en",
}: NavbarProps) {
  const [language, setLanguage] = useState<Language>(defaultLanguage);
  const [isScrolled, setIsScrolled] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [openAccordion, setOpenAccordion] = useState<string | null>(null);
  const hoverTimeoutRef = useRef<number | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setLanguage(defaultLanguage);
  }, [defaultLanguage]);

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

  const setActiveLanguage = (nextLanguage: Language) => {
    setLanguage(nextLanguage);
    onLanguageChange?.(nextLanguage);
  };

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

  const renderLanguageDropdown = (selectId: string) => (
    <div className={styles.languageDropdown}>
      <label htmlFor={selectId} className={styles.languageLabel}>
        Language
      </label>
      <div className={styles.languageSelectShell}>
        <span className={styles.languageFlag} aria-hidden="true">
          {languageOptions[language].flag}
        </span>
        <select
          id={selectId}
          className={styles.languageSelect}
          value={language}
          onChange={(event) => setActiveLanguage(event.target.value as Language)}
          aria-label="Language selection"
        >
          {Object.entries(languageOptions).map(([value, option]) => (
            <option key={value} value={value}>
              {option.label}
            </option>
          ))}
        </select>
        <svg
          viewBox="0 0 20 20"
          className={styles.languageCaret}
          aria-hidden="true"
        >
          <path d="M6 8l4 4 4-4" />
        </svg>
      </div>
    </div>
  );

  return (
    <>
      <header
        className={`${styles.header} ${isScrolled ? styles.headerScrolled : ""}`}
      >
        <div className={styles.headerInner}>
          <Link to="/" className={styles.logoLockup} aria-label="RenshinKan Dojo home">
            <BrushCircleLogo decorative className={styles.logoIcon} />
            <span className={styles.wordmark}>RenshinKan Dojo</span>
          </Link>

          <div className={styles.desktopCluster}>
            <nav className={styles.desktopNav} aria-label="Main navigation">
              {navItems.map((item) => {
                const isActive = isNavItemActive(item);

                if (!hasDropdown(item)) {
                  return (
                    <Link
                      key={item.id}
                      to={item.to}
                      className={styles.navLink}
                      data-active={isActive}
                    >
                      {item.label}
                    </Link>
                  );
                }

                const isOpen = activeDropdown === item.id;

                return (
                  <div
                    key={item.id}
                    className={styles.navDropdown}
                    onMouseEnter={() => handleDropdownMouseEnter(item.id)}
                    onMouseLeave={handleDropdownMouseLeave}
                    onFocus={() => {
                      clearHoverTimeout();
                      setActiveDropdown(item.id);
                    }}
                    onBlur={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget)) {
                        setActiveDropdown(null);
                      }
                    }}
                  >
                    <button
                      type="button"
                      className={styles.navLink}
                      data-active={isActive}
                      aria-expanded={isOpen}
                      aria-haspopup="true"
                      aria-controls={`desktop-${item.id}-dropdown`}
                      onClick={() => setActiveDropdown(item.id)}
                    >
                      {item.label}
                      <span className={styles.chevron} aria-hidden="true">
                        v
                      </span>
                    </button>

                    <AnimatePresence>
                      {isOpen ? (
                        <motion.div
                          id={`desktop-${item.id}-dropdown`}
                          className={styles.dropdownWrap}
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.15, ease: "easeOut" }}
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
                                {dropdownItem.label}
                              </Link>
                            ))}
                          </div>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </div>
                );
              })}
            </nav>

            <div className={styles.desktopActions}>
              {renderLanguageDropdown("desktop-site-language")}
            </div>
          </div>

          <button
            type="button"
            className={styles.mobileMenuButton}
            aria-label={isMobileOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={isMobileOpen}
            aria-controls="mobile-navigation-overlay"
            onClick={() => setIsMobileOpen((open) => !open)}
          >
            {isMobileOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </header>

      <AnimatePresence>
        {isMobileOpen ? (
          <motion.div
            id="mobile-navigation-overlay"
            ref={overlayRef}
            className={styles.mobileOverlay}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            role="dialog"
            aria-modal="true"
            aria-label="Mobile navigation"
          >
            <div className={styles.mobileOverlayTop}>
              <button
                ref={closeButtonRef}
                type="button"
                className={styles.mobileCloseButton}
                aria-label="Close navigation menu"
                onClick={() => setIsMobileOpen(false)}
              >
                <CloseIcon />
              </button>
            </div>

            <nav className={styles.mobileNav} aria-label="Main navigation">
              {navItems.map((item) => {
                if (!hasDropdown(item)) {
                  return (
                    <Link
                      key={item.id}
                      to={item.to}
                      className={styles.mobileNavLink}
                      data-active={isNavItemActive(item)}
                      onClick={() => setIsMobileOpen(false)}
                    >
                      {item.label}
                    </Link>
                  );
                }

                const isOpen = openAccordion === item.id;

                return (
                  <div key={item.id} className={styles.mobileAccordion}>
                    <button
                      type="button"
                      className={styles.mobileAccordionButton}
                      aria-expanded={isOpen}
                      aria-controls={`mobile-${item.id}-accordion`}
                      onClick={() => toggleAccordion(item.id)}
                      data-active={isNavItemActive(item)}
                    >
                      <span>{item.label}</span>
                      <span className={styles.mobileChevron} aria-hidden="true">
                        v
                      </span>
                    </button>

                    <AnimatePresence initial={false}>
                      {isOpen ? (
                        <motion.div
                          id={`mobile-${item.id}-accordion`}
                          className={styles.mobileSubnav}
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2, ease: "easeOut" }}
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
                                {dropdownItem.label}
                              </Link>
                            ))}
                          </div>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </div>
                );
              })}
              <div className={styles.mobileLanguageGroup}>
                {renderLanguageDropdown("mobile-site-language")}
              </div>
            </nav>

            <div className={styles.mobileBottom}>
              <div className={styles.socialRow} aria-label="Social links">
                <a
                  href="#instagram"
                  className={styles.socialLink}
                  aria-label="Instagram"
                  onClick={(event) => event.preventDefault()}
                >
                  <InstagramIcon />
                </a>
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
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
