import { CheckCircle2, LoaderCircle, LockKeyhole } from "lucide-react";

export type AdminDojo = {
  id: string; official_name: string; short_name: string; code: string; logo_url: string; slug: string; active: number; sort_order: number;
};
export type AdminIdentity = { name: string; role: "central" | "dojo"; allowedDojoIds: string[]; selectedDojoId: string | null };
export type AdminSessionResponse = { authenticated: boolean; admin: AdminIdentity | null; dojos: AdminDojo[] };

export function AdminCheckingSession() {
  return <div className="admin-gate"><LoaderCircle className="spin" /><p>Checking administrator session…</p></div>;
}

export function AdminLoginFields({
  name, password, error, busy, setName, setPassword,
}: {
  name: string; password: string; error: string; busy?: boolean;
  setName: (value: string) => void; setPassword: (value: string) => void;
}) {
  return <>
    <LockKeyhole size={34} aria-hidden="true" />
    <p className="eyebrow">Administrator access</p>
    <h1>Sign in to the dojo administration</h1>
    <p>Your name is attached to audit records. Use the administrative password assigned to your role.</p>
    <label htmlFor="admin-name">Your name<input id="admin-name" name="name" type="text" maxLength={120} value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required autoFocus /></label>
    <label htmlFor="admin-password">Administrative password<input id="admin-password" name="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    <button className="btn-primary" disabled={busy || !name.trim() || !password}><LockKeyhole size={17} /> {busy ? "Signing in…" : "Sign in"}</button>
  </>;
}

export function AdminDojoSelector({
  dojos, admin, busyId, error, onSelect,
}: {
  dojos: AdminDojo[]; admin: AdminIdentity; busyId?: string; error?: string;
  onSelect: (dojoId: string) => void;
}) {
  return <section className="container-shell admin-dojo-selection">
    <header><p className="eyebrow">Welcome, {admin.name}</p><h1>Choose a dojo</h1><p>Select the dojo you are working with. Access is checked again by the server for every record and action.</p></header>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    <div className="admin-dojo-grid">
      {dojos.map((dojo) => {
        const allowed = admin.role === "central" || admin.allowedDojoIds.includes(dojo.id);
        return <article className={`admin-dojo-card${allowed ? "" : " is-locked"}`} key={dojo.id}>
          <img src={dojo.logo_url} alt={`${dojo.official_name} logo`} />
          <div><span>{dojo.code}</span><h2>{dojo.official_name}</h2></div>
          <button className={allowed ? "btn-primary" : "btn-secondary"} disabled={!allowed || busyId === dojo.id} onClick={() => onSelect(dojo.id)}>
            {busyId === dojo.id ? <LoaderCircle className="spin" size={18} /> : allowed ? <CheckCircle2 size={18} /> : <LockKeyhole size={18} />}
            {allowed ? `Select ${dojo.short_name}` : "No access"}
          </button>
        </article>;
      })}
    </div>
  </section>;
}
