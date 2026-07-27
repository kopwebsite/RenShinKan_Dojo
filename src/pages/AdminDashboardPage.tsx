import { ArrowRight, Database, ExternalLink, FileText, LogOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AdminCheckingSession,
  AdminDojoSelector,
  AdminLanguageSelector,
  AdminLoginFields,
  AdminRenshinKanVerification,
} from "../components/admin/AdminAccess";
import { useAdminSession } from "../components/admin/useAdminSession";
import { useAdminTranslation } from "../i18n";
import { useScopedAdminTranslations } from "../i18n/scopedAdmin";

export function AdminDashboardPage() {
  const session = useAdminSession();
  const { language, t } = useAdminTranslation();
  const initialSessionHandled = useRef(false);
  const translationScopeRef = useRef<HTMLElement>(null);
  const [entryReady, setEntryReady] = useState(false);
  const [selectedThisVisit, setSelectedThisVisit] = useState(false);

  useScopedAdminTranslations(translationScopeRef, language);
  useEffect(() => {
    if (!session.checked || initialSessionHandled.current) return;
    initialSessionHandled.current = true;
    if (session.admin?.selectedDojoId) {
      void session.switchDojo()
        .catch((reason) => session.setError(reason instanceof Error ? reason.message : "The dojo selection could not be reset."))
        .finally(() => setEntryReady(true));
    } else {
      setEntryReady(true);
    }
  }, [session]);

  if (!session.checked || !entryReady) return <AdminCheckingSession />;
  if (!session.admin) {
    return <section className="admin-login-screen">
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
    </section>;
  }
  if (!session.admin.selectedDojoId) {
    return <div className="admin-entry-screen">
      <AdminDojoSelector
        dojos={session.dojos}
        admin={session.admin}
        busyId={session.selecting}
        error={session.error}
        onSelect={(id) => {
          setSelectedThisVisit(true);
          void session.selectDojo(id);
        }}
      />
      <button className="btn-secondary admin-entry-signout" type="button" onClick={() => void session.logout()}>
        <LogOut size={17} aria-hidden="true" /> {t("adminAccess.signOut")}
      </button>
    </div>;
  }
  if (session.admin.renshinkanVerificationRequired) {
    return <AdminRenshinKanVerification
      password={session.secondaryPassword}
      error={session.error}
      busy={session.verifying}
      setPassword={session.setSecondaryPassword}
      onSubmit={session.verifyRenshinKan}
      onCancel={() => void session.switchDojo()}
    />;
  }

  if (session.admin.selectedDojoId !== "dojo-rsk") {
    if (selectedThisVisit) return <AdminCheckingSession />;
    return null;
  }

  return <section ref={translationScopeRef} className="admin-renshinkan-hub">
    <AdminLanguageSelector />
    <header>
      <p className="eyebrow">RenShinKan access confirmed</p>
      <h1>What would you like to manage?</h1>
      <p>Choose one focused workspace. You can return here later to switch dojo.</p>
    </header>
    <div className="admin-renshinkan-hub__choices">
      <Link to="/admin/website">
        <span><FileText size={28} aria-hidden="true" /></span>
        <div><h2>Edit the website</h2><p>Publish newsletters and community events, update the photo library, or replace the payment QR.</p></div>
        <ArrowRight aria-hidden="true" />
      </Link>
      <Link to="/admin/students">
        <span><Database size={28} aria-hidden="true" /></span>
        <div><h2>Student management</h2><p>Open the student database, profile requests, examinations, contributions, and payment records.</p></div>
        <ArrowRight aria-hidden="true" />
      </Link>
    </div>
    <footer>
      <button className="btn-secondary" type="button" onClick={() => void session.switchDojo()}>Choose another dojo</button>
      <a className="btn-secondary" href="/" target="_blank" rel="noopener noreferrer"><ExternalLink size={17} /> View public website</a>
      <button className="btn-secondary" type="button" onClick={() => void session.logout()}><LogOut size={17} /> Sign out</button>
    </footer>
  </section>;
}
