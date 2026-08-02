import { useRef } from "react";
import { AdminAlerts } from "../components/AdminAlerts";
import {
  AdminCheckingSession,
  AdminLoginFields,
} from "../components/admin/AdminAccess";
import { useAdminSession } from "../components/admin/useAdminSession";
import { useAdminTranslation } from "../i18n";
import { useScopedAdminTranslations } from "../i18n/scopedAdmin";

export function AdminDashboardPage() {
  const session = useAdminSession();
  const { language } = useAdminTranslation();
  const translationScopeRef = useRef<HTMLElement>(null);
  useScopedAdminTranslations(translationScopeRef, language);

  if (!session.checked) return <AdminCheckingSession />;
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

  return (
    <section
      ref={translationScopeRef}
      className="container-shell admin-dashboard"
    >
      <header>
        <p className="eyebrow">Administration overview</p>
        <h1>Dashboard</h1>
        <p>
          Review work that needs attention, then continue from the
          administration menu.
        </p>
      </header>
      <AdminAlerts />
    </section>
  );
}
