import {
  BookOpen,
  Building2,
  CircleHelp,
  Check,
  ChevronDown,
  ClipboardCheck,
  Database,
  ExternalLink,
  FileImage,
  FileText,
  GraduationCap,
  History,
  Home,
  LogOut,
  Languages,
  Menu,
  ReceiptText,
  Settings,
  Users,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
  type RefObject,
} from "react";
import { Link, useLocation } from "react-router-dom";
import { useAdminTranslation, type TranslationKey } from "../../i18n";
import { useScopedAdminTranslations } from "../../i18n/scopedAdmin";
import { useAdminSession } from "./useAdminSession";

type NavigationItem = {
  label: string;
  href: string;
  Icon: ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
  centralOnly?: boolean;
  match?: (pathname: string, search: string, hash: string) => boolean;
};

type NavigationGroup = {
  label: string;
  items: NavigationItem[];
};

type Translate = (key: TranslationKey) => string;

function useModalFocus(
  open: boolean,
  panelRef: RefObject<HTMLElement | null>,
  triggerRef: RefObject<HTMLElement | null>,
  close: () => void,
) {
  useEffect(() => {
    if (!open || !panelRef.current) return;
    const panel = panelRef.current;
    const previousOverflow = document.body.style.overflow;
    const focusable = () => [...panel.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )].filter((element) => !element.hasAttribute("hidden"));
    const first = focusable()[0];
    first?.focus();
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    }

    panel.addEventListener("keydown", onKeyDown);
    return () => {
      panel.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      triggerRef.current?.focus();
    };
  }, [close, open, panelRef, triggerRef]);
}

function navigationGroups(t: Translate): NavigationGroup[] {
  return [
    {
      label: t("adminShell.overview"),
      items: [
        { label: "Choose or switch dojo", href: "/admin", Icon: Home, match: (path) => path === "/admin" },
      ],
    },
    {
      label: t("adminShell.students"),
      items: [
        {
          label: t("adminShell.studentDatabase"),
          href: "/admin/students",
          Icon: Database,
          match: (path) => path === "/admin/students",
        },
        {
          label: t("adminShell.profileRequests"),
          href: "/admin/profile-requests",
          Icon: Users,
        },
        {
          label: "Training hour requests",
          href: "/admin/training-requests",
          Icon: History,
        },
      ],
    },
    {
      label: t("adminShell.examinations"),
      items: [
        {
          label: t("adminShell.examApplications"),
          href: "/admin/exam-applications",
          Icon: ClipboardCheck,
        },
        {
          label: t("adminShell.examinationRecords"),
          href: "/admin/examination-records",
          Icon: GraduationCap,
        },
      ],
    },
    {
      label: t("adminShell.payments"),
      items: [
        {
          label: t("adminShell.monthlyContributions"),
          href: "/admin/monthly-contributions",
          Icon: ReceiptText,
          centralOnly: true,
        },
        {
          label: t("adminShell.aatAnnualContributions"),
          href: "/admin/aat-contributions",
          Icon: BookOpen,
        },
        {
          label: t("adminShell.paymentProofs"),
          href: "/admin/payment-proofs",
          Icon: FileImage,
        },
      ],
    },
    {
      label: t("adminShell.website"),
      items: [
        { label: "Edit the website", href: "/admin/website", Icon: FileText, centralOnly: true, match: (path) => path === "/admin/website" || path.startsWith("/admin/galleries/") },
        { label: "Downloads", href: "/admin/downloads", Icon: FileText, centralOnly: true },
      ],
    },
    {
      label: t("adminShell.administration"),
      items: [
        { label: t("adminShell.dojoSettings"), href: "/admin/dojos", Icon: Settings, centralOnly: true },
        { label: t("adminShell.auditLog"), href: "/admin/audit", Icon: History },
      ],
    },
  ];
}

