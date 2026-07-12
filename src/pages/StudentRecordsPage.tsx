import { FormEvent, useCallback, useState } from "react";
import { LockKeyhole, Search, ShieldCheck } from "lucide-react";
import { StudentRecordCard } from "../components/StudentRecordCard";
import { TurnstileWidget } from "../components/TurnstileWidget";
import type { PublicStudentRecord } from "../types/studentRecord";
import { recordsCopy } from "../data/recordsCopy";
import { useTranslation } from "../i18n";

const LOOKUP_FAILURE = "We could not find a matching student record. Please check the name and Student ID and try again.";
const studentIdCopy = {
  en: {
    intro: "Enter the student's exact record name and Student ID. Both details are required and neither works on its own.",
    label: "Student ID",
    privacy: "Names and Student IDs are verified on the server and are never placed in the page URL.",
  },
  th: {
    intro: "กรอกชื่อในประวัติและรหัสนักเรียนให้ตรงกัน ต้องใช้ข้อมูลทั้งสองอย่างร่วมกัน",
    label: "รหัสนักเรียน",
    privacy: "ชื่อและรหัสนักเรียนจะตรวจสอบที่เซิร์ฟเวอร์และไม่ปรากฏใน URL",
  },
  ja: {
    intro: "記録上の正確な氏名と生徒IDを入力してください。両方の情報が必要です。",
    label: "生徒ID",
    privacy: "氏名と生徒IDはサーバーで確認され、URLには含まれません。",
  },
  "zh-CN": {
    intro: "请输入记录中的准确姓名和学员ID。两项信息必须同时使用。",
    label: "学员ID",
    privacy: "姓名和学员ID仅在服务器端验证，不会写入页面网址。",
  },
} as const;

export function StudentRecordsPage() {
  const { language } = useTranslation();
  const c = recordsCopy[language];
  const idCopy = studentIdCopy[language];
  const [name, setName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [token, setToken] = useState("");
  const [record, setRecord] = useState<PublicStudentRecord | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reset, setReset] = useState(0);
  const onToken = useCallback((value: string) => setToken(value), []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setRecord(null);
    if (!name.trim() || !studentId.trim() || !token) {
      setError(c.required);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/records/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, studentId, turnstileToken: token }),
      });
      const body = await response.json() as { record?: PublicStudentRecord; error?: string };
      if (!response.ok || !body.record) throw new Error(body.error || LOOKUP_FAILURE);
      setRecord(body.record);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : LOOKUP_FAILURE);
    } finally {
      setBusy(false);
      setToken("");
      setReset((value) => value + 1);
    }
  }

  return <>
    <section className="container-shell records-opening">
      <div><p className="folio-mark">{c.eyebrow}</p><h1>{c.title}</h1><p>{idCopy.intro}</p></div>
      <aside><LockKeyhole size={22} /><strong>{c.privacyTitle}</strong><p>{c.privacyBody}</p></aside>
    </section>
    <section className="container-shell records-layout">
      <form className="record-lookup" onSubmit={submit} noValidate>
        <h2>{c.lookup}</h2>
        <label htmlFor="record-name">{c.name}<input id="record-name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" maxLength={120} /></label>
        <label htmlFor="record-student-id">{idCopy.label}<input id="record-student-id" value={studentId} onChange={(event) => setStudentId(event.target.value.toUpperCase())} autoComplete="off" autoCapitalize="characters" maxLength={40} /></label>
        <TurnstileWidget onToken={onToken} resetSignal={reset} />
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button className="btn-primary" disabled={busy}><Search size={17} /> {busy ? c.checking : c.verify}</button>
        <p className="record-privacy"><ShieldCheck size={15} /> {idCopy.privacy}</p>
      </form>
      {record ? <StudentRecordCard record={record} /> : <div className="record-placeholder"><span>認</span><h2>{c.placeholderTitle}</h2><p>{c.placeholderBody}</p></div>}
    </section>
  </>;
}
