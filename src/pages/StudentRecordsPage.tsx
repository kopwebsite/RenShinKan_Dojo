import { FormEvent, useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock3, Copy, Download, FileCheck2, Info, Printer, QrCode, Search, Share2, ShieldCheck, UserPlus, UserRound } from "lucide-react";
import QRCodeLib from "qrcode";
import { RANKS } from "../../shared/ranks";
import { StudentRecordCard } from "../components/StudentRecordCard";
import { PaymentProofUpload, type PaymentProofAccess } from "../components/PaymentProofUpload";
import { TurnstileWidget } from "../components/TurnstileWidget";
import type { StudentPassportRecord } from "../types/studentRecord";
import { prepareProfilePhoto } from "../utils/profilePhoto";
import { useTranslation, type Language } from "../i18n";

type Task = "lookup" | "profile" | "exam";
type LookupResult = { record: StudentPassportRecord; shareUrl: string; accessToken: string };
type PublicDojo = { id: string; official_name: string; short_name: string; code: string; logo_url: string };
const LOOKUP_VERIFICATION_PENDING = "Cloudflare verification is still finishing. Wait for the confirmation, then try again.";
type ExamDraft = {
  verificationName: string; studentId: string; dojoId: string; attemptedRank: string; aatNumber: string; firstName: string; surname: string;
  nationality: string; sex: string; dateOfBirth: string; permanentAddress: string; presentAddress: string;
  phoneCountry: string; phoneCallingCode: string; phone: string;
  occupationType: "" | "student" | "employed" | "both" | "not_applicable";
  school: string; classLevel: string; office: string; position: string; certificate: string; gamesExperience: string;
  applicantSignature: string; promiseAccepted: boolean;
};

const EMPTY_EXAM: ExamDraft = { verificationName: "", studentId: "", dojoId: "", attemptedRank: "10 Kyu", aatNumber: "", firstName: "", surname: "", nationality: "", sex: "", dateOfBirth: "", permanentAddress: "", presentAddress: "", phoneCountry: "Thailand", phoneCallingCode: "+66", phone: "", occupationType: "", school: "", classLevel: "", office: "", position: "", certificate: "", gamesExperience: "", applicantSignature: "", promiseAccepted: false };

const AAT_PAYMENT_HELP: Record<Language, { status: string; explanation: string }> = {
  en: { status: "Not yet paid or payment date unknown.", explanation: "Aikido members from all participating dojos are requested to make an annual contribution to the Aikido Association of Thailand." },
  th: { status: "ยังไม่ได้ชำระหรือไม่ทราบวันที่ชำระ", explanation: "สมาชิกไอคิโดจากโดโจที่เข้าร่วมทุกแห่งได้รับการขอความร่วมมือให้ชำระเงินสนับสนุนรายปีแก่สมาคมไอคิโดแห่งประเทศไทย" },
  ja: { status: "未納、または支払日が不明です。", explanation: "参加するすべての道場の合気道会員には、タイ合気道協会への年会費の納付をお願いしています。" },
  "zh-CN": { status: "尚未缴费或缴费日期未知。", explanation: "所有参与道场的合气道会员均需每年向泰国合气道协会缴纳会费。" },
};

