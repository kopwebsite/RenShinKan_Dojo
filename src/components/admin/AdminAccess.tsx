import { CheckCircle2, LoaderCircle, LockKeyhole } from "lucide-react";
import { useAdminTranslation } from "../../i18n";

export type AdminDojo = {
  id: string; official_name: string; short_name: string; code: string; logo_url: string; slug: string; active: number; sort_order: number;
};
export type AdminIdentity = {
  name: string;
  role: "central" | "dojo";
  allowedDojoIds: string[];
  selectedDojoId: string | null;
  permissionLevel: "renshinkan_super_admin" | "dojo_admin";
};
export type AdminSessionResponse = { authenticated: boolean; admin: AdminIdentity | null; dojos: AdminDojo[] };

export function AdminLanguageSelector() {
  const { language, setLanguage, t } = useAdminTranslation();
  return <label className="admin-entry-language">
    <span>{t("adminAccess.language")}</span>
    <select value={language} onChange={(event) => setLanguage(event.target.value === "th" ? "th" : "en")}>
      <option value="en">English</option>
      <option value="th">ไทย</option>
    </select>
  </label>;
}

export function AdminCheckingSession() {
  const { t } = useAdminTranslation();
  return <div className="admin-gate"><AdminLanguageSelector /><LoaderCircle className="spin" /><p>{t("adminAccess.checking")}</p></div>;
}

export function AdminLoginFields({
  name, password, error, busy, setName, setPassword,
}: {
  name: string; password: string; error: string; busy?: boolean;
  setName: (value: string) => void; setPassword: (value: string) => void;
}) {
  const { t } = useAdminTranslation();
  return <>
    <AdminLanguageSelector />
    <LockKeyhole size={34} aria-hidden="true" />
    <p className="eyebrow">{t("adminAccess.eyebrow")}</p>
    <h1>{t("adminAccess.signInTitle")}</h1>
    <p>{t("adminAccess.signInCopy")}</p>
    <label htmlFor="admin-name">{t("adminAccess.name")}<input id="admin-name" name="name" type="text" maxLength={120} value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required autoFocus /></label>
    <label htmlFor="admin-password">{t("adminAccess.password")}<input id="admin-password" name="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    <button className="btn-primary" disabled={busy || !name.trim() || !password}><LockKeyhole size={17} /> {busy ? t("adminAccess.signingIn") : t("adminAccess.signIn")}</button>
  </>;
}

export function AdminDojoSelector({
  dojos, admin, busyId, error, onSelect,
}: {
  dojos: AdminDojo[]; admin: AdminIdentity; busyId?: string; error?: string;
  onSelect: (dojoId: string) => void;
}) {
  const { t } = useAdminTranslation();
  return <section className="container-shell admin-dojo-selection">
    <AdminLanguageSelector />
    <header><p className="eyebrow">{t("adminAccess.welcome", { name: admin.name })}</p><h1>{t("adminAccess.chooseDojo")}</h1><p>{t("adminAccess.chooseDojoCopy")}</p></header>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    <div className="admin-dojo-grid">
      {[...dojos].sort((left, right) => left.id === "dojo-rsk" ? -1 : right.id === "dojo-rsk" ? 1 : left.sort_order - right.sort_order || left.official_name.localeCompare(right.official_name)).map((dojo) => {
        const allowed = admin.role === "central" || (dojo.id !== "dojo-rsk" && admin.allowedDojoIds.includes(dojo.id));
        return <article className={`admin-dojo-card${allowed ? "" : " is-locked"}`} key={dojo.id}>
          <img src={dojo.logo_url} alt={`${dojo.official_name} logo`} />
          <div><span>{dojo.code}</span><h2>{dojo.official_name}</h2></div>
          <button className={allowed ? "btn-primary" : "btn-secondary"} disabled={!allowed || busyId === dojo.id} onClick={() => onSelect(dojo.id)}>
            {busyId === dojo.id ? <LoaderCircle className="spin" size={18} /> : allowed ? <CheckCircle2 size={18} /> : <LockKeyhole size={18} />}
            {allowed ? t("adminAccess.select", { dojo: dojo.short_name }) : t("adminAccess.noAccess")}
          </button>
        </article>;
      })}
    </div>
  </section>;
}
