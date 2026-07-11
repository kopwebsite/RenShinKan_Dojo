import { FormEvent, useCallback, useState } from "react";
import { LockKeyhole, Search, ShieldCheck } from "lucide-react";
import { StudentRecordCard } from "../components/StudentRecordCard";
import { TurnstileWidget } from "../components/TurnstileWidget";
import type { PublicStudentRecord } from "../types/studentRecord";
import { recordsCopy } from "../data/recordsCopy";
import { useTranslation } from "../i18n";

export function StudentRecordsPage() {
  const { language } = useTranslation(); const c = recordsCopy[language];
  const [name, setName] = useState(""); const [code, setCode] = useState(""); const [token, setToken] = useState(""); const [record, setRecord] = useState<PublicStudentRecord | null>(null); const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [reset, setReset] = useState(0);
  const onToken = useCallback((value: string) => setToken(value), []);
  async function submit(event: FormEvent) { event.preventDefault(); setError(""); setRecord(null); if (!name.trim() || !code.trim() || !token) { setError(c.required); return; } setBusy(true); try { const response = await fetch("/api/records/lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, code, turnstileToken: token }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error); setRecord(body.record); } catch { setError(c.required); } finally { setBusy(false); setToken(""); setReset((value) => value + 1); } }
  return <>
    <section className="container-shell records-opening"><div><p className="folio-mark">{c.eyebrow}</p><h1>{c.title}</h1><p>{c.intro}</p></div><aside><LockKeyhole size={22} /><strong>{c.privacyTitle}</strong><p>{c.privacyBody}</p></aside></section>
    <section className="container-shell records-layout">
      <form className="record-lookup" onSubmit={submit} noValidate><h2>{c.lookup}</h2><label>{c.name}<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" maxLength={120} /></label><label>{c.code}<input value={code} onChange={(event) => setCode(event.target.value)} autoComplete="off" maxLength={80} /></label><TurnstileWidget onToken={onToken} resetSignal={reset} />{error ? <p className="form-error" role="alert">{error}</p> : null}<button className="btn-primary" disabled={busy}><Search size={17} /> {busy ? c.checking : c.verify}</button><p className="record-privacy"><ShieldCheck size={15} /> {c.urlPrivacy}</p></form>
      {record ? <StudentRecordCard record={record} /> : <div className="record-placeholder"><span>認</span><h2>{c.placeholderTitle}</h2><p>{c.placeholderBody}</p></div>}
    </section>
  </>;
}