const PHONE_COUNTRIES = [
  ["Thailand", "+66"], ["Argentina", "+54"], ["Australia", "+61"], ["Austria", "+43"],
  ["Bangladesh", "+880"], ["Belgium", "+32"], ["Brazil", "+55"], ["Cambodia", "+855"],
  ["Canada", "+1"], ["China", "+86"], ["Denmark", "+45"], ["Finland", "+358"],
  ["France", "+33"], ["Germany", "+49"], ["Hong Kong", "+852"], ["India", "+91"],
  ["Indonesia", "+62"], ["Ireland", "+353"], ["Israel", "+972"], ["Italy", "+39"],
  ["Japan", "+81"], ["Laos", "+856"], ["Malaysia", "+60"], ["Mexico", "+52"],
  ["Myanmar", "+95"], ["Nepal", "+977"], ["Netherlands", "+31"], ["New Zealand", "+64"],
  ["Norway", "+47"], ["Pakistan", "+92"], ["Philippines", "+63"], ["Poland", "+48"],
  ["Portugal", "+351"], ["Russia", "+7"], ["Singapore", "+65"], ["South Africa", "+27"],
  ["South Korea", "+82"], ["Spain", "+34"], ["Sri Lanka", "+94"], ["Sweden", "+46"],
  ["Switzerland", "+41"], ["Taiwan", "+886"], ["Turkey", "+90"], ["United Arab Emirates", "+971"],
  ["United Kingdom", "+44"], ["United States", "+1"], ["Vietnam", "+84"],
] as const;

const EXAM_REVIEW_LABELS: Partial<Record<keyof ExamDraft, string>> = {
  verificationName: "Student name on approved record",
  studentId: "Student ID",
  dojoId: "Current dojo",
  attemptedRank: "Kyu rank applying to test for",
  aatNumber: "AAT membership number",
  firstName: "Given name",
  surname: "Family name / surname",
  dateOfBirth: "Date of birth",
  permanentAddress: "Permanent (registered) address",
  presentAddress: "Current address",
  phoneCountry: "Country calling code",
  phone: "Telephone number",
  occupationType: "School or employment status",
  classLevel: "Class / year level",
  office: "Employer / office",
  position: "Position / job title",
  certificate: "Relevant certificates or qualifications",
  gamesExperience: "Aikido, martial arts, or sports experience",
  applicantSignature: "Applicant signature",
};

const OCCUPATION_LABELS: Record<ExamDraft["occupationType"], string> = {
  "": "",
  student: "Student",
  employed: "Employed",
  both: "Student and employed",
  not_applicable: "Not currently studying or employed",
};

function ExamFieldCopy({ label, optional = false, help }: { label: string; optional?: boolean; help?: string }) {
  return <span className="exam-field-copy"><span><strong>{label}</strong><b className={optional ? "is-optional" : "is-required"}>{optional ? "Optional" : "Required"}</b></span>{help ? <small>{help}</small> : null}</span>;
}

function ExamSectionLegend({ title, copy }: { title: string; copy: string }) {
  return <legend><span><strong>{title}</strong><small>{copy}</small></span></legend>;
}

async function responseBody<T>(response: Response) {
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error || "Please check the form and try again.");
  return body;
}

export function StudentRecordsPage() {
  const [task, setTask] = useState<Task>("lookup");
  return <>
    <section className="container-shell records-opening records-opening--tasks"><div><p className="folio-mark">Student records</p><h1>What would you like to do?</h1><p>Choose one task. Only the form you need will be shown.</p></div></section>
    <nav className="container-shell record-task-picker" aria-label="Student record tasks">{([
      ["lookup", Search, "Find my record", "View your approved profile, QR code, and submit hours."],
      ["profile", UserPlus, "Create a profile", "Request a new student record for administrator approval."],
      ["exam", FileCheck2, "Apply for an exam", "Complete the official belt-examination application."],
    ] as const).map(([value, Icon, title, copy]) => <button key={value} className={task === value ? "is-active" : ""} onClick={() => setTask(value)} aria-pressed={task === value}><Icon /><span><strong>{title}</strong><small>{copy}</small></span></button>)}</nav>
    <section className="container-shell record-task-panel">{task === "lookup" ? <LookupWorkflow /> : task === "profile" ? <ProfileWorkflow /> : <ExamWorkflow />}</section>
  </>;
}

