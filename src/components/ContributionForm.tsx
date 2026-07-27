import { CalendarClock, CheckCircle2, HandCoins, Landmark, LoaderCircle, Plus, QrCode, ReceiptText, ShieldCheck, Trash2, UsersRound } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useEditableContent } from "../lib/content";
import { assetPath } from "../utils/assetPath";
import { PaymentProofUpload, type PaymentProofAccess } from "./PaymentProofUpload";
import { TurnstileWidget } from "./TurnstileWidget";
import { currentBangkokMonthKey, formatGregorianDate, formatGregorianMonth } from "../../shared/date";

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
  coveredStudents?: Array<{
    contributionId: string; studentId: string; studentName: string; dojoId: string; dojoName: string;
    amount: number; status: "awaiting_payment"; reminder: AatReminder | MonthlyReminder;
  }>;
  studentCount?: number;
  unitAmount?: number;
  totalAmount?: number;
} & PaymentProofAccess;
type ContributionStudent = { key: string; studentId: string; studentName: string; dojoId: string };
type ContributionConfiguration = {
  monthlyContribution?: { amount?: number | null; currency?: string; available?: boolean };
  aatAnnualContribution?: { amount?: number | null; currency?: string; available?: boolean };
};

function emptyContributionStudent(): ContributionStudent {
  return { key: crypto.randomUUID(), studentId: "", studentName: "", dojoId: "" };
}

function baht(value: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "THB", maximumFractionDigits: 0 }).format(value);
}

function currentBangkokMonth() {
  return currentBangkokMonthKey();
}

function monthLabel(value: string) {
  return formatGregorianMonth(value, value);
}

function dateLabel(value: string) {
  return formatGregorianDate(value, value);
}

