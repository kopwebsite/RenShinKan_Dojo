import { CheckCircle2, HandCoins, LoaderCircle, QrCode, ShieldCheck } from "lucide-react";
import { FormEvent, useCallback, useState } from "react";
import { TurnstileWidget } from "./TurnstileWidget";
import { useTranslation } from "../i18n";
import { assetPath } from "../utils/assetPath";
import { PaymentProofUpload, type PaymentProofAccess } from "./PaymentProofUpload";

const PROMPTPAY_QR_IMAGE = "/images/promptpay-qr.png";

function currentBangkokMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return year && month ? `${year}-${month}` : new Date().toISOString().slice(0, 7);
}

function monthLabel(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" })
    .format(new Date(Date.UTC(year, month - 1, 1)));
}

type SubmissionResult = { contributionId: string; month: string; status: "awaiting_payment"; contributionType: "aat_annual" | "renshinkan_monthly" } & PaymentProofAccess;

export function ContributionForm() {
  const { t } = useTranslation();
  const [studentId, setStudentId] = useState("");
  const [studentName, setStudentName] = useState("");
  const [contributionType, setContributionType] = useState<"aat_annual" | "renshinkan_monthly">("renshinkan_monthly");
  const [month] = useState(currentBangkokMonth);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileReset, setTurnstileReset] = useState(0);
  const [result, setResult] = useState<SubmissionResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const onToken = useCallback((value: string) => setTurnstileToken(value), []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!studentId.trim() || !studentName.trim() || !turnstileToken) {
      setError("Enter the Student ID and student name, then complete Cloudflare verification.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/contributions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Request-ID": crypto.randomUUID() },
        body: JSON.stringify({ studentId, studentName, month, contributionType, turnstileToken }),
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
    return <article className="surface contribution-confirmation rounded-[2rem] p-4 min-[380px]:p-6 sm:p-8 lg:p-10" aria-live="polite">
      <div className="contribution-confirmation__mark"><CheckCircle2 aria-hidden="true" /></div>
      <p className="eyebrow">{result.contributionType === "aat_annual" ? "AAT Annual Contribution" : "Monthly RenShinKan Student Contribution"} · {monthLabel(result.month)}</p>
      <h3>Complete payment with PromptPay</h3>
      <p>Your contribution is <strong>awaiting payment</strong>. Displaying this QR code does not mean that payment has been completed or confirmed.</p>
      <div className="contribution-confirmation__layout">
        <img src={assetPath(PROMPTPAY_QR_IMAGE)} alt="PromptPay QR code for RenShinKan Dojo" width={720} height={720} />
        <section>
          <h4><QrCode size={20} /> What to do next</h4>
          <ol>
            <li>Scan the existing RenShinKan PromptPay QR code and complete the payment.</li>
            <li>Upload your payslip below so the dojo can review the payment.</li>
            <li>Wait for a sensei to approve the payslip and confirm the payment.</li>
          </ol>
          <p><ShieldCheck size={17} /> Only an authenticated administrator can mark a contribution as paid.</p>
        </section>
      </div>
      <PaymentProofUpload access={result} paymentLabel={result.contributionType === "aat_annual" ? "AAT annual contribution" : "monthly contribution"} />
      <button className="btn-secondary" type="button" onClick={() => { setResult(null); setStudentId(""); setStudentName(""); setTurnstileReset((value) => value + 1); }}>
        Record another student
      </button>
    </article>;
  }

  return <article className="surface contribution-database-form rounded-[2rem] p-4 min-[380px]:p-6 sm:p-8 lg:p-10">
    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-bamboo/15 text-bamboo">
      <HandCoins size={26} aria-hidden="true" />
    </div>
    <h3 className="mt-5 text-3xl text-ink">{t("support.contribution.title")}</h3>
    <p className="mt-4 text-sm leading-6 text-charcoal/75">Enter the student record details for this month. The Student ID is the primary match; small spacing or capitalization differences in the name are accepted.</p>
    <form onSubmit={submit} className="contribution-database-form__fields" noValidate>
      <label>
        <span>Contribution type <b aria-hidden="true">*</b></span>
        <select value={contributionType} onChange={(event) => setContributionType(event.target.value as typeof contributionType)} required>
          <option value="aat_annual">AAT Annual Contribution</option>
          <option value="renshinkan_monthly">Monthly RenShinKan Student Contribution</option>
        </select>
        <small>AAT contributions are available to every participating dojo. Monthly contributions are for RenShinKan students only.</small>
      </label>
      <label>
        <span>Student ID <b aria-hidden="true">*</b></span>
        <input id="contribution-student-id" name="studentId" value={studentId} onChange={(event) => setStudentId(event.target.value.toUpperCase())} placeholder="RSK-6901" autoComplete="off" required />
      </label>
      <label>
        <span>Student name as shown on the record <b aria-hidden="true">*</b></span>
        <input id="contribution-student-name" name="studentName" value={studentName} onChange={(event) => setStudentName(event.target.value)} autoComplete="name" required />
      </label>
      <label>
        <span>Contribution month</span>
        <input id="contribution-month" name="month" type="month" value={month} readOnly aria-readonly="true" />
        <small>Each month is stored separately. A paid status is never copied into the next month.</small>
      </label>
      <TurnstileWidget onToken={onToken} resetSignal={turnstileReset} />
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <button className="btn-primary" disabled={busy}>
        {busy ? <LoaderCircle className="spin" size={17} /> : <QrCode size={17} />}
        {busy ? "Recording attempt…" : "Continue to PromptPay QR"}
      </button>
      <p className="record-privacy"><ShieldCheck size={15} /> This form creates an awaiting-payment record only. It never marks the contribution as paid.</p>
    </form>
  </article>;
}