function LookupWorkflow() {
  const [name, setName] = useState(""); const [studentId, setStudentId] = useState(""); const [token, setToken] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null); const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [reset, setReset] = useState(0);
  const [qr, setQr] = useState(""); const [hours, setHours] = useState(""); const [hoursMessage, setHoursMessage] = useState("");
  const onToken = useCallback((value: string) => {
    setToken(value);
    if (value) setError((current) => current === LOOKUP_VERIFICATION_PENDING ? "" : current);
  }, []);
  useEffect(() => { if (result?.shareUrl) QRCodeLib.toDataURL(result.shareUrl, { width: 360, margin: 2, errorCorrectionLevel: "M" }).then(setQr); }, [result?.shareUrl]);
  async function submit(event: FormEvent) { event.preventDefault(); setError(""); setResult(null); if (!name.trim() || !studentId.trim()) { setError("Enter both the student name and Student ID."); return; } if (!token) { setError(LOOKUP_VERIFICATION_PENDING); return; } setBusy(true); try { const response = await fetch("/api/records/lookup", { method: "POST", headers: { "Content-Type": "application/json", "X-Request-ID": crypto.randomUUID() }, body: JSON.stringify({ name, studentId, turnstileToken: token }) }); setResult(await responseBody<LookupResult>(response)); } catch (reason) { setError(reason instanceof Error ? reason.message : "No matching approved record was found."); } finally { setBusy(false); setToken(""); setReset((value) => value + 1); } }
  async function submitHours(event: FormEvent) { event.preventDefault(); if (!result?.accessToken) return; setBusy(true); setError(""); try { const response = await fetch("/api/records/hours", { method: "POST", headers: { "Content-Type": "application/json", "X-Request-ID": crypto.randomUUID() }, body: JSON.stringify({ studentId: result.record.studentId, accessToken: result.accessToken, hours: Number(hours) }) }); const body = await responseBody<{ requestedTotal: number }>(response); setHoursMessage(`Submitted for administrator review. Your requested total is ${body.requestedTotal} hours; your approved total has not changed yet.`); setHours(""); } catch (reason) { setError(reason instanceof Error ? reason.message : "The hours request could not be submitted."); } finally { setBusy(false); } }
  async function copyLink() { if (result) { await navigator.clipboard.writeText(result.shareUrl); setHoursMessage("Profile link copied."); } }
  async function shareLink() { if (!result) return; if (navigator.share) await navigator.share({ title: `${result.record.displayName} · RenShinKan`, url: result.shareUrl }); else await copyLink(); }
  return <><div className={`records-layout${result ? " records-layout--passport" : ""}`}><form className="record-lookup" onSubmit={submit}><p className="eyebrow">Existing student</p><h2>Look up an approved record</h2><p>Use the Student ID and student name. Small differences in spacing, punctuation, or spelling are okay; neither value works alone.</p><label>Student name<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" /></label><label>Student ID <small id="record-student-id-format">Example: RSK-6901.</small><input value={studentId} onChange={(event) => setStudentId(event.target.value.toUpperCase())} placeholder="RSK-6901" aria-describedby="record-student-id-format" /></label><TurnstileWidget onToken={onToken} resetSignal={reset} />{error ? <p className="form-error">{error}</p> : null}<button className="btn-primary" disabled={busy || !token}><Search size={17} /> {busy ? "Checking…" : "Find my record"}</button><p className="record-privacy"><ShieldCheck size={15} /> Verification details are sent securely and never placed in the page URL.</p></form>{result ? <StudentRecordCard record={result.record} /> : <div className="record-placeholder"><span>認</span><h2>Your verified record will appear here</h2><p>Public profile links never allow editing and never reveal application answers or payment details.</p></div>}</div>
    {result ? <section className="student-owner-tools"><header><QrCode /><div><h2>Share your approved profile</h2><p>This QR opens only your public student record. Share it with friends, sensei, other dojos, or training partners.</p></div></header><div className="student-owner-tools__grid">{qr ? <img src={qr} alt="Shareable student-profile QR code" /> : null}<div><label>Public profile link<input readOnly value={result.shareUrl} onFocus={(event) => event.currentTarget.select()} /></label><div><button className="btn-secondary" onClick={() => void copyLink()}><Copy size={16} /> Copy link</button><button className="btn-secondary" onClick={() => void shareLink()}><Share2 size={16} /> Share</button><a className="btn-secondary" download={`${result.record.studentId}-profile-qr.png`} href={qr}><Download size={16} /> Download QR</a><button className="btn-secondary" onClick={() => window.print()}><Printer size={16} /> Print</button></div></div></div><form className="student-hours-form" onSubmit={submitHours}><div><h3>Submit additional training hours</h3><p>Your verified lookup session authorizes this request. A sensei will review it before the approved total changes.</p></div><label>Hours to add<input type="number" min="0.25" max="1000" step="0.25" value={hours} onChange={(event) => setHours(event.target.value)} required /></label><button className="btn-primary" disabled={busy || !(Number(hours) > 0)}>Submit for review</button></form>{hoursMessage ? <p className="form-success"><CheckCircle2 /> {hoursMessage}</p> : null}</section> : null}</>;
}