function PaymentReminder({ reminder, month }: { reminder: AatReminder | MonthlyReminder; month: string }) {
  if (reminder.kind === "aat") {
    const overdueDays = reminder.days == null ? null : Math.abs(reminder.days);
    const message = reminder.state === "overdue"
      ? `Your renewal date has passed by ${overdueDays} day${overdueDays === 1 ? "" : "s"}. You are welcome to use this QR to bring the record up to date.`
      : reminder.state === "due_soon"
        ? `Your renewal date is approaching in ${reminder.days} day${reminder.days === 1 ? "" : "s"}. This QR can be used for the next annual period.`
        : reminder.state === "current"
          ? "Your record is currently within its annual period. If you are paying ahead, the dojo will review the payment proof before updating it."
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
  const { content } = useEditableContent();
  const [monthlyStudents, setMonthlyStudents] = useState<ContributionStudent[]>(() => [emptyContributionStudent()]);
  const [contributionType, setContributionType] = useState<"aat_annual" | "renshinkan_monthly">("renshinkan_monthly");
  const [dojos, setDojos] = useState<Dojo[]>([]);
  const [monthlyContributionAmount, setMonthlyContributionAmount] = useState<number | null>(null);
  const [aatContributionAmount, setAatContributionAmount] = useState<number | null>(null);
  const [configurationLoaded, setConfigurationLoaded] = useState(false);
  const [month] = useState(currentBangkokMonth);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileReset, setTurnstileReset] = useState(0);
  const [result, setResult] = useState<SubmissionResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const onToken = useCallback((value: string) => setTurnstileToken(value), []);
  const unitAmount = contributionType === "aat_annual" ? aatContributionAmount : monthlyContributionAmount;
  const contributionTotal = unitAmount === null ? null : monthlyStudents.length * unitAmount;

  function updateMonthlyStudent(key: string, field: "studentId" | "studentName" | "dojoId", value: string) {
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
    fetch("/api/contributions", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("The contribution configuration is unavailable.");
      const body = await response.json() as ContributionConfiguration;
      const amount = body.monthlyContribution?.amount;
      const aatAmount = body.aatAnnualContribution?.amount;
      if (active) setMonthlyContributionAmount(typeof amount === "number" && Number.isSafeInteger(amount) && amount > 0 ? amount : null);
      if (active) setAatContributionAmount(typeof aatAmount === "number" && Number.isSafeInteger(aatAmount) && aatAmount > 0 ? aatAmount : null);
    }).catch(() => { if (active) { setMonthlyContributionAmount(null); setAatContributionAmount(null); } }).finally(() => { if (active) setConfigurationLoaded(true); });
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const studentDetailsComplete = monthlyStudents.every((student) =>
      student.studentId.trim() && student.studentName.trim()
      && (contributionType === "renshinkan_monthly" || student.dojoId));
    if (contributionType === "renshinkan_monthly" && monthlyContributionAmount === null) {
      setError("The monthly contribution amount is not configured. Please ask a sensei for help.");
      return;
    }
    if (contributionType === "aat_annual" && aatContributionAmount === null) {
      setError("The AAT annual contribution amount is unavailable. Please ask a sensei for help.");
      return;
    }
    if (!turnstileToken || !studentDetailsComplete) {
      setError("Choose the contribution and dojo, enter the student details, then complete Cloudflare verification.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/contributions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Request-ID": crypto.randomUUID() },
        body: JSON.stringify({
          month, contributionType, turnstileToken,
          students: monthlyStudents.map(({ studentId, studentName, dojoId }) => ({
            studentId, studentName, dojoId: contributionType === "renshinkan_monthly" ? undefined : dojoId,
          })),
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
    const confirmedUnitAmount = typeof result.unitAmount === "number" ? result.unitAmount : null;
    const confirmedTotalAmount = typeof result.totalAmount === "number" ? result.totalAmount : null;
    return <article className="surface contribution-confirmation" aria-live="polite">
      <header className="contribution-confirmation__header">
        <div className="contribution-confirmation__mark"><CheckCircle2 aria-hidden="true" /></div>
        <div><p className="eyebrow">{isAat ? "AAT annual fee" : "RenShinKan monthly dues"} · {result.dojoName}</p><h3>Complete payment with PromptPay</h3><p>Your payment request is ready. It will remain <strong>awaiting confirmation</strong> until the dojo reviews your uploaded payment proof.</p></div>
      </header>
      <section className="contribution-payment-total contribution-payment-total--confirmed" aria-label="Contribution request total">
        <div><span>{isAat ? "AAT annual contribution" : "Monthly contribution"}</span><strong>{confirmedUnitAmount === null ? "Amount unavailable" : baht(confirmedUnitAmount)} × {result.studentCount || 1} student{(result.studentCount || 1) === 1 ? "" : "s"}</strong></div>
        <div><span>Pay this amount</span><strong>{confirmedTotalAmount === null ? "Ask a sensei" : baht(confirmedTotalAmount)}</strong></div>
        {result.coveredStudents?.length ? <ul>{result.coveredStudents.map((covered) => <li key={covered.contributionId}>
          <CheckCircle2 size={15} aria-hidden="true" /><span><strong>{covered.studentName}</strong><code>{covered.studentId}</code><small>{covered.dojoName} · {baht(covered.amount)} · Awaiting payment</small>{covered.reminder.kind === "aat" ? <small>Last confirmed: {covered.reminder.lastPaidDate ? dateLabel(covered.reminder.lastPaidDate) : "Not recorded"} · Next due: {covered.reminder.dueDate ? dateLabel(covered.reminder.dueDate) : "Not established"}</small> : <small>Last confirmed: {covered.reminder.lastPaidMonth ? monthLabel(covered.reminder.lastPaidMonth) : "Not recorded"} · This request: {monthLabel(result.month)}</small>}</span>
        </li>)}</ul> : null}
      </section>
      {(result.studentCount || 1) === 1 ? <PaymentReminder reminder={result.reminder} month={result.month} /> : null}
      <div className="contribution-confirmation__layout">
        <figure className="contribution-qr-frame"><span>Scan to continue</span><img src={assetPath(content.paymentQr.src)} alt={content.paymentQr.alt} width={720} height={720} /><figcaption>PromptPay · RenShinKan Dojo</figcaption></figure>
        <section className="contribution-next-steps">
          <p className="eyebrow">Three simple steps</p><h4><QrCode size={20} /> What to do next</h4>
          <ol><li><span>01</span><p>Scan the PromptPay QR and pay {confirmedTotalAmount === null ? "the amount confirmed by a sensei" : baht(confirmedTotalAmount)}.</p></li><li><span>02</span><p>Upload the payment proof below. One image covers this payment.</p></li><li><span>03</span><p>A sensei will confirm all {result.studentCount || 1} student record{(result.studentCount || 1) === 1 ? "" : "s"} after checking it.</p></li></ol>
          <p className="contribution-confirmation__safety"><ShieldCheck size={17} /> Displaying the QR never marks a payment as complete.</p>
        </section>
      </div>
      <PaymentProofUpload access={result} paymentLabel={`${result.studentCount || 1}-student ${isAat ? "AAT annual" : "monthly"} contribution`} />
      <button className="btn-secondary contribution-start-over" type="button" onClick={() => { setResult(null); setMonthlyStudents([emptyContributionStudent()]); setTurnstileReset((value) => value + 1); }}>Start another contribution</button>
    </article>;
  }

  return <article className="surface contribution-database-form">
    <header className="contribution-form__header">
      <div className="contribution-form__seal"><HandCoins size={26} aria-hidden="true" /></div>
      <div><p className="eyebrow">Shared contribution desk</p><h3>Support your practice</h3><p>RenShinKan monthly contribution: <strong>{monthlyContributionAmount === null ? "temporarily unavailable" : baht(monthlyContributionAmount)}</strong> per student. AAT annual contribution: <strong>{aatContributionAmount === null ? "temporarily unavailable" : baht(aatContributionAmount)}</strong> per student from any participating dojo.</p></div>
    </header>
    <form onSubmit={submit} className="contribution-database-form__fields" noValidate>
      <fieldset className="contribution-kind">
        <legend>What would you like to pay?</legend>
        <div>
          <label className={contributionType === "renshinkan_monthly" ? "is-selected" : ""}><input className="sr-only" type="radio" name="contributionType" value="renshinkan_monthly" checked={contributionType === "renshinkan_monthly"} disabled={configurationLoaded && monthlyContributionAmount === null} onChange={() => setContributionType("renshinkan_monthly")} /><HandCoins /><span><strong>Monthly dojo contribution</strong><small>{!configurationLoaded ? "Loading current amount…" : monthlyContributionAmount === null ? "Temporarily unavailable" : `${baht(monthlyContributionAmount)} per RenShinKan student`}</small></span></label>
          <label className={contributionType === "aat_annual" ? "is-selected" : ""}><input className="sr-only" type="radio" name="contributionType" value="aat_annual" checked={contributionType === "aat_annual"} disabled={configurationLoaded && aatContributionAmount === null} onChange={() => setContributionType("aat_annual")} /><ReceiptText /><span><strong>AAT annual contribution</strong><small>{!configurationLoaded ? "Loading current amount…" : aatContributionAmount === null ? "Temporarily unavailable" : `${baht(aatContributionAmount)} per student · all participating dojos`}</small></span></label>
        </div>
      </fieldset>
      <div className="contribution-fields-grid">
        {contributionType === "renshinkan_monthly" ? <div className="contribution-dojo-note contribution-field--wide"><Landmark aria-hidden="true" /><span><small>Dojo</small><strong>RenShinKan Dojo</strong></span></div> : null}
        <section className="contribution-student-list contribution-field--wide" aria-labelledby="contribution-students-title">
          <header><div><UsersRound aria-hidden="true" /><span><strong id="contribution-students-title">Who is this payment for?</strong><small>Add one row for each student covered by the same payment and payment proof.</small></span></div>{monthlyStudents.length < MAX_MONTHLY_STUDENTS ? <button className="btn-secondary" type="button" onClick={() => setMonthlyStudents((students) => [...students, emptyContributionStudent()])}><Plus size={16} /> Add another student</button> : null}</header>
          <div className="contribution-student-list__rows">{monthlyStudents.map((student, index) => <div className={`contribution-student-row${contributionType === "aat_annual" ? " contribution-student-row--aat" : ""}`} key={student.key}>
            <span className="contribution-student-row__number">{String(index + 1).padStart(2, "0")}</span>
            {contributionType === "aat_annual" ? <label><span>Dojo <b aria-hidden="true">*</b></span><select value={student.dojoId} onChange={(event) => updateMonthlyStudent(student.key, "dojoId", event.target.value)} required><option value="">Choose dojo</option>{dojos.map((dojo) => <option key={dojo.id} value={dojo.id}>{dojo.official_name}</option>)}</select></label> : null}
            <label><span>Student ID <b aria-hidden="true">*</b></span><input value={student.studentId} onChange={(event) => updateMonthlyStudent(student.key, "studentId", event.target.value)} placeholder={contributionType === "aat_annual" ? `${dojos.find((dojo) => dojo.id === student.dojoId)?.code || "DOJO"}-6901` : "RSK-2601"} autoComplete="off" required /></label>
            <label><span>Student name on the record <b aria-hidden="true">*</b></span><input value={student.studentName} onChange={(event) => updateMonthlyStudent(student.key, "studentName", event.target.value)} autoComplete={index === 0 ? "name" : "off"} required /></label>
            {monthlyStudents.length > 1 ? <button type="button" className="contribution-student-row__remove" aria-label={`Remove student ${index + 1}`} onClick={() => setMonthlyStudents((students) => students.filter((entry) => entry.key !== student.key))}><Trash2 size={16} /></button> : <span />}
          </div>)}</div>
        </section>
        <section className="contribution-payment-total contribution-field--wide" aria-live="polite" aria-label="Calculated contribution total">
          <div><span>{contributionType === "aat_annual" ? "AAT annual contribution" : "Monthly contribution"}</span><strong>{unitAmount === null ? "Amount unavailable" : baht(unitAmount)} × {monthlyStudents.length} student{monthlyStudents.length === 1 ? "" : "s"}</strong></div>
          <div><span>Total to pay</span><strong>{contributionTotal === null ? "Ask a sensei" : baht(contributionTotal)}</strong></div>
          <p>The server verifies each student and recalculates this total. Use one PromptPay payment and one payment proof.</p>
        </section>
        <label className="contribution-field--wide"><span>{contributionType === "aat_annual" ? "Submission month" : "Contribution month"}</span><input id="contribution-month" name="month" type="text" value={formatGregorianMonth(month, month)} readOnly aria-readonly="true" /><small>{contributionType === "aat_annual" ? "The dojo will apply the confirmed annual payment to your membership history." : "This request is for the current month only; earlier months are never changed automatically."}</small></label>
      </div>
      <div className="contribution-verification"><TurnstileWidget onToken={onToken} resetSignal={turnstileReset} /></div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <button className="btn-primary contribution-submit" disabled={busy || !configurationLoaded || unitAmount === null}>{busy ? <LoaderCircle className="spin" size={17} /> : <QrCode size={17} />}{busy ? "Preparing your QR…" : contributionTotal === null ? "Continue to PromptPay QR" : `Continue · ${baht(contributionTotal)}`}</button>
      <p className="record-privacy"><ShieldCheck size={15} /> This creates a request with an awaiting payment status. Payment is confirmed only after a sensei reviews the payment proof.</p>
    </form>
  </article>;
}