function helpForPath(pathname: string, t: Translate) {
  if (pathname.includes("students")) {
    return {
      title: t("adminShell.helpStudents"),
      tasks: [
        [t("adminShell.helpFindStudent"), t("adminShell.helpFindStudentCopy")],
        [t("adminShell.helpAddStudent"), t("adminShell.helpAddStudentCopy")],
        [t("adminShell.helpCorrectRecord"), t("adminShell.helpCorrectRecordCopy")],
        [t("adminShell.helpArchiveStudent"), t("adminShell.helpArchiveStudentCopy")],
      ],
    };
  }
  if (pathname.includes("site-editor") || pathname.includes("dojo-updates") || pathname.includes("/galleries/")) {
    return {
      title: t("adminShell.helpWebsite"),
      tasks: [
        [t("adminShell.helpCreateUpdate"), t("adminShell.helpCreateUpdateCopy")],
        [t("adminShell.helpPreview"), t("adminShell.helpPreviewCopy")],
        [t("adminShell.helpPublish"), t("adminShell.helpPublishCopy")],
      ],
    };
  }
  if (pathname.includes("audit")) {
    return {
      title: t("adminShell.helpAudit"),
      tasks: [
        [t("adminShell.helpFindChange"), t("adminShell.helpFindChangeCopy")],
        [t("adminShell.helpTechnical"), t("adminShell.helpTechnicalCopy")],
      ],
    };
  }
  return {
    title: t("adminShell.helpThisPage"),
    tasks: [
      [t("adminShell.helpConfirmDojo"), t("adminShell.helpConfirmDojoCopy")],
      [t("adminShell.helpPending"), t("adminShell.helpPendingCopy")],
      [t("adminShell.helpCommonAction"), t("adminShell.helpCommonActionCopy")],
    ],
  };
}