function ProfileWorkflow() {
  const { language } = useTranslation();
  const aatHelp = AAT_PAYMENT_HELP[language];
  const [draft, setDraft] = useState({ displayName: "", currentRank: "Unranked", dojoId: "", aatNumber: "", aatLastPaidDate: "", aatPaidKnown: false, practiceDuration: "", profileBio: "" });
  const [dojos, setDojos] = useState<PublicDojo[]>([]);
  const [file, setFile] = useState<File | null>(null); const [preview, setPreview] = useState(""); const [token, setToken] = useState(""); const [reset, setReset] = useState(0); const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false);
  const onToken = useCallback((value: string) => setToken(value), []);
  useEffect(() => { fetch("/api/dojos").then((response) => response.json() as Promise<{ dojos?: PublicDojo[] }>).then((body) => setDojos(body.dojos || [])).catch(() => setError("The dojo list could not be loaded. Please try again.")); }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  async function choose(input?: File) { if (!input) return; try { const prepared = await prepareProfilePhoto(input); setFile(prepared); setPreview(URL.createObjectURL(prepared)); setError(""); } catch (reason) { setError(reason instanceof Error ? reason.message : "The photo could not be prepared."); } }
  async function submit(event: FormEvent) { event.preventDefault(); if (!draft.dojoId) { setError("Choose the student's dojo."); return; } if (!token) { setError("Complete Cloudflare verification."); return; } setBusy(true); setError(""); try { const data = new FormData(); data.set("payload", JSON.stringify({ ...draft, aatLastPaidDate: draft.aatPaidKnown ? draft.aatLastPaidDate : null, turnstileToken: token })); if (file) data.set("file", file); const response = await fetch("/api/records/profile-requests", { method: "POST", headers: { "X-Request-ID": crypto.randomUUID() }, body: data }); await responseBody(response); setDone(true); } catch (reason) { setError(reason instanceof Error ? reason.message : "The profile request could not be submitted."); setReset((value) => value + 1); setToken(""); } finally { setBusy(false); } }
  if (done) return <div className="record-success-panel"><CheckCircle2 /><p className="eyebrow">Request received</p><h2>Your profile is pending administrator approval</h2><p>It is not searchable, active, public, or QR-enabled yet. A sensei will review your details and any optional photo before activating the official student record.</p></div>;
  return <form className="student-long-form" onSubmit={submit}>
    <header><div><p className="eyebrow">New student profile</p><h2>Request an official record</h2></div><span className="admin-status is-pending">Pending until approved</span></header>
    <div className="student-form-grid">
      <label><span className="student-field-copy">Student name <small>Required · use the name you will use for record lookup.</small></span><input autoComplete="name" value={draft.displayName} onChange={(event) => setDraft({ ...draft, displayName: event.target.value })} required /></label>
      <label><span className="student-field-copy">Current kyu</span><select value={draft.currentRank} onChange={(event) => setDraft({ ...draft, currentRank: event.target.value })}>{RANKS.map((rank) => <option key={rank}>{rank}</option>)}</select></label>
      <label><span className="student-field-copy">Current dojo <small>Choose the dojo where you currently study or train.</small></span><select value={draft.dojoId} onChange={(event) => setDraft({ ...draft, dojoId: event.target.value })} required><option value="">Choose a dojo</option>{dojos.map((dojo) => <option key={dojo.id} value={dojo.id}>{dojo.official_name}</option>)}</select></label>
      <fieldset className="student-aat-card admin-span-2">
        <legend>AAT annual membership <small>Optional</small></legend>
        <div className="student-aat-card__grid">
          <label><span className="student-field-copy">Membership number <small>Your record will show “NEW” until a number is assigned.</small></span><input maxLength={40} value={draft.aatNumber} onChange={(event) => setDraft({ ...draft, aatNumber: event.target.value })} /></label>
          <label className="student-aat-paid-toggle"><input type="checkbox" checked={draft.aatPaidKnown} onChange={(event) => setDraft({ ...draft, aatPaidKnown: event.target.checked, aatLastPaidDate: event.target.checked ? draft.aatLastPaidDate : "" })} /><span><strong>I already paid my AAT annual membership</strong><small>Select this to add your most recent payment date.</small></span></label>
          {draft.aatPaidKnown ? <label><span className="student-field-copy">Most recent payment date <small>Renewal is normally due one year after this date.</small></span><input type="date" value={draft.aatLastPaidDate} onChange={(event) => setDraft({ ...draft, aatLastPaidDate: event.target.value })} required /></label> : <div className="student-aat-note" aria-label={`${aatHelp.status} ${aatHelp.explanation}`}><Info aria-hidden="true" /><div><strong>{aatHelp.status}</strong><p>{aatHelp.explanation}</p></div></div>}
        </div>
      </fieldset>
      <label><span className="student-field-copy">How long have you practiced aikido? <small>Example: “18 months” or “since 2021”.</small></span><input value={draft.practiceDuration} onChange={(event) => setDraft({ ...draft, practiceDuration: event.target.value })} required /></label>
      <label className="admin-span-2"><span className="student-field-copy">Additional information for your profile <small>Optional · do not include private contact or payment details.</small></span><textarea maxLength={2000} value={draft.profileBio} onChange={(event) => setDraft({ ...draft, profileBio: event.target.value })} /></label>
    </div>
    <label className="student-photo-field"><span>{preview ? <img src={preview} alt="Profile preview" /> : <UserRound aria-hidden="true" />}</span><strong>{preview ? "Replace profile photo" : "Add profile photo (optional)"}</strong><small>If you skip this, a neutral avatar will be shown. JPEG, PNG, or WebP; at least 128 × 128 pixels.</small><input type="file" accept="image/jpeg,image/png,image/webp" capture="user" onChange={(event) => void choose(event.target.files?.[0])} /></label>
    <TurnstileWidget onToken={onToken} resetSignal={reset} />
    {error ? <p className="form-error">{error}</p> : null}
    <button className="btn-primary" disabled={busy}>{busy ? "Submitting…" : "Send profile for approval"}</button>
  </form>;
}

