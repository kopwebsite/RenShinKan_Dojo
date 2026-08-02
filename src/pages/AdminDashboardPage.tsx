import { Database, FileText, LogOut, Settings } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { AdminAlerts } from "../components/AdminAlerts";
import {
  AdminCheckingSession,
  AdminDojoSelector,
  AdminLoginFields,
} from "../components/admin/AdminAccess";
import { useAdminSession } from "../components/admin/useAdminSession";
import { useAdminTranslation } from "../i18n";
import { useScopedAdminTranslations } from "../i18n/scopedAdmin";

export function AdminDashboardPage() {
  const session = useAdminSession();
  const { language, t } = useAdminTranslation();
  const translationScopeRef = useRef<HTMLElement>(null);
  const [switchingDojo, setSwitchingDojo] = useState(false);
  const location = useLocation();

  useScopedAdminTranslations(translationScopeRef, language);
  useEffect(() => {
    const switchRequested =
      new URLSearchParams(window.location.search).get("switch") === "1";
    if (
      !session.checked ||
      !session.admin?.selectedDojoId ||
      !switchRequested ||
      switchingDojo
    )
      return;
    setSwitchingDojo(true);
    void session
      .switchDojo()
      .then(() =>
        window.history.replaceState(
          window.history.state,
          "",
          "/admin/dashboard",
        ),
      )
      .catch((reason) =>
        session.setError(
          reason instanceof Error
            ? reason.message
            : "The dojo selection could not be reset.",
        ),
      )
      .finally(() => setSwitchingDojo(false));
  }, [session, switchingDojo]);

  if (!session.checked || switchingDojo) return <AdminCheckingSession />;
  if (!session.admin) {
    return (
      <section className="admin-login-screen">
        <form className="admin-login-card" onSubmit={session.login}>
          <AdminLoginFields
            name={session.name}
            password={session.password}
            error={session.error}
            busy={session.busy}
            setName={session.setName}
            setPassword={session.setPassword}
          />
        </form>
      </section>
    );
  }
  if (!session.admin.selectedDojoId) {
    return (
      <div className="admin-entry-screen">
        <AdminDojoSelector
          dojos={session.dojos}
          admin={session.admin}
          busyId={session.selecting}
          error={session.error}
          onSelect={(id) => void session.selectDojo(id)}
        />
        <button
          className="btn-secondary admin-entry-signout"
          type="button"
          onClick={() => void session.logout()}
        >
          <LogOut size={17} aria-hidden="true" /> {t("adminShell.signOut")}
        </button>
      </div>
    );
  }
  return (
    <section
      ref={translationScopeRef}
      className="container-shell admin-dashboard"
    >
      <header>
        <p className="eyebrow">Administration overview</p>
        <h1>Dashboard</h1>
        <p>
          Review work that needs attention, then continue to the relevant
          administration page.
        </p>
      </header>
      <AdminAlerts />
      <section
        className="admin-dashboard__quick-links"
        aria-labelledby="admin-quick-links-title"
      >
        <h2 id="admin-quick-links-title">Common tasks</h2>
        <div>
          <Link to="/admin/students">
            <Database size={19} aria-hidden="true" /> Student database
          </Link>
          <Link to="/admin/website">
            <FileText size={19} aria-hidden="true" /> Edit website
          </Link>
          <Link to="/admin/dojos">
            <Settings size={19} aria-hidden="true" /> Dojo settings
          </Link>
        </div>
      </section>
      <footer>
        <button
          className="btn-secondary"
          type="button"
          onClick={() => void session.logout()}
        >
          <LogOut size={17} /> Sign out
        </button>
      </footer>
    </section>
  );
}
