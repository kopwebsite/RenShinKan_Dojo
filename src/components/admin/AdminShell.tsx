import {
  BookOpen,
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
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { Link, Navigate, useLocation } from "react-router";
import { useAdminTranslation, type TranslationKey } from "../../i18n";
import { useScopedAdminTranslations } from "../../i18n/scopedAdmin";
import { canAccessAdminPath } from "../../../shared/adminPermissions";
import { AdminCheckingSession } from "./AdminAccess";
import { AccessibleDialog } from "../AccessibleDialog";
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

function navigationGroups(t: Translate): NavigationGroup[] {
  return [
    {
      label: t("adminShell.overview"),
      items: [
        { label: "Dashboard", href: "/admin/dashboard", Icon: Home, match: (path) => path === "/admin/dashboard" },
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
        {
          label: t("adminShell.examPaymentProofs"),
          href: "/admin/exam-payslips",
          Icon: FileImage,
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
      const permission = central ? "renshinkan_super_admin" : "dojo_admin";
      const items = group.items.filter((item) => canAccessAdminPath(item.href, permission));
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
  const [languageOpen, setLanguageOpen] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const translationScopeRef = useRef<HTMLDivElement>(null);
  const languageButtonRef = useRef<HTMLButtonElement>(null);
  const languageMenuRef = useRef<HTMLDivElement>(null);
  const closeMenu = () => setMenuOpen(false);

  useScopedAdminTranslations(translationScopeRef, language);
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

  const ready = Boolean(session.checked && session.admin);
  const central = session.admin?.permissionLevel === "renshinkan_super_admin";

  async function signOut() {
    await session.logout();
    window.location.assign("/admin");
  }

  if (session.status === "loading") return <AdminCheckingSession />;
  if (session.status === "error") return <section className="admin-login-screen">
    <div className="admin-login-card" role="alert">
      <h1>Administrator session unavailable</h1>
      <p>{session.error || "The administrator session could not be checked."}</p>
      <button className="btn-primary" type="button" onClick={() => void session.refresh()}>Retry</button>
    </div>
  </section>;
  if (!session.admin) {
    return location.pathname === "/admin" ? <>{children}</> : <Navigate to="/admin" replace />;
  }
  if (!ready) {
    return location.pathname === "/admin" || location.pathname === "/admin/dashboard"
      ? <>{children}</>
      : <Navigate to="/admin/dashboard" replace />;
  }

  return <div ref={translationScopeRef} className="admin-shell">
    <aside className="admin-shell__sidebar">
      <Link to="/admin/dashboard" className="admin-shell__brand">
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
          <span>Data scope</span>
            <strong>All dojos</strong>
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
          <a href="/" target="_blank" rel="noopener noreferrer"><ExternalLink size={18} aria-hidden="true" /> {t("adminShell.viewPublicWebsite")}</a>
          <button type="button" onClick={() => void signOut()}><LogOut size={18} aria-hidden="true" /> {t("adminShell.signOut")}</button>
        </div>
      </header>
      <div id="admin-content" className="admin-shell__content">{children}</div>
    </div>

    <AccessibleDialog open={menuOpen} onClose={closeMenu} triggerRef={menuTriggerRef} titleId="admin-mobile-menu-title" backdropClassName="admin-shell__overlay" panelClassName="admin-shell__mobile-panel" panelAs="aside">
        <header><div><strong id="admin-mobile-menu-title">RenShinKan</strong><span>{t("adminShell.administration")}</span></div><button type="button" onClick={closeMenu} aria-label={t("adminShell.closeMenu")}><X /></button></header>
        <div className="admin-shell__mobile-context"><span>Data scope</span>
          <strong>All dojos</strong>
        </div>
        <Navigation
          central={central}
          pathname={location.pathname} search={location.search} hash={location.hash} close={closeMenu} t={t} />
        <footer><button type="button" onClick={() => void signOut()}><LogOut size={18} /> {t("adminShell.signOut")}</button></footer>
    </AccessibleDialog>
  </div>;
}