function ExamWorkflow() {
  const [draft, setDraft] = useState<ExamDraft>(EMPTY_EXAM);
  const [dojos, setDojos] = useState<PublicDojo[]>([]);
  const [stage, setStage] = useState<"form" | "review" | "done">("form");
  const [token, setToken] = useState("");
  const [reset, setReset] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [applicationId, setApplicationId] = useState("");
  const [proofAccess, setProofAccess] = useState<PaymentProofAccess | null>(null);
  const onToken = useCallback((value: string) => setToken(value), []);
  useEffect(() => {
    fetch("/api/dojos")
      .then((response) => response.json() as Promise<{ dojos?: PublicDojo[] }>)
      .then((body) => setDojos(body.dojos || []))
      .catch(() => setError("The dojo list could not be loaded. Please try again."));
  }, []);
  function set<K extends keyof ExamDraft>(key: K, value: ExamDraft[K]) { setDraft((current) => ({ ...current, [key]: value })); }
  function setOccupation(value: ExamDraft["occupationType"]) {
    setDraft((current) => ({
      ...current,
      occupationType: value,
      school: value === "student" || value === "both" ? current.school : "",
      classLevel: value === "student" || value === "both" ? current.classLevel : "",
      office: value === "employed" || value === "both" ? current.office : "",
      position: value === "employed" || value === "both" ? current.position : "",
    }));
  }
  function review(event: FormEvent) { event.preventDefault(); setError(""); setStage("review"); window.scrollTo({ top: 0, behavior: "smooth" }); }
  async function submit() { if (!token) { setError("Complete Cloudflare verification before submitting."); return; } setBusy(true); setError(""); try { const response = await fetch("/api/records/examination-applications", { method: "POST", headers: { "Content-Type": "application/json", "X-Request-ID": crypto.randomUUID() }, body: JSON.stringify({ ...draft, turnstileToken: token }) }); const body = await responseBody<{ applicationId: string } & PaymentProofAccess>(response); setApplicationId(body.applicationId); setProofAccess({ proofId: body.proofId, uploadToken: body.uploadToken }); setStage("done"); } catch (reason) { setError(reason instanceof Error ? reason.message : "The application could not be submitted."); setToken(""); setReset((value) => value + 1); } finally { setBusy(false); } }
  if (stage === "done") return <div className="exam-payment-panel"><AlertMark /><p className="eyebrow">Application {applicationId.slice(0, 8)}</p><h2>Your application is submitted, but you are not finished yet</h2><p>You must still make the examination payment and upload your payslip. The dojo cannot confirm your payment until the payslip is reviewed.</p><div className="exam-payment-grid"><figure className="exam-payment-qr"><img src="/images/promptpay-qr.png" alt="Bank payment QR code" width={720} height={720} /><figcaption>Scan with your banking app</figcaption></figure><section className="exam-payment-instructions"><p className="eyebrow">Finish your application</p><h3>Three steps remain</h3><ol className="exam-payment-steps"><li><strong>Pay</strong><span>Scan the PromptPay QR and complete the examination payment.</span></li><li><strong>Upload</strong><span>Add the payment payslip using the button below.</span></li><li><strong>Review</strong><span>A sensei will check the payslip and confirm the payment.</span></li></ol><p className="exam-payment-distinction"><strong>Payment QR</strong><span>This is different from your shareable student-profile QR code.</span></p></section></div>{proofAccess ? <PaymentProofUpload access={proofAccess} paymentLabel="examination" /> : null}</div>;
  if (stage === "review") {
    const reviewDraft = {
      ...draft,
      dojoId: dojos.find((dojo) => dojo.id === draft.dojoId)?.official_name || draft.dojoId,
      occupationType: OCCUPATION_LABELS[draft.occupationType],
      phoneCountry: `${draft.phoneCountry} (${draft.phoneCallingCode})`,
      phone: `${draft.phoneCallingCode} ${draft.phone}`,
    };
    return <div className="student-long-form exam-review"><header><div><p className="eyebrow">Step 2 of 2</p><h2>Review your application</h2><p>Check each answer before submitting it to the dojo.</p></div><button className="btn-secondary" onClick={() => setStage("form")}>Edit answers</button></header><dl>{Object.entries(reviewDraft).filter(([key]) => key !== "promiseAccepted" && key !== "phoneCallingCode").map(([key, value]) => <div key={key}><dt>{EXAM_REVIEW_LABELS[key as keyof ExamDraft] || key.replace(/([A-Z])/g, " $1")}</dt><dd>{String(value) || "Not provided"}</dd></div>)}</dl><TurnstileWidget onToken={onToken} resetSignal={reset} />{error ? <p className="form-error">{error}</p> : null}<button className="btn-primary" disabled={busy || !token} onClick={() => void submit()}>{busy ? "Submitting…" : "Submit application and continue to payment"}</button></div>;
  }
  return <form className="student-long-form exam-application-form" onSubmit={review}>
    <header><div><p className="eyebrow">Step 1 of 2 · Aikido Association Thailand</p><h2>Belt-examination application</h2><p>Complete the applicant details below. Examination results and official notes are completed by administrators.</p></div><span className="admin-status is-neutral">Draft kept in this tab only</span></header>
    <aside className="exam-requirement-key" aria-label="Question requirements"><span><b className="is-required">Required</b> Needed to submit</span><span><b className="is-optional">Optional</b> Add only when relevant</span></aside>
    <fieldset>
      <ExamSectionLegend title="Verify your approved student record" copy="These details must match your active student profile." />
      <label><ExamFieldCopy label="Student name on your approved record" help="Use the name shown on your official student profile." /><input autoComplete="name" value={draft.verificationName} onChange={(event) => set("verificationName", event.target.value)} required /></label>
      <label><ExamFieldCopy label="Student ID" help="Example: RSK-6901." /><input value={draft.studentId} onChange={(event) => set("studentId", event.target.value.toUpperCase())} required /></label>
      <label><ExamFieldCopy label="Current dojo" help="Choose the dojo shown on your student record." /><select value={draft.dojoId} onChange={(event) => set("dojoId", event.target.value)} required><option value="">Choose your dojo</option>{dojos.map((dojo) => <option key={dojo.id} value={dojo.id}>{dojo.official_name}</option>)}</select></label>
      <label><ExamFieldCopy label="Rank you are applying to test for" help="Choose the next rank requested for this examination." /><select value={draft.attemptedRank} onChange={(event) => set("attemptedRank", event.target.value)}>{RANKS.slice(1).map((rank) => <option key={rank}>{rank}</option>)}</select></label>
    </fieldset>
    <fieldset>
      <ExamSectionLegend title="Applicant details" copy="Personal details used for the association application." />
      <label><ExamFieldCopy label="AAT membership number" optional help="Leave blank if you have not been assigned one." /><input value={draft.aatNumber} onChange={(event) => set("aatNumber", event.target.value)} /></label>
      <label><ExamFieldCopy label="Given name" /><input autoComplete="given-name" value={draft.firstName} onChange={(event) => set("firstName", event.target.value)} required /></label>
      <label><ExamFieldCopy label="Family name / surname" /><input autoComplete="family-name" value={draft.surname} onChange={(event) => set("surname", event.target.value)} required /></label>
      <label><ExamFieldCopy label="Nationality" /><input autoComplete="country-name" value={draft.nationality} onChange={(event) => set("nationality", event.target.value)} required /></label>
      <label><ExamFieldCopy label="Sex / gender" help="Use the wording you want recorded on the association application." /><input value={draft.sex} onChange={(event) => set("sex", event.target.value)} required /></label>
      <label><ExamFieldCopy label="Date of birth" /><input type="date" autoComplete="bday" value={draft.dateOfBirth} onChange={(event) => set("dateOfBirth", event.target.value)} required /></label>
    </fieldset>
    <fieldset>
      <ExamSectionLegend title="Address and contact" copy="How the association or dojo can identify and contact you." />
      <label><ExamFieldCopy label="Permanent (registered) address" help="Include street, district, province or state, and country." /><textarea autoComplete="street-address" value={draft.permanentAddress} onChange={(event) => set("permanentAddress", event.target.value)} required /></label>
       <label><ExamFieldCopy label="Current address" optional help="Leave blank if it is the same as your permanent address." /><textarea value={draft.presentAddress} onChange={(event) => set("presentAddress", event.target.value)} /></label>
      <label><ExamFieldCopy label="Country calling code" /><select value={draft.phoneCountry} onChange={(event) => { const option = PHONE_COUNTRIES.find(([country]) => country === event.target.value); if (option) setDraft({ ...draft, phoneCountry: option[0], phoneCallingCode: option[1] }); }}>{PHONE_COUNTRIES.map(([country, callingCode]) => <option key={country} value={country}>{country} ({callingCode})</option>)}</select></label>
      <label><ExamFieldCopy label="Telephone number" help="Enter a local number; the selected calling code is added automatically." /><input type="tel" inputMode="tel" autoComplete="tel-national" pattern="[0-9 ()+.-]{6,24}" maxLength={24} placeholder="81 234 5678" value={draft.phone} onChange={(event) => set("phone", event.target.value)} required /></label>
    </fieldset>
    <fieldset className="exam-occupation-section">
      <ExamSectionLegend title="School or employment" copy="Choose what applies; only the useful follow-up questions will appear." />
      <div className="exam-occupation-options" role="radiogroup" aria-label="School or employment status">
        {(Object.entries(OCCUPATION_LABELS).filter(([value]) => value) as Array<[Exclude<ExamDraft["occupationType"], "">, string]>).map(([value, label]) => <label key={value} className={draft.occupationType === value ? "is-selected" : ""}><input type="radio" name="occupationType" value={value} checked={draft.occupationType === value} onChange={() => setOccupation(value)} required /><span><strong>{label}</strong><small>{value === "student" ? "Add school details" : value === "employed" ? "Add workplace details" : value === "both" ? "Add both sets of details" : "No follow-up fields"}</small></span></label>)}
      </div>
      {draft.occupationType && draft.occupationType !== "not_applicable" ? <div className="exam-occupation-fields">
        {draft.occupationType === "student" || draft.occupationType === "both" ? <><label><ExamFieldCopy label="School or institution" /><input value={draft.school} onChange={(event) => set("school", event.target.value)} required /></label><label><ExamFieldCopy label="Class / year level" optional /><input value={draft.classLevel} onChange={(event) => set("classLevel", event.target.value)} /></label></> : null}
        {draft.occupationType === "employed" || draft.occupationType === "both" ? <><label><ExamFieldCopy label="Employer / office" /><input autoComplete="organization" value={draft.office} onChange={(event) => set("office", event.target.value)} required /></label><label><ExamFieldCopy label="Position / job title" optional /><input autoComplete="organization-title" value={draft.position} onChange={(event) => set("position", event.target.value)} /></label></> : null}
      </div> : null}
    </fieldset>
    <fieldset>
      <ExamSectionLegend title="Qualifications and experience" copy="A short summary helps the examiners understand your background." />
      <label><ExamFieldCopy label="Relevant certificates or qualifications" optional help="Include aikido, martial arts, coaching, or related qualifications." /><textarea value={draft.certificate} onChange={(event) => set("certificate", event.target.value)} /></label>
      <label><ExamFieldCopy label="Aikido, martial arts, or sports experience" help="Briefly describe your training history, competitions, or relevant events." /><textarea value={draft.gamesExperience} onChange={(event) => set("gamesExperience", event.target.value)} required /></label>
    </fieldset>
    <fieldset>
      <ExamSectionLegend title="Declaration and signature" copy="Confirm the application is accurate before review." />
      <p>I promise to observe the rules of the Aikido Association Thailand and confirm that the information in this application is accurate.</p>
      <label><ExamFieldCopy label="Applicant signature" help="Type your full legal name." /><input autoComplete="name" value={draft.applicantSignature} onChange={(event) => set("applicantSignature", event.target.value)} required /></label>
      <label className="exam-promise"><input type="checkbox" checked={draft.promiseAccepted} onChange={(event) => set("promiseAccepted", event.target.checked)} required /><span><strong>I accept the declaration above.</strong><small>Required to submit this examination application.</small></span></label>
    </fieldset>
    {error ? <p className="form-error">{error}</p> : null}
    <button className="btn-primary">Review every answer</button>
  </form>;
}

function AlertMark() { return <div className="exam-alert-mark"><Clock3 /></div>; }
