import { CalendarClock, CheckCircle2, HandCoins, Landmark, LoaderCircle, Plus, QrCode, ReceiptText, ShieldCheck, Trash2, UsersRound } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { assetPath } from "../utils/assetPath";
import { PaymentProofUpload, type PaymentProofAccess } from "./PaymentProofUpload";
import { TurnstileWidget } from "./TurnstileWidget";

const PROMPTPAY_QR_IMAGE = "/images/promptpay-qr.png";
const MONTHLY_CONTRIBUTION_AMOUNT = 1800;
const MAX_MONTHLY_STUDENTS = 10;

type Dojo = { id: string; official_name: string; short_name: string; code: string };
type AatReminder = { kind: "aat"; state: "not_recorded" | "current" | "due_soon" | "overdue"; lastPaidDate: string | null; dueDate: string | null; days: number | null };
type MonthlyReminder = { kind: "monthly"; state: "not_recorded" | "current" | "check_in"; lastPaidMonth: string | null; lastPaidDate: string | null };
type SubmissionResult = {
  contributionId: string;
  month: string;
  status: "awaiting_payment";
  contributionType: "aat_annual" | "renshinkan_monthly";
  dojoName: string;
  reminder: AatReminder | MonthlyReminder;
  coveredStudents?: Array<{ contributionId: string; studentId: string; studentName: string; reminder: MonthlyReminder }>;
  studentCount?: number;
  unitAmount?: number;
  totalAmount?: number;
} & PaymentProofAccess;
type ContributionStudent = { key: string; studentId: string; studentName: string };

function emptyContributionStudent(): ContributionStudent {
  return { key: crypto.randomUUID(), studentId: "", studentName: "" };
}

function baht(value: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "THB", maximumFractionDigits: 0 }).format(value);
}

function currentBangkokMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return year && month ? `${year}-${month}` : new Date().toISOString().slice(0, 7);
}