function Navigation({
  central,
  pathname,
  search,
  hash,
  close,
  t,
}: {
  central: boolean;
  pathname: string;
  search: string;
  hash: string;
  close?: () => void;
  t: Translate;
}) {
  return <nav className="admin-shell__navigation" aria-label={t("adminShell.administration")}>
    {navigationGroups(t).map((group) => {
      const items = group.items.filter((item) => !item.centralOnly || central);
      if (!items.length) return null;
      return <section key={group.label}>
        <h2>{group.label}</h2>
        <ul>{items.map((item) => {
          const active = item.match
            ? item.match(pathname, search, hash)
            : pathname === item.href.split(/[?#]/)[0];
          return <li key={item.href}>
            <Link className={active ? "is-active" : ""} aria-current={active ? "page" : undefined} to={item.href} onClick={close}>
              <item.Icon size={18} aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          </li>;
        })}</ul>
      </section>;
    })}
  </nav>;
}

export function AdminShell({ children }: { children: ReactNode }) {
  const { language, setLanguage, t } = useAdminTranslation();
  const location = useLocation();
  const session = useAdminSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const menuPanelRef = useRef<HTMLElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const helpPanelRef = useRef<HTMLElement>(null);
  const helpTriggerRef = useRef<HTMLButtonElement>(null);
  const translationScopeRef = useRef<HTMLDivElement>(null);
  const languageButtonRef = useRef<HTMLButtonElement>(null);
  const languageMenuRef = useRef<HTMLDivElement>(null);
  const closeMenu = () => setMenuOpen(false);
  const closeHelp = () => setHelpOpen(false);

  useScopedAdminTranslations(translationScopeRef, language);
  useModalFocus(menuOpen, menuPanelRef, menuTriggerRef, closeMenu);
  useModalFocus(helpOpen, helpPanelRef, helpTriggerRef, closeHelp);
  useEffect(() => setMenuOpen(false), [location.pathname, location.search]);
  useEffect(() => {
    if (!languageOpen) return;
    const first = languageMenuRef.current?.querySelector<HTMLButtonElement>("button");
    first?.focus();
    function closeOnOutside(event: MouseEvent) {
      const target = event.target;
      if (target instanceof Node && !languageMenuRef.current?.contains(target) && !languageButtonRef.current?.contains(target)) {
        setLanguageOpen(false);
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setLanguageOpen(false);
        languageButtonRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [languageOpen]);

  const selectedDojo = useMemo(
    () => session.dojos.find((dojo) => dojo.id === session.admin?.selectedDojoId),
    [session.admin?.selectedDojoId, session.dojos],
  );
  const ready = Boolean(
    session.checked &&
    session.admin?.selectedDojoId &&
    !session.admin.renshinkanVerificationRequired,
  );
  const central = session.admin?.permissionLevel === "renshinkan_super_admin";
  const help = helpForPath(location.pathname, t);

  async function signOut() {
    await session.logout();
    window.location.assign("/admin");
  }

  if (location.pathname === "/admin" || !ready || !session.admin) return <>{children}</>;

  return <div ref={translationScopeRef} className="admin-shell">
    <aside className="admin-shell__sidebar">
      <Link to="/admin" className="admin-shell__brand">
        <strong>RenShinKan</strong>
        <span>{t("adminShell.administration")}</span>
      </Link>
      <Navigation central={central} pathname={location.pathname} search={location.search} hash={location.hash} t={t} />
    </aside>

    <div className="admin-shell__workspace">
      <header className="admin-shell__topbar">
        <button ref={menuTriggerRef} className="admin-shell__menu-button" type="button" onClick={() => setMenuOpen(true)} aria-expanded={menuOpen}>
          <Menu size={20} aria-hidden="true" /> {t("adminShell.menu")}
        </button>
        <div className="admin-shell__dojo-context">
          <span>{t("adminShell.managing")}</span>
          <strong><Building2 size={17} aria-hidden="true" /> {selectedDojo?.official_name || t("adminShell.selectedDojo")}</strong>
          <Link to="/admin">{t("adminShell.changeDojo")}</Link>
        </div>
        <div className="admin-shell__account">
          <span><strong>{session.admin.name}</strong><small>{central ? t("adminShell.centralAdministrator") : t("adminShell.dojoAdministrator")}</small></span>
          <div className="admin-language-menu">
            <button ref={languageButtonRef} type="button" aria-haspopup="menu" aria-expanded={languageOpen} onClick={() => setLanguageOpen((open) => !open)}>
              <Languages size={18} aria-hidden="true" /><span>{language === "th" ? "ไทย" : "English"}</span><ChevronDown size={15} aria-hidden="true" />
            </button>
            {languageOpen ? <div ref={languageMenuRef} role="menu" aria-label={t("adminShell.language")}>
              {([{ code: "en" as const, label: "English" }, { code: "th" as const, label: "ไทย" }]).map((option) => <button
                key={option.code} type="button" role="menuitemradio" aria-checked={language === option.code}
                onClick={() => { setLanguage(option.code); setLanguageOpen(false); languageButtonRef.current?.focus(); }}
              ><span>{option.label}</span>{language === option.code ? <Check size={16} aria-hidden="true" /> : null}</button>)}
            </div> : null}
          </div>
          <button ref={helpTriggerRef} type="button" onClick={() => setHelpOpen(true)}><CircleHelp size={18} aria-hidden="true" /> {t("adminShell.help")}</button>
          <a href="/" target="_blank" rel="noopener noreferrer"><ExternalLink size={18} aria-hidden="true" /> {t("adminShell.viewPublicWebsite")}</a>
          <button type="button" onClick={() => void signOut()}><LogOut size={18} aria-hidden="true" /> {t("adminShell.signOut")}</button>
        </div>
      </header>
      <div id="admin-content" className="admin-shell__content">{children}</div>
    </div>

    {menuOpen ? <div className="admin-shell__overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) closeMenu(); }}>
      <aside ref={menuPanelRef} className="admin-shell__mobile-panel" role="dialog" aria-modal="true" aria-labelledby="admin-mobile-menu-title">
        <header><div><strong id="admin-mobile-menu-title">RenShinKan</strong><span>{t("adminShell.administration")}</span></div><button type="button" onClick={closeMenu} aria-label={t("adminShell.closeMenu")}><X /></button></header>
        <div className="admin-shell__mobile-context"><span>{t("adminShell.managing")}</span><strong>{selectedDojo?.official_name}</strong></div>
        <Navigation central={central} pathname={location.pathname} search={location.search} hash={location.hash} close={closeMenu} t={t} />
        <footer><button type="button" onClick={() => { closeMenu(); setHelpOpen(true); }}><CircleHelp size={18} /> {t("adminShell.help")}</button><button type="button" onClick={() => void signOut()}><LogOut size={18} /> {t("adminShell.signOut")}</button></footer>
      </aside>
    </div> : null}

    {helpOpen ? <div className="admin-shell__overlay admin-shell__help-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) closeHelp(); }}>
      <aside ref={helpPanelRef} className="admin-help-drawer" role="dialog" aria-modal="true" aria-labelledby="admin-help-title">
        <header><div><span>{t("adminShell.helpForThisPage")}</span><h2 id="admin-help-title">{help.title}</h2></div><button type="button" onClick={closeHelp} aria-label={t("adminShell.closeHelp")}><X /></button></header>
        <div className="admin-help-drawer__body">
          <p>{t("adminShell.helpIntro")}</p>
          <ol>{help.tasks.map(([title, copy]) => <li key={title}><strong>{title}</strong><p>{copy}</p></li>)}</ol>
          <section><h3>{t("adminShell.statusMeanings")}</h3><dl>
            <div><dt>{t("adminShell.needsAction")}</dt><dd>{t("adminShell.needsActionCopy")}</dd></div>
            <div><dt>{t("adminShell.underReview")}</dt><dd>{t("adminShell.underReviewCopy")}</dd></div>
            <div><dt>{t("adminShell.approvedPaid")}</dt><dd>{t("adminShell.approvedPaidCopy")}</dd></div>
          </dl></section>
          <section><h3>{t("adminShell.moreHelp")}</h3><p>{t("adminShell.contactHelp")}</p></section>
        </div>
      </aside>
    </div> : null}
  </div>;
}
