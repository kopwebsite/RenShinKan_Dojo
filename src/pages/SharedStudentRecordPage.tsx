import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import QRCode from "qrcode";
import { ArrowLeft, Copy, Download, Printer, Share2 } from "lucide-react";
import { StudentRecordCard } from "../components/StudentRecordCard";
import type { PublicStudentRecord } from "../types/studentRecord";
import { recordsCopy } from "../data/recordsCopy";
import { languageOptions, useTranslation, type Language } from "../i18n";

const sharedActionCopy: Record<Language, { language: string; copy: string; copied: string; download: string; shareTitle: string }> = {
  en: { language: "Language", copy: "Copy link", copied: "Link copied", download: "Download QR", shareTitle: "Training record" },
  th: { language: "ภาษา", copy: "คัดลอกลิงก์", copied: "คัดลอกลิงก์แล้ว", download: "ดาวน์โหลดคิวอาร์", shareTitle: "ประวัติการฝึก" },
  "zh-CN": { language: "语言", copy: "复制链接", copied: "链接已复制", download: "下载二维码", shareTitle: "训练记录" },
  ja: { language: "言語", copy: "リンクをコピー", copied: "リンクをコピーしました", download: "QRをダウンロード", shareTitle: "稽古記録" },
};

export function SharedStudentRecordPage() {
  const { language, setLanguage } = useTranslation(); const c = recordsCopy[language]; const actions = sharedActionCopy[language];
  const { token } = useParams(); const [record, setRecord] = useState<PublicStudentRecord | null>(null); const [error, setError] = useState(false); const [qr, setQr] = useState(""); const [copied, setCopied] = useState(false);
  useEffect(() => {
    const hint = new URLSearchParams(window.location.search).get("lang");
    if (hint === "en" || hint === "th" || hint === "zh-CN" || hint === "ja") setLanguage(hint);
  }, [setLanguage]);
  useEffect(() => { fetch(`/api/records/share/${encodeURIComponent(token || "")}`, { headers: { Accept: "application/json" }, cache: "no-store" }).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error("unavailable"); setRecord(body.record); }).catch(() => setError(true)); }, [token]);
  useEffect(() => { if (record) void QRCode.toDataURL(window.location.href, { width: 360, margin: 2, color: { dark: "#241b15", light: "#fffaf0" } }).then(setQr); }, [language, record]);
  function chooseLanguage(next: Language) {
    const url = new URL(window.location.href);
    url.searchParams.set("lang", next);
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    setLanguage(next);
  }
  async function copy() { await navigator.clipboard.writeText(window.location.href); setCopied(true); }
  async function share() { if (navigator.share) await navigator.share({ title: record ? `${record.displayName} · ${actions.shareTitle}` : actions.shareTitle, url: window.location.href }); else await copy(); }
  const languagePicker = <label className="shared-record-language"><span>{actions.language}</span><select value={language} onChange={(event) => chooseLanguage(event.target.value as Language)}>{languageOptions.map((option) => <option key={option.code} value={option.code}>{option.nativeLabel}</option>)}</select></label>;
  if (error) return <section className="container-shell shared-record-error">{languagePicker}<p className="folio-mark">{c.eyebrow}</p><h1>{c.unavailable}</h1><p>{c.unavailableBody}</p><Link to="/student-records" className="text-link"><ArrowLeft size={16} /> {c.lookupLink}</Link></section>;
  if (!record) return <section className="container-shell shared-record-error" aria-live="polite">{languagePicker}<p>{c.loading}</p></section>;
  return <section className="container-shell shared-record-page">{languagePicker}<div className="shared-record-page__tools"><Link to="/student-records" className="text-link"><ArrowLeft size={16} /> {c.lookupLink}</Link><button className="text-link" onClick={() => void copy()}><Copy size={16} /> {copied ? actions.copied : actions.copy}</button><button className="text-link" onClick={share}><Share2 size={16} /> {c.share}</button>{qr ? <a className="text-link" href={qr} download={`${record.studentId}-profile-qr.png`}><Download size={16} /> {actions.download}</a> : null}<button className="text-link" onClick={() => window.print()}><Printer size={16} /> {c.print}</button></div><div className="shared-record-page__layout"><StudentRecordCard record={record} /><aside>{qr ? <img src={qr} alt={c.qrTitle} /> : null}<h2>{c.qrTitle}</h2><p>{c.qrBody}</p><p className="marginal-note">{c.qrNote}</p></aside></div></section>;
}