function monthLabel(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function dateLabel(value: string) {
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function PaymentReminder({ reminder, month }: { reminder: AatReminder | MonthlyReminder; month: string }) {
  if (reminder.kind === "aat") {
    const overdueDays = reminder.days == null ? null : Math.abs(reminder.days);
    const message = reminder.state === "overdue"
      ? `Your renewal date has passed by ${overdueDays} day${overdueDays === 1 ? "" : "s"}. You are welcome to use this QR to bring the record up to date.`
      : reminder.state === "due_soon"
        ? `Your renewal date is approaching in ${reminder.days} day${reminder.days === 1 ? "" : "s"}. This QR can be used for the next annual period.`
        : reminder.state === "current"
          ? "Your record is currently within its annual period. If you are paying ahead, the dojo will review the payslip before updating it."
          : "No earlier annual payment date appears on this record. That may simply mean the record has not been updated yet.";
    return <aside className={`contribution-reminder contribution-reminder--${reminder.state}`}>
      <div><CalendarClock aria-hidden="true" /><span><small>AAT payment history</small><strong>{reminder.state === "overdue" ? "Renewal date passed" : reminder.state === "due_soon" ? "Renewal coming up" : reminder.state === "current" ? "Current on record" : "No previous date recorded"}</strong></span></div>
      <dl><div><dt>Last confirmed</dt><dd>{reminder.lastPaidDate ? dateLabel(reminder.lastPaidDate) : "Not recorded"}</dd></div><div><dt>Renewal date</dt><dd>{reminder.dueDate ? dateLabel(reminder.dueDate) : "Not established"}</dd></div></dl>
      <p>{message}</p>
    </aside>;
  }

  const message = reminder.state === "current"
    ? `Thank you—your most recent confirmed contribution is for ${monthLabel(reminder.lastPaidMonth!)}. This QR is for ${monthLabel(month)}.`
    : reminder.state === "check_in"
      ? `Your last confirmed contribution is for ${monthLabel(reminder.lastPaidMonth!)}. This QR is only for ${monthLabel(month)}; a sensei can kindly help if you would like to check any earlier months.`
      : "We do not see an earlier confirmed monthly contribution on this record. If you paid another way, a sensei can kindly help update it.";
  return <aside className={`contribution-reminder contribution-reminder--${reminder.state}`}>
    <div><CalendarClock aria-hidden="true" /><span><small>Gentle monthly reminder</small><strong>{reminder.state === "current" ? "Previous month confirmed" : reminder.state === "check_in" ? "Earlier months may need a quick check" : "No earlier month recorded"}</strong></span></div>
    <dl><div><dt>Last confirmed month</dt><dd>{reminder.lastPaidMonth ? monthLabel(reminder.lastPaidMonth) : "Not recorded"}</dd></div><div><dt>This QR is for</dt><dd>{monthLabel(month)}</dd></div></dl>
    <p>{message}</p>
  </aside>;
}

export function ContributionForm() {
  const [studentId, setStudentId] = useState("");
  const [studentName, setStudentName] = useState("");
  const [monthlyStudents, setMonthlyStudents] = useState<ContributionStudent[]>(() => [emptyContributionStudent()]);
  const [contributionType, setContributionType] = useState<"aat_annual" | "renshinkan_monthly">("renshinkan_monthly");
  const [dojos, setDojos] = useState<Dojo[]>([]);
  const [dojoId, setDojoId] = useState("");
  const [month] = useState(currentBangkokMonth);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileReset, setTurnstileReset] = useState(0);
  const [result, setResult] = useState<SubmissionResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const onToken = useCallback((value: string) => setTurnstileToken(value), []);
  const selectedDojo = dojos.find((dojo) => dojo.id === dojoId);
  const monthlyTotal = monthlyStudents.length * MONTHLY_CONTRIBUTION_AMOUNT;

  function updateMonthlyStudent(key: string, field: "studentId" | "studentName", value: string) {
    setMonthlyStudents((students) => students.map((student) => student.key === key
      ? { ...student, [field]: field === "studentId" ? value.toUpperCase() : value }
      : student));
  }

  useEffect(() => {
    let active = true;
    fetch("/api/dojos", { cache: "force-cache" }).then(async (response) => {
      if (!response.ok) throw new Error("The dojo list is unavailable.");
      const body = await response.json() as { dojos?: Dojo[] };
      if (active) setDojos(body.dojos || []);
    }).catch(() => { if (active) setDojos([]); });
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const monthlyDetailsComplete = monthlyStudents.every((student) => student.studentId.trim() && student.studentName.trim());
    if (!turnstileToken || (contributionType === "aat_annual" && (!studentId.trim() || !studentName.trim() || !dojoId)) || (contributionType === "renshinkan_monthly" && !monthlyDetailsComplete)) {
      setError("Choose the contribution and dojo, enter the student details, then complete Cloudflare verification.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/contributions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Request-ID": crypto.randomUUID() },
        body: JSON.stringify({
          studentId, studentName, month, contributionType, dojoId, turnstileToken,
          students: contributionType === "renshinkan_monthly"
            ? monthlyStudents.map(({ studentId: id, studentName: name }) => ({ studentId: id, studentName: name }))
            : undefined,
        }),
      });
      const body = await response.json() as SubmissionResult & { error?: string };
      if (!response.ok) throw new Error(body.error || "The contribution attempt could not be recorded.");
      setResult(body);
      setTurnstileToken("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The contribution attempt could not be recorded.");
      setTurnstileToken("");
      setTurnstileReset((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    const isAat = result.contributionType === "aat_annual";
    return <article className="surface contribution-confirmation" aria-live="polite">
      <header className="contribution-confirmation__header">
        <div className="contribution-confirmation__mark"><CheckCircle2 aria-hidden="true" /></div>
        <div><p className="eyebrow">{isAat ? "AAT annual fee" : "RenShinKan monthly dues"} · {result.dojoName}</p><h3>Complete payment with PromptPay</h3><p>Your payment request is ready. It will remain <strong>awaiting confirmation</strong> until the dojo reviews your uploaded payslip.</p></div>
      </header>
      {!isAat ? <section className="contribution-payment-total contribution-payment-total--confirmed" aria-label="Monthly contribution total">
        <div><span>Monthly contribution</span><strong>{baht(result.unitAmount || MONTHLY_CONTRIBUTION_AMOUNT)} × {result.studentCount || 1} student{(result.studentCount || 1) === 1 ? "" : "s"}</strong></div>
        <div><span>Pay this amount</span><strong>{baht(result.totalAmount || MONTHLY_CONTRIBUTION_AMOUNT)}</strong></div>
        {result.coveredStudents?.length ? <ul>{result.coveredStudents.map((covered) => <li key={covered.contributionId}><CheckCircle2 size={15} /> {covered.studentName} <code>{covered.studentId}</code></li>)}</ul> : null}
      </section> : null}
      {isAat || (result.studentCount || 1) === 1 ? <PaymentReminder reminder={result.reminder} month={result.month} /> : null}
      <div className="contribution-confirmation__layout">
        <figure className="contribution-qr-frame"><span>Scan to continue</span><img src={assetPath(PROMPTPAY_QR_IMAGE)} alt="PromptPay QR code for RenShinKan Dojo" width={720} height={720} /><figcaption>PromptPay · RenShinKan Dojo</figcaption></figure>
        <section className="contribution-next-steps">
          <p className="eyebrow">Three simple steps</p><h4><QrCode size={20} /> What to do next</h4>
          <ol><li><span>01</span><p>Scan the PromptPay QR and pay {isAat ? "the annual fee shown by the dojo" : baht(result.totalAmount || MONTHLY_CONTRIBUTION_AMOUNT)}.</p></li><li><span>02</span><p>Upload the payslip below. One image covers this payment.</p></li><li><span>03</span><p>A sensei will confirm {isAat ? "the payment" : `all ${result.studentCount || 1} student record${(result.studentCount || 1) === 1 ? "" : "s"}`} after checking it.</p></li></ol>
          <p className="contribution-confirmation__safety"><ShieldCheck size={17} /> Displaying the QR never marks a payment as complete.</p>
        </section>
      </div>
      <PaymentProofUpload access={result} paymentLabel={isAat ? "AAT annual contribution" : `${result.studentCount || 1}-student monthly contribution`} />
      <button className="btn-secondary contribution-start-over" type="button" onClick={() => { setResult(null); setStudentId(""); setStudentName(""); setMonthlyStudents([emptyContributionStudent()]); setDojoId(""); setTurnstileReset((value) => value + 1); }}>Start another contribution</button>
    </article>;
  }

  return <article className="surface contribution-database-form">
    <header className="contribution-form__header">
      <div className="contribution-form__seal"><HandCoins size={26} aria-hidden="true" /></div>
      <div><p className="eyebrow">Shared contribution desk</p><h3>Support your practice</h3><p>This is a place for RenShinKan students to pay their <strong>฿1,800 monthly contribution</strong>, or for students from any participating dojo to pay their AAT annual fee.</p></div>
    </header>
    <form onSubmit={submit} className="contribution-database-form__fields" noValidate>
      <fieldset className="contribution-kind">
        <legend>What would you like to pay?</legend>
        <div>
          <label className={contributionType === "renshinkan_monthly" ? "is-selected" : ""}><input className="sr-only" type="radio" name="contributionType" value="renshinkan_monthly" checked={contributionType === "renshinkan_monthly"} onChange={() => setContributionType("renshinkan_monthly")} /><HandCoins /><span><strong>Monthly dojo contribution</strong><small>฿1,800 per RenShinKan student</small></span></label>
          <label className={contributionType === "aat_annual" ? "is-selected" : ""}><input className="sr-only" type="radio" name="contributionType" value="aat_annual" checked={contributionType === "aat_annual"} onChange={() => setContributionType("aat_annual")} /><ReceiptText /><span><strong>AAT annual fee</strong><small>For every participating dojo</small></span></label>
        </div>
      </fieldset>
      <div className="contribution-fields-grid">
        {contributionType === "aat_annual" ? <>
          <label className="contribution-field--wide"><span>Your dojo <b aria-hidden="true">*</b></span><select value={dojoId} onChange={(event) => setDojoId(event.target.value)} required><option value="">Choose your dojo</option>{dojos.map((dojo) => <option key={dojo.id} value={dojo.id}>{dojo.official_name}</option>)}</select><small>Choose the dojo where your student record is held.</small></label>
          <label><span>Student ID <b aria-hidden="true">*</b></span><input id="contribution-student-id" name="studentId" value={studentId} onChange={(event) => setStudentId(event.target.value.toUpperCase())} placeholder={`${selectedDojo?.code || "DOJO"}-6901`} autoComplete="off" required /></label>
          <label><span>Student name on the record <b aria-hidden="true">*</b></span><input id="contribution-student-name" name="studentName" value={studentName} onChange={(event) => setStudentName(event.target.value)} autoComplete="name" required /></label>
        </> : <>
          <div className="contribution-dojo-note contribution-field--wide"><Landmark aria-hidden="true" /><span><small>Dojo</small><strong>RenShinKan Dojo</strong></span></div>
          <section className="contribution-student-list contribution-field--wide" aria-labelledby="monthly-students-title">
            <header><div><UsersRound aria-hidden="true" /><span><strong id="monthly-students-title">Who is this payment for?</strong><small>Add one row for each RenShinKan student covered by the same payment.</small></span></div>{monthlyStudents.length < MAX_MONTHLY_STUDENTS ? <button className="btn-secondary" type="button" onClick={() => setMonthlyStudents((students) => [...students, emptyContributionStudent()])}><Plus size={16} /> Add another student</button> : null}</header>
            <div className="contribution-student-list__rows">{monthlyStudents.map((monthlyStudent, index) => <div className="contribution-student-row" key={monthlyStudent.key}>
              <span className="contribution-student-row__number">{String(index + 1).padStart(2, "0")}</span>
              <label><span>Student ID <b aria-hidden="true">*</b></span><input value={monthlyStudent.studentId} onChange={(event) => updateMonthlyStudent(monthlyStudent.key, "studentId", event.target.value)} placeholder="RSK-6901" autoComplete="off" required /></label>
              <label><span>Student name on the record <b aria-hidden="true">*</b></span><input value={monthlyStudent.studentName} onChange={(event) => updateMonthlyStudent(monthlyStudent.key, "studentName", event.target.value)} autoComplete={index === 0 ? "name" : "off"} required /></label>
              {monthlyStudents.length > 1 ? <button type="button" className="contribution-student-row__remove" aria-label={`Remove student ${index + 1}`} onClick={() => setMonthlyStudents((students) => students.filter((entry) => entry.key !== monthlyStudent.key))}><Trash2 size={16} /></button> : <span />}
            </div>)}</div>
          </section>
          <section className="contribution-payment-total contribution-field--wide" aria-live="polite" aria-label="Calculated monthly contribution total">
            <div><span>Monthly contribution</span><strong>{baht(MONTHLY_CONTRIBUTION_AMOUNT)} × {monthlyStudents.length} student{monthlyStudents.length === 1 ? "" : "s"}</strong></div>
            <div><span>Total to pay</span><strong>{baht(monthlyTotal)}</strong></div>
            <p>Use one PromptPay payment and upload one payslip for everyone listed above.</p>
          </section>
        </>}
        <label className="contribution-field--wide"><span>{contributionType === "aat_annual" ? "Submission month" : "Contribution month"}</span><input id="contribution-month" name="month" type="month" value={month} readOnly aria-readonly="true" /><small>{contributionType === "aat_annual" ? "The dojo will apply the confirmed annual payment to your membership history." : "This request is for the current month only; earlier months are never changed automatically."}</small></label>
      </div>
      <div className="contribution-verification"><TurnstileWidget onToken={onToken} resetSignal={turnstileReset} /></div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <button className="btn-primary contribution-submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <QrCode size={17} />}{busy ? "Preparing your QR…" : "Continue to PromptPay QR"}</button>
      <p className="record-privacy"><ShieldCheck size={15} /> This creates a request with an awaiting payment status. Payment is confirmed only after a sensei reviews the payslip.</p>
    </form>
  </article>;
}
