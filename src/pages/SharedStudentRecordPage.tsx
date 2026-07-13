import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import QRCode from "qrcode";
import { ArrowLeft, Copy, Download, Printer, Share2 } from "lucide-react";
import { StudentRecordCard } from "../components/StudentRecordCard";
import type { PublicStudentRecord } from "../types/studentRecord";
import { recordsCopy } from "../data/recordsCopy";
import { useTranslation } from "../i18n";

export function SharedStudentRecordPage() {
  const { language } = useTranslation(); const c = recordsCopy[language];
  const { token } = useParams(); const [record, setRecord] = useState<PublicStudentRecord | null>(null); const [error, setError] = useState(""); const [qr, setQr] = useState("");
  useEffect(() => { fetch(`/api/records/share/${encodeURIComponent(token || "")}`, { headers: { Accept: "application/json" }, cache: "no-store" }).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error); setRecord(body.record); return QRCode.toDataURL(window.location.href, { width: 360, margin: 2, color: { dark: "#241b15", light: "#fffaf0" } }); }).then(setQr).catch((reason) => setError(reason instanceof Error ? reason.message : "This shared record is unavailable.")); }, [token]);
  async function share() { if (navigator.share) await navigator.share({ title: record ? `${record.displayName} training record` : "Training record", url: window.location.href }); else await navigator.clipboard.writeText(window.location.href); }
  if (error) return <section className="container-shell shared-record-error"><p className="folio-mark">{c.eyebrow}</p><h1>{c.unavailable}</h1><p>{c.unavailableBody}</p><Link to="/student-records" className="text-link"><ArrowLeft size={16} /> {c.lookupLink}</Link></section>;
  if (!record) return <section className="container-shell shared-record-error" aria-live="polite"><p>{c.loading}</p></section>;
  return <section className="container-shell shared-record-page"><div className="shared-record-page__tools"><Link to="/student-records" className="text-link"><ArrowLeft size={16} /> {c.lookupLink}</Link><button className="text-link" onClick={() => void navigator.clipboard.writeText(window.location.href)}><Copy size={16} /> Copy link</button><button className="text-link" onClick={share}><Share2 size={16} /> {c.share}</button>{qr ? <a className="text-link" href={qr} download={`${record.studentId}-profile-qr.png`}><Download size={16} /> Download QR</a> : null}<button className="text-link" onClick={() => window.print()}><Printer size={16} /> {c.print}</button></div><div className="shared-record-page__layout"><StudentRecordCard record={record} /><aside>{qr ? <img src={qr} alt={c.qrTitle} /> : null}<h2>{c.qrTitle}</h2><p>{c.qrBody}</p><p className="marginal-note">{c.qrNote}</p></aside></div></section>;
}
