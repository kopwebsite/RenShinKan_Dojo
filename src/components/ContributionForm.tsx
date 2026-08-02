import { CalendarClock, CheckCircle2, HandCoins, Landmark, LoaderCircle, Plus, QrCode, ReceiptText, ShieldCheck, Trash2, UsersRound } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useTranslation } from "../i18n";
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

function baht(value: number, locale?: string) {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "THB", maximumFractionDigits: 0 }).format(value);
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
  const { t } = useTranslation();
  if (reminder.kind === "aat") {
    const overdueDays = reminder.days == null ? null : Math.abs(reminder.days);
    const message = reminder.state === "overdue"
      ? t(overdueDays === 1 ? "contribution.aatOverdueOne" : "contribution.aatOverdueMany", { days: overdueDays ?? 0 })
      : reminder.state === "due_soon"
        ? t(reminder.days === 1 ? "contribution.aatDueSoonOne" : "contribution.aatDueSoonMany", { days: reminder.days ?? 0 })
        : reminder.state === "current"
          ? t("contribution.aatCurrentMessage")
          : t("contribution.aatNoHistoryMessage");
    return <aside className={`contribution-reminder contribution-reminder--${reminder.state}`}>
      <div><CalendarClock aria-hidden="true" /><span><small>{t("contribution.aatHistory")}</small><strong>{reminder.state === "overdue" ? t("contribution.renewalPassed") : reminder.state === "due_soon" ? t("contribution.renewalSoon") : reminder.state === "current" ? t("contribution.currentOnRecord") : t("contribution.noPreviousDate")}</strong></span></div>
      <dl><div><dt>{t("contribution.lastConfirmed")}</dt><dd>{reminder.lastPaidDate ? dateLabel(reminder.lastPaidDate) : t("contribution.notRecorded")}</dd></div><div><dt>{t("contribution.renewalDate")}</dt><dd>{reminder.dueDate ? dateLabel(reminder.dueDate) : t("contribution.notEstablished")}</dd></div></dl>
      <p>{message}</p>
    </aside>;
  }

  const message = reminder.state === "current"
    ? t("contribution.monthlyCurrentMessage", { lastMonth: monthLabel(reminder.lastPaidMonth!), month: monthLabel(month) })
    : reminder.state === "check_in"
      ? t("contribution.monthlyCheckMessage", { lastMonth: monthLabel(reminder.lastPaidMonth!), month: monthLabel(month) })
      : t("contribution.monthlyNoHistoryMessage");
  return <aside className={`contribution-reminder contribution-reminder--${reminder.state}`}>
    <div><CalendarClock aria-hidden="true" /><span><small>{t("contribution.monthlyReminder")}</small><strong>{reminder.state === "current" ? t("contribution.previousMonthConfirmed") : reminder.state === "check_in" ? t("contribution.earlierMonthsCheck") : t("contribution.noEarlierMonth")}</strong></span></div>
    <dl><div><dt>{t("contribution.lastConfirmedMonth")}</dt><dd>{reminder.lastPaidMonth ? monthLabel(reminder.lastPaidMonth) : t("contribution.notRecorded")}</dd></div><div><dt>{t("contribution.qrFor")}</dt><dd>{monthLabel(month)}</dd></div></dl>
    <p>{message}</p>
  </aside>;
}

export function ContributionForm() {
  const { language, t } = useTranslation();
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
  const formatAmount = (value: number) => baht(value, language);

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
      setError(t("contribution.errorMonthlyConfig"));
      return;
    }
    if (contributionType === "aat_annual" && aatContributionAmount === null) {
      setError(t("contribution.errorAatConfig"));
      return;
    }
    if (!turnstileToken || !studentDetailsComplete) {
      setError(t("contribution.errorIncomplete"));
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
      if (!response.ok) throw new Error(language === "en" && body.error ? body.error : t("contribution.errorSubmit"));
      setResult(body);
      setTurnstileToken("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("contribution.errorSubmit"));
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
    const studentCount = result.studentCount || 1;
    const studentCountLabel = t(studentCount === 1 ? "contribution.oneStudent" : "contribution.manyStudents", { count: studentCount });
    return <article className="surface contribution-confirmation" aria-live="polite">
      <header className="contribution-confirmation__header">
        <div className="contribution-confirmation__mark"><CheckCircle2 aria-hidden="true" /></div>
        <div>
          <p className="eyebrow">{isAat ? t("contribution.aatFee") : t("contribution.monthlyDues")} · {result.dojoName}</p>
          <h3>{t("contribution.completePromptPay")}</h3>
          <p>{t("contribution.readyCopy")}</p>
        </div>
      </header>
      <section className="contribution-payment-total contribution-payment-total--confirmed" aria-label={t("contribution.requestTotal")}>
        <div><span>{isAat ? t("contribution.aatAnnual") : t("contribution.monthly")}</span><strong>{confirmedUnitAmount === null ? t("contribution.amountUnavailable") : formatAmount(confirmedUnitAmount)} × {studentCountLabel}</strong></div>
        <div><span>{t("contribution.payThisAmount")}</span><strong>{confirmedTotalAmount === null ? t("contribution.askSensei") : formatAmount(confirmedTotalAmount)}</strong></div>
        {result.coveredStudents?.length ? <ul>{result.coveredStudents.map((covered) => <li key={covered.contributionId}>
          <CheckCircle2 size={15} aria-hidden="true" /><span><strong>{covered.studentName}</strong><code>{covered.studentId}</code><small>{covered.dojoName} · {formatAmount(covered.amount)} · {t("contribution.awaitingPayment")}</small>{covered.reminder.kind === "aat" ? <small>{t("contribution.lastConfirmed")}: {covered.reminder.lastPaidDate ? dateLabel(covered.reminder.lastPaidDate) : t("contribution.notRecorded")} · {t("contribution.nextDue")}: {covered.reminder.dueDate ? dateLabel(covered.reminder.dueDate) : t("contribution.notEstablished")}</small> : <small>{t("contribution.lastConfirmed")}: {covered.reminder.lastPaidMonth ? monthLabel(covered.reminder.lastPaidMonth) : t("contribution.notRecorded")} · {t("contribution.thisRequest")}: {monthLabel(result.month)}</small>}</span>
        </li>)}</ul> : null}
      </section>
      {studentCount === 1 ? <PaymentReminder reminder={result.reminder} month={result.month} /> : null}
      <div className="contribution-confirmation__layout">
        <figure className="contribution-qr-frame"><span>{t("contribution.scanToContinue")}</span><img src={assetPath(content.paymentQr.src)} alt={content.paymentQr.alt} width={720} height={720} /><figcaption>PromptPay · RenShinKan Dojo</figcaption></figure>
        <section className="contribution-next-steps">
          <p className="eyebrow">{t("contribution.threeSteps")}</p><h4><QrCode size={20} /> {t("contribution.whatNext")}</h4>
          <ol>
            <li><span>01</span><p>{confirmedTotalAmount === null ? t("contribution.stepPaySensei") : t("contribution.stepPay", { amount: formatAmount(confirmedTotalAmount) })}</p></li>
            <li><span>02</span><p>{t("contribution.stepUpload")}</p></li>
            <li><span>03</span><p>{t(studentCount === 1 ? "contribution.stepConfirmOne" : "contribution.stepConfirmMany", { count: studentCount })}</p></li>
          </ol>
          <p className="contribution-confirmation__safety"><ShieldCheck size={17} /> {t("contribution.qrSafety")}</p>
        </section>
      </div>
      <PaymentProofUpload access={result} paymentLabel={t(isAat ? "contribution.proofLabelAat" : "contribution.proofLabelMonthly", { count: studentCount })} />
      <button className="btn-secondary contribution-start-over" type="button" onClick={() => { setResult(null); setMonthlyStudents([emptyContributionStudent()]); setTurnstileReset((value) => value + 1); }}>{t("contribution.startAnother")}</button>
    </article>;
  }

  return <article className="surface contribution-database-form">
    <header className="contribution-form__header">
      <div className="contribution-form__seal"><HandCoins size={26} aria-hidden="true" /></div>
      <div><p className="eyebrow">{t("contribution.desk")}</p><h3>{t("contribution.supportPractice")}</h3><p>{t("contribution.summaryMonthly")}: <strong>{monthlyContributionAmount === null ? t("contribution.temporarilyUnavailable") : formatAmount(monthlyContributionAmount)}</strong> {t("contribution.perStudent")}. {t("contribution.summaryAat")}: <strong>{aatContributionAmount === null ? t("contribution.temporarilyUnavailable") : formatAmount(aatContributionAmount)}</strong> {t("contribution.perStudent")}, {t("contribution.fromParticipatingDojos")}.</p></div>
    </header>
    <form onSubmit={submit} className="contribution-database-form__fields" noValidate>
      <fieldset className="contribution-kind">
        <legend>{t("contribution.whatPay")}</legend>
        <div>
          <label className={contributionType === "renshinkan_monthly" ? "is-selected" : ""}><input className="sr-only" type="radio" name="contributionType" value="renshinkan_monthly" checked={contributionType === "renshinkan_monthly"} disabled={configurationLoaded && monthlyContributionAmount === null} onChange={() => setContributionType("renshinkan_monthly")} /><HandCoins /><span><strong>{t("contribution.monthlyOption")}</strong><small>{!configurationLoaded ? t("contribution.loadingAmount") : monthlyContributionAmount === null ? t("contribution.temporarilyUnavailable") : t("contribution.perRskStudent", { amount: formatAmount(monthlyContributionAmount) })}</small></span></label>
          <label className={contributionType === "aat_annual" ? "is-selected" : ""}><input className="sr-only" type="radio" name="contributionType" value="aat_annual" checked={contributionType === "aat_annual"} disabled={configurationLoaded && aatContributionAmount === null} onChange={() => setContributionType("aat_annual")} /><ReceiptText /><span><strong>{t("contribution.aatOption")}</strong><small>{!configurationLoaded ? t("contribution.loadingAmount") : aatContributionAmount === null ? t("contribution.temporarilyUnavailable") : t("contribution.perAllDojos", { amount: formatAmount(aatContributionAmount) })}</small></span></label>
        </div>
      </fieldset>
      <div className="contribution-fields-grid">
        {contributionType === "renshinkan_monthly" ? <div className="contribution-dojo-note contribution-field--wide"><Landmark aria-hidden="true" /><span><small>{t("contribution.dojo")}</small><strong>RenShinKan Dojo</strong></span></div> : null}
        <section className="contribution-student-list contribution-field--wide" aria-labelledby="contribution-students-title">
          <header><div><UsersRound aria-hidden="true" /><span><strong id="contribution-students-title">{t("contribution.who")}</strong><small>{t("contribution.coveredRows")}</small></span></div>{monthlyStudents.length < MAX_MONTHLY_STUDENTS ? <button className="btn-secondary" type="button" onClick={() => setMonthlyStudents((students) => [...students, emptyContributionStudent()])}><Plus size={16} /> {t("contribution.addStudent")}</button> : null}</header>
          <div className="contribution-student-list__rows">{monthlyStudents.map((student, index) => <div className={`contribution-student-row${contributionType === "aat_annual" ? " contribution-student-row--aat" : ""}`} key={student.key}>
            <span className="contribution-student-row__number">{String(index + 1).padStart(2, "0")}</span>
            {contributionType === "aat_annual" ? <label><span>{t("contribution.dojo")} <b aria-hidden="true">*</b></span><select value={student.dojoId} onChange={(event) => updateMonthlyStudent(student.key, "dojoId", event.target.value)} required><option value="">{t("contribution.chooseDojo")}</option>{dojos.map((dojo) => <option key={dojo.id} value={dojo.id}>{dojo.official_name}</option>)}</select></label> : null}
            <label><span>{t("contribution.studentId")} <b aria-hidden="true">*</b></span><input value={student.studentId} onChange={(event) => updateMonthlyStudent(student.key, "studentId", event.target.value)} placeholder={contributionType === "aat_annual" ? `${dojos.find((dojo) => dojo.id === student.dojoId)?.code || "DOJO"}-6901`
                          : "RSK-6901"
                      }
                      autoComplete="off"
                      required
                    />
                  </label>
            <label><span>{t("contribution.studentName")} <b aria-hidden="true">*</b></span><input value={student.studentName} onChange={(event) => updateMonthlyStudent(student.key, "studentName", event.target.value)} autoComplete={index === 0 ? "name" : "off"} required /></label>
            {monthlyStudents.length > 1 ? <button type="button" className="contribution-student-row__remove" aria-label={t("contribution.removeStudent", { number: index + 1 })} onClick={() => setMonthlyStudents((students) => students.filter((entry) => entry.key !== student.key))}><Trash2 size={16} /></button> : <span />}
          </div>)}</div>
        </section>
        <section className="contribution-payment-total contribution-field--wide" aria-live="polite" aria-label={t("contribution.calculatedTotal")}>
          <div><span>{contributionType === "aat_annual" ? t("contribution.aatAnnual") : t("contribution.monthly")}</span><strong>{unitAmount === null ? t("contribution.amountUnavailable") : formatAmount(unitAmount)} × {t(monthlyStudents.length === 1 ? "contribution.oneStudent" : "contribution.manyStudents", { count: monthlyStudents.length })}</strong></div>
          <div><span>{t("contribution.totalToPay")}</span><strong>{contributionTotal === null ? t("contribution.askSensei") : formatAmount(contributionTotal)}</strong></div>
          <p>{t("contribution.serverVerifies")}</p>
        </section>
        <label className="contribution-field--wide"><span>{contributionType === "aat_annual" ? t("contribution.submissionMonth") : t("contribution.contributionMonth")}</span><input id="contribution-month" name="month" type="text" value={formatGregorianMonth(month, month)} readOnly aria-readonly="true" /><small>{contributionType === "aat_annual" ? t("contribution.annualHistory") : t("contribution.currentMonthOnly")}</small></label>
      </div>
      <div className="contribution-verification"><TurnstileWidget onToken={onToken} resetSignal={turnstileReset} /></div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <button className="btn-primary contribution-submit" disabled={busy || !configurationLoaded || unitAmount === null}>{busy ? <LoaderCircle className="spin" size={17} /> : <QrCode size={17} />}{busy ? t("contribution.preparingQr") : contributionTotal === null ? t("contribution.continueQr") : t("contribution.continueAmount", { amount: formatAmount(contributionTotal) })}</button>
      <p className="record-privacy"><ShieldCheck size={15} /> {t("contribution.privacy")}</p>
    </form>
  </article>;
}
