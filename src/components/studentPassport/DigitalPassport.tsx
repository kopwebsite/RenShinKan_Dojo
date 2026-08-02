import { useEffect, useId, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import {
  BadgeCheck,
  AlertTriangle,
  BookOpen,
  Camera,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleX,
  Clock3,
  ExternalLink,
  FileClock,
  GraduationCap,
  History,
  LoaderCircle,
  ReceiptText,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useTranslation } from "../../i18n";
import type {
  PassportAatContribution,
  PassportPaymentProof,
  PassportPaymentAlert,
  PassportRequest,
  PassportMonthlyContribution,
  PublicExamination,
  PublicStudentRecord,
  StudentPassportRecord,
} from "../../types/studentRecord";
import { BeltMark } from "../BeltMark";
import { PaymentProofUpload } from "../PaymentProofUpload";
import { formatGregorianDate, formatGregorianMonth } from "../../../shared/date";
import styles from "./DigitalPassport.module.css";
import { useScopedRecordTranslations } from "../../i18n/scopedRecords";
import { prepareProfilePhoto } from "../../utils/profilePhoto";

type PassportTab = "identity" | "training" | "examinations" | "contributions" | "requests";
type TabDefinition = { id: PassportTab; label: string; Icon: ComponentType<{ size?: number; "aria-hidden"?: boolean }> };

const PUBLIC_TABS: TabDefinition[] = [
  { id: "identity", label: "Student Identity", Icon: BookOpen },
  { id: "training", label: "Training Record", Icon: Clock3 },
  { id: "examinations", label: "Examination History", Icon: GraduationCap },
];

const OWNER_TABS: TabDefinition[] = [
  ...PUBLIC_TABS,
  { id: "contributions", label: "Contributions", Icon: ReceiptText },
  { id: "requests", label: "Requests & Notices", Icon: History },
];

function isOwnerRecord(record: PublicStudentRecord | StudentPassportRecord): record is StudentPassportRecord {
  return "trainingEntries" in record && Array.isArray(record.trainingEntries);
}

function date(value?: string | null) {
  return formatGregorianDate(value, "Not recorded");
}

function month(value: string) {
  return formatGregorianMonth(value, value);
}

function sourceLabel(value: string) {
  const labels: Record<string, string> = {
    admin_manual: "Sensei entry",
    admin_bulk: "Sensei group entry",
    student_request: "Approved request",
    student_self_service: "Approved request",
  };
  return labels[value] || value.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function trainingDetails(entry: StudentPassportRecord["trainingEntries"][number]) {
  return entry.organization || entry.sourceDetails || entry.location || (entry.sourceType ? sourceLabel(entry.sourceType) : sourceLabel(entry.source));
}

function rankLabel(exam: PublicExamination) {
  return exam.rank_after || exam.rank_attempted || exam.belt_awarded || exam.rank || "Rank recorded";
}

function examinationResult(exam: PublicExamination) {
  if (exam.passed === 1) return { label: "Passed", className: styles.verifiedInk, Icon: CheckCircle2 };
  if (exam.passed === 0) return { label: "Attempt", className: styles.deniedInk, Icon: FileClock };
  return { label: "Recorded", className: styles.statusNeutral, Icon: History };
}

function PassportPage({ folio, eyebrow, title, children, className = "" }: {
  folio: string; eyebrow: string; title: string; children: ReactNode; className?: string;
}) {
  return <section className={`${styles.page} ${className}`}>
    <header className={styles.pageHeader}><span>{folio}</span><div><p>{eyebrow}</p><h3>{title}</h3></div></header>
    <div className={styles.pageBody}>{children}</div>
  </section>;
}

function EmptyState({ Icon, title, copy }: { Icon: ComponentType<{ "aria-hidden"?: boolean }>; title: string; copy: string }) {
  return <div className={styles.empty}><Icon aria-hidden="true" /><strong>{title}</strong><p>{copy}</p></div>;
}

function VerificationSeal({ approved }: { approved: boolean }) {
  return <div className={`${styles.seal} ${approved ? "" : styles.sealPending}`} role="img" aria-label={approved ? "Approved and verified by the dojo" : "Pending administrator review"}>
    {approved ? <BadgeCheck aria-hidden="true" /> : <FileClock aria-hidden="true" />}
    <span>DOJO</span><strong>{approved ? "VERIFIED" : "PENDING"}</strong><small>{approved ? "APPROVED RECORD" : "ADMIN REVIEW"}</small>
  </div>;
}

function OwnerPhotoControl({ record, onRecordChange }: {
  record: StudentPassportRecord;
  onRecordChange?: (record: StudentPassportRecord) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function choose(file?: File) {
    if (!file || !record.studentAccessToken) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const prepared = await prepareProfilePhoto(file);
      const data = new FormData();
      data.set("studentId", record.studentId);
      data.set("accessToken", record.studentAccessToken);
      data.set("file", prepared);
      const response = await fetch("/api/records/profile-photo", {
        method: "POST", body: data, headers: { "X-Request-ID": crypto.randomUUID() },
      });
      const body = await response.json() as { profileImage?: string; error?: string };
      if (!response.ok || !body.profileImage) throw new Error(body.error || "The profile photo could not be changed.");
      onRecordChange?.({ ...record, profileImage: body.profileImage });
      setNotice("Profile photo updated. Look up your record again before submitting another change.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The profile photo could not be changed.");
    } finally {
      setBusy(false);
    }
  }

  return <div className={styles.photoControl}>
    <label>
      {busy ? <LoaderCircle className={styles.spin} aria-hidden="true" /> : <Camera aria-hidden="true" />}
      <span>{busy ? "Preparing photo…" : "Change profile photo"}</span>
      <input type="file" accept="image/*" disabled={busy} onChange={(event) => void choose(event.target.files?.[0])} />
    </label>
    <small>JPEG, PNG, WebP, HEIC, or HEIF. The image is cropped and optimized before upload.</small>
    {notice ? <p role="status">{notice}</p> : null}
    {error ? <p role="alert" className={styles.photoError}>{error}</p> : null}
  </div>;
}

function IdentityPage({ record, owner, onRecordChange }: {
  record: PublicStudentRecord | StudentPassportRecord;
  owner: StudentPassportRecord | null;
  onRecordChange?: (record: StudentPassportRecord) => void;
}) {
  const fallback = owner?.dojoLogo;
  const approved = record.profileStatus === "approved";
  return <div className={styles.spread}>
    <PassportPage folio="01" eyebrow="会員証 / MEMBER RECORD" title="Identity Record">
      <div className={styles.identityLead}>
        {record.profileImage
          ? <img src={record.profileImage} alt={`${record.displayName} profile`} />
          : fallback
            ? <img className={styles.logoFallback} src={fallback} alt={`${record.dojoName} logo`} />
            : <div className={styles.avatarFallback} role="img" aria-label="No profile photograph"><UserRound aria-hidden="true" /></div>}
        <div><p className={styles.microLabel}>NAME / 氏名</p><h4>{record.englishName || record.displayName}</h4>{record.thaiName ? <p lang="th">{record.thaiName}</p> : null}<p>{record.studentId}</p></div>
      </div>
      <dl className={styles.identityGrid}>
        <div><dt>DOJO / 道場</dt><dd>{record.dojoName}</dd></div>
        <div><dt>CURRENT RANK / 級・段</dt><dd><BeltMark rank={record.currentBelt} legacyColor={record.beltColor} /> {record.currentBelt}</dd></div>
        <div><dt>RECORD STATUS</dt><dd>{approved ? <ShieldCheck aria-hidden="true" /> : <FileClock aria-hidden="true" />} {approved ? "Approved" : "Pending administrator review"}</dd></div>
        <div><dt>VERIFIED HOURS</dt><dd>{record.totalVerifiedTrainingHours} hours</dd></div>
      </dl>
      {owner?.studentAccessToken ? <OwnerPhotoControl record={owner} onRecordChange={onRecordChange} /> : null}
    </PassportPage>
    <PassportPage folio="02" eyebrow="REGISTRATION / 登録" title="Official Details">
      <dl className={styles.printedFields}>
        <div><dt>STUDENT ID</dt><dd>{record.studentId}</dd></div>
        {owner ? <div><dt>AAT MEMBERSHIP NUMBER</dt><dd>{owner.aatNumber || "Not assigned"}</dd></div> : null}
        {owner ? <div><dt>ACCOUNT CREATED</dt><dd>{date(owner.accountCreatedDate)}</dd></div> : null}
        {owner ? <div><dt>JOINED DOJO</dt><dd>{date(owner.dojoJoinedDate)}</dd></div> : null}
        <div><dt>LAST UPDATED</dt><dd>{date(record.lastUpdated)}</dd></div>
        {owner?.practiceDuration ? <div><dt>PRACTICE RECORD</dt><dd>{owner.practiceDuration}</dd></div> : null}
      </dl>
      <VerificationSeal approved={approved} />
    </PassportPage>
  </div>;
}

function TrainingPage({ record, owner }: { record: PublicStudentRecord | StudentPassportRecord; owner: StudentPassportRecord | null }) {
  const entries = useMemo(() => [...(owner?.trainingEntries || [])]
    .sort((left, right) => right.entryDate.localeCompare(left.entryDate) || left.id.localeCompare(right.id)), [owner?.trainingEntries]);
  const [fullHistory, setFullHistory] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(entries.length / pageSize));
  const visibleEntries = fullHistory
    ? entries.slice((page - 1) * pageSize, page * pageSize)
    : entries.slice(0, 5);
  return (
    <div className={styles.spread}>
      <PassportPage
        folio="03"
        eyebrow="稽古記録 / TRAINING"
        title="Verified Training"
      >
        <div className={styles.hoursHero}>
          <Clock3 aria-hidden="true" />
          <strong>{record.totalVerifiedTrainingHours}</strong>
          <span>verified hours</span>
        </div>
        {owner?.practiceDuration ? (
          <dl className={styles.printedFields}>
            <div>
              <dt>PRACTICE DURATION</dt>
              <dd>{owner.practiceDuration}</dd>
            </div>
          </dl>
        ) : null}
      </PassportPage>
      <PassportPage
        folio="04"
        eyebrow="LEDGER / 台帳"
        title={fullHistory ? "Full Training History" : "Recent Entries"}
      >
        {entries.length ? (
          <div
            className={styles.ledger}
            role="table"
            aria-label="Verified training entries"
          >
            <div className={styles.ledgerHead} role="row">
              <span role="columnheader">Date</span>
              <span role="columnheader">Hours</span>
              <span role="columnheader">Details</span>
              <span role="columnheader">Status</span>
            </div>
            {visibleEntries.map((entry) => (
              <div className={styles.ledgerRow} role="row" key={entry.id}>
                <time role="cell">{date(entry.entryDate)}</time>
                <strong role="cell">{entry.hours} hr</strong>
                <span role="cell">{trainingDetails(entry)}</span>
                <span role="cell" className={styles.verifiedInk}>
                  <CheckCircle2 aria-hidden="true" /> Verified
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            Icon={Clock3}
            title={owner ? "No individual entries yet" : "Verified total only"}
            copy={
              owner
                ? "The verified total is still official. Detailed entries will appear here when the dojo records them."
                : "This shared profile shows the approved total without private entry details."
            }
          />
        )}
        {entries.length > 5 ? (
          <div className={styles.historyControls}>
            <p>
              {fullHistory
                ? `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, entries.length)} of ${entries.length}`
                : `Showing 5 most recent of ${entries.length}`}
            </p>
            {fullHistory ? (
              <div>
                <button
                  type="button"
                  disabled={page === 1}
                  onClick={() => setPage((value) => value - 1)}
                >
                  Previous
                </button>
                <span>
                  Page {page} of {pageCount}
                </span>
                <button
                  type="button"
                  disabled={page === pageCount}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Next
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFullHistory(false);
                    setPage(1);
                  }}
                >
                  Back to recent
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setFullHistory(true)}>
                View full training history
              </button>
            )}
          </div>
        ) : null}
      </PassportPage>
    </div>
  );
}

function ExaminationPage({ record }: { record: PublicStudentRecord }) {
  const exams = useMemo(() => [...record.examinations].sort((left, right) =>
    right.examination_date.localeCompare(left.examination_date)
    || String(left.id || rankLabel(left)).localeCompare(String(right.id || rankLabel(right)))), [record.examinations]);
  const [fullHistory, setFullHistory] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(exams.length / pageSize));
  const visibleExams = fullHistory ? exams.slice((page - 1) * pageSize, page * pageSize) : exams.slice(0, 5);
  const latest = exams[0];
  const latestResult = latest ? examinationResult(latest) : null;
  return (
    <div className={styles.spread}>
      <PassportPage
        folio="05"
        eyebrow="審査記録 / EXAMINATION"
        title="Rank Progression"
      >
        {latest ? (
          <div className={styles.latestRank}>
            <p className={styles.microLabel}>LATEST RECORDED RESULT</p>
            <BeltMark
              rank={rankLabel(latest)}
              legacyColor={latest.belt_color}
            />
            <h4>{rankLabel(latest)}</h4>
            <p>{date(latest.examination_date)}</p>
            {latestResult ? (
              <span className={latestResult.className}>
                {latestResult.label}
              </span>
            ) : null}
          </div>
        ) : (
          <EmptyState
            Icon={GraduationCap}
            title="No examinations recorded"
            copy="Approved examination results will appear in the official ledger."
          />
        )}
      </PassportPage>
      <PassportPage
        folio="06"
        eyebrow="KYU / DAN LEDGER"
        title={
          fullHistory
            ? "Full Examination History"
            : "Recent Examination History"
        }
      >
        {exams.length ? (
          <div
            className={`${styles.ledger} ${styles.examLedger}`}
            role="table"
            aria-label="Examination history"
          >
            <div className={styles.ledgerHead} role="row">
              <span role="columnheader">Rank</span>
              <span role="columnheader">Date</span>
              <span role="columnheader">Examiner / place</span>
              <span role="columnheader">Result</span>
            </div>
            {visibleExams.map((exam, index) => {
              const result = examinationResult(exam);
              return (
                <div
                  className={styles.ledgerRow}
                  role="row"
                  key={
                    exam.id ||
                    `${exam.examination_date}-${rankLabel(exam)}-${index}`
                  }
                >
                  <strong role="cell">
                    <BeltMark
                      rank={rankLabel(exam)}
                      legacyColor={exam.belt_color}
                    />{" "}
                    {rankLabel(exam)}
                  </strong>
                  <time role="cell">{date(exam.examination_date)}</time>
                  <span role="cell">
                    {exam.examiner ||
                      exam.examination_location ||
                      "Not recorded"}
                  </span>
                  <span role="cell" className={result.className}>
                    <result.Icon aria-hidden="true" />
                    {result.label}
                  </span>
                  {exam.public_notes ? (
                    <p className={styles.rowNote}>{exam.public_notes}</p>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            Icon={GraduationCap}
            title="No examination history"
            copy="There are no approved examination entries on this record yet."
          />
        )}
        {exams.length > 5 ? (
          <div className={styles.historyControls}>
            <p>
              {fullHistory
                ? `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, exams.length)} of ${exams.length}`
                : `Showing 5 most recent of ${exams.length}`}
            </p>
            {fullHistory ? (
              <div>
                <button
                  type="button"
                  disabled={page === 1}
                  onClick={() => setPage((value) => value - 1)}
                >
                  Previous
                </button>
                <span>
                  Page {page} of {pageCount}
                </span>
                <button
                  type="button"
                  disabled={page === pageCount}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Next
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFullHistory(false);
                    setPage(1);
                  }}
                >
                  Back to recent
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setFullHistory(true)}>
                View full examination history
              </button>
            )}
          </div>
        ) : null}
      </PassportPage>
    </div>
  );
}

function aatStatus(entry: PassportAatContribution) {
  if (entry.status === "paid") return { label: "Verified", className: styles.statusApproved, Icon: CheckCircle2 };
  if (entry.proof?.status === "denied") return { label: "Action needed", className: styles.statusDenied, Icon: CircleX };
  if (entry.proof?.status === "pending_review") return { label: "Under review", className: styles.statusPending, Icon: FileClock };
  if (entry.status === "refunded") return { label: "Refunded", className: styles.statusNeutral, Icon: History };
  if (entry.status === "cancelled") return { label: "Cancelled", className: styles.statusDenied, Icon: CircleX };
  return { label: "Payment not verified", className: styles.statusPending, Icon: FileClock };
}

function monthlyStatus(entry: PassportMonthlyContribution) {
  if (entry.status === "paid") return { label: "Verified", className: styles.statusApproved, Icon: CheckCircle2 };
  if (entry.proof?.status === "denied") return { label: "Action needed", className: styles.statusDenied, Icon: CircleX };
  if (entry.proof?.status === "pending_review") return { label: "Under review", className: styles.statusPending, Icon: FileClock };
  if (entry.status === "awaiting_payment") return { label: "Payment proof needed", className: styles.statusPending, Icon: FileClock };
  return { label: "Not submitted", className: styles.statusNeutral, Icon: CalendarDays };
}

function proofStatus(proof: PassportPaymentProof | null) {
  if (!proof) return "No payment proof";
  if (proof.status === "approved") return "Payment proof verified";
  if (proof.status === "pending_review") return "Payment proof under review";
  if (proof.status === "denied") return "Replacement payment proof requested";
  return "Payment proof needed";
}

function ProofActions({ proof, record, paymentLabel }: { proof: PassportPaymentProof | null; record: StudentPassportRecord; paymentLabel: string }) {
  const [objectUrl, setObjectUrl] = useState("");
  const [contentType, setContentType] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uploaded, setUploaded] = useState(false);

  useEffect(() => () => { if (objectUrl) URL.revokeObjectURL(objectUrl); }, [objectUrl]);

  async function viewProof() {
    if (!proof || !record.studentAccessToken) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/records/payment-proofs/${encodeURIComponent(proof.id)}`, {
        headers: { Authorization: `Bearer ${record.studentAccessToken}`, "X-Student-ID": record.studentId },
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error || "The payment proof could not be opened.");
      }
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setContentType(response.headers.get("Content-Type") || proof.contentType || "application/octet-stream");
      setObjectUrl(URL.createObjectURL(await response.blob()));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The payment proof could not be opened.");
    } finally {
      setBusy(false);
    }
  }

  if (!proof) return null;
  return <div className={styles.proofActions}>
    <p><ShieldCheck aria-hidden="true" /> {uploaded ? "Payment proof under review" : proofStatus(proof)}</p>
    {proof.fileAvailable && record.studentAccessToken ? <button type="button" onClick={() => void viewProof()} disabled={busy}>
      <ExternalLink aria-hidden="true" /> {busy ? "Opening…" : "View payment proof"}
    </button> : null}
    {proof.uploadToken && !uploaded ? <PaymentProofUpload
      access={{ proofId: proof.id, uploadToken: proof.uploadToken }} paymentLabel={paymentLabel}
      replacement={proof.status === "denied"} onUploaded={() => setUploaded(true)}
    /> : null}
    {proof.studentVisibleNote ? <blockquote><strong>Note from your sensei</strong>{proof.studentVisibleNote}</blockquote> : null}
    {objectUrl ? <div className={styles.proofViewer}>
      <div><strong>Private payment proof</strong><button type="button" onClick={() => setObjectUrl("")}>Close</button></div>
      {contentType === "application/pdf" ? <iframe src={objectUrl} title={`${paymentLabel} payment proof`} /> : <img src={objectUrl} alt={`${paymentLabel} payment proof`} />}
    </div> : null}
    {error ? <p className={styles.proofError} role="alert">{error}</p> : null}
  </div>;
}

const AAT_ONLINE_REGISTRATION_URL = "https://thaiaikikai-registration.com/forms";

function PaymentAlerts({ record, openTab }: { record: StudentPassportRecord; openTab: (tab: PassportTab) => void }) {
  const { t } = useTranslation();
  const alerts = record.paymentAlerts || [];
  const [index, setIndex] = useState(0);
  useEffect(
    () => setIndex((value) => Math.min(value, Math.max(0, alerts.length - 1))),
    [alerts.length],
  );
  if (!alerts.length) return null;
  const alert = alerts[index];

  function alertCopy(alert: PassportPaymentAlert) {
    if (alert.type === "monthly_missing")
      return {
        title: t("studentAlerts.monthlyTitle"),
        copy: t("studentAlerts.monthlyCopy"),
        label: alert.period
          ? formatGregorianMonth(alert.period, alert.period)
          : "",
      };
    if (alert.type === "aat_number_missing")
      return {
        title: t("studentAlerts.aatNumberTitle"),
        copy: t("studentAlerts.aatNumberCopy"),
        label: "",
      };
    if (alert.type === "aat_contribution_due")
      return {
        title: t("studentAlerts.aatTitle"),
        copy: t("studentAlerts.aatCopy"),
        label: "",
      };
    return {
      title: t("studentAlerts.examApplicationTitle"),
      copy: t("studentAlerts.examApplicationCopy"),
      label: alert.attemptedRank || "",
    };
  }

  const copy = alertCopy(alert);
  const paymentLabel =
    alert.type === "monthly_missing"
      ? `${copy.label} monthly contribution`
      : "AAT annual contribution";
  function move(direction: number) {
    setIndex((value) => (value + direction + alerts.length) % alerts.length);
  }

  return (
    <section
      className={styles.paymentAlerts}
      aria-labelledby="student-payment-alerts-title"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          move(-1);
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          move(1);
        }
      }}
    >
      <header>
        <AlertTriangle aria-hidden="true" />
        <div>
          <p>{t("studentAlerts.eyebrow")}</p>
          <h2 id="student-payment-alerts-title">{t("studentAlerts.title")}</h2>
        </div>
        <span>
          {index + 1} / {alerts.length}
        </span>
      </header>
      <div>
        <article key={`${alert.type}:${alert.id}`}>
          <div className={styles.paymentAlertCopy}>
            <span className={styles.alertAction}>
              {t("studentAlerts.actionRequired")}
            </span>
            <h3>
              {copy.title}
              {copy.label ? `: ${copy.label}` : ""}
            </h3>
            <p>{copy.copy}</p>
          </div>
          <div className={styles.paymentAlertActions}>
            {alert.type === "monthly_missing" ? (
              <>
                <button type="button" onClick={() => openTab("contributions")}>
                  {t("studentAlerts.openContributions")}
                </button>
                <a href="/support#monthly-contribution">
                  {t("studentAlerts.payOnline")}
                </a>
              </>
            ) : null}
            {alert.type === "aat_number_missing" ? (
              <>
                <a
                  href="/downloads/aat-membership-application-en-th-2026.pdf"
                  download
                >
                  {t("studentAlerts.downloadForm")}
                </a>
                <a
                  href={AAT_ONLINE_REGISTRATION_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("studentAlerts.registerOnline")}
                  <span className="sr-only">
                    {" "}
                    ({t("studentAlerts.opensNewWindow")})
                  </span>
                </a>
              </>
            ) : null}
            {alert.type === "aat_contribution_due" ? (
              <>
                <button type="button" onClick={() => openTab("contributions")}>
                  {t("studentAlerts.openContributions")}
                </button>
                <a href="/support#monthly-contribution">
                  {t("studentAlerts.payOnline")}
                </a>
              </>
            ) : null}
            {alert.type === "examination_application" ? (
              <a href="/student-records?task=exam">
                {t("studentAlerts.applyForExam")}
              </a>
            ) : null}
          </div>
          {alert.proof ? (
            <ProofActions
              proof={alert.proof}
              record={record}
              paymentLabel={paymentLabel}
            />
          ) : null}
        </article>
      </div>
      {alerts.length > 1 ? (
        <nav
          className={styles.paymentAlertNavigation}
          aria-label={t("studentAlerts.navigation")}
        >
          <button type="button" onClick={() => move(-1)}>
            <ChevronLeft aria-hidden="true" /> {t("studentAlerts.previous")}
          </button>
          <span>
            {t("studentAlerts.position", {
              current: index + 1,
              total: alerts.length,
            })}
          </span>
          <button type="button" onClick={() => move(1)}>
            {t("studentAlerts.next")} <ChevronRight aria-hidden="true" />
          </button>
        </nav>
      ) : null}
    </section>
  );
}

function aatSummaryText(record: StudentPassportRecord) {
  const labels: Record<StudentPassportRecord["aatSummary"]["state"], string> = {
    up_to_date: "Your AAT annual membership payment is up to date.",
    due_soon: "Your next AAT annual contribution is due soon.",
    payment_record_missing:
      "A current verified AAT annual payment is not recorded yet.",
    payslip_needed:
      "Please upload a payment proof so the dojo can review this AAT contribution.",
    submitted_for_review:
      "A current AAT annual contribution has been submitted.",
    verified: "Your AAT annual contribution has been verified.",
  };
  return labels[record.aatSummary.state];
}

function HistoryPagination({
  page,
  pageCount,
  total,
  onChange,
}: {
  page: number;
  pageCount: number;
  total: number;
  onChange: (page: number) => void;
}) {
  if (pageCount <= 1) return null;
  const start = (page - 1) * 5 + 1;
  const end = Math.min(page * 5, total);
  return (
    <nav className={styles.historyControls} aria-label="History pages">
      <p>
        Showing {start}–{end} of {total}
      </p>
      <div>
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          Previous
        </button>
        <span>
          Page {page} of {pageCount}
        </span>
        <button
          type="button"
          disabled={page >= pageCount}
          onClick={() => onChange(page + 1)}
        >
          Next
        </button>
      </div>
    </nav>
  );
}

function ContributionsPage({ record }: { record: StudentPassportRecord }) {
  const showMonthlyContributions = record.monthlyContributions !== null;
  const pageSize = 5;
  const [aatPage, setAatPage] = useState(1);
  const [monthlyPage, setMonthlyPage] = useState(1);
  const aatPageCount = Math.max(
    1,
    Math.ceil(record.aatContributions.length / pageSize),
  );
  const monthly = record.monthlyContributions || [];
  const monthlyPageCount = Math.max(1, Math.ceil(monthly.length / pageSize));
  const visibleAat = record.aatContributions.slice(
    (aatPage - 1) * pageSize,
    aatPage * pageSize,
  );
  const visibleMonthly = monthly.slice(
    (monthlyPage - 1) * pageSize,
    monthlyPage * pageSize,
  );
  return (
    <div
      className={`${styles.spread} ${showMonthlyContributions ? "" : styles.singlePageSpread}`}
    >
      <PassportPage
        folio="07"
        eyebrow="AAT / 年会費"
        title="AAT Annual Contribution"
      >
        <div className={styles.officialNote}>
          <ShieldCheck aria-hidden="true" />
          <p>
            {aatSummaryText(record)}
            {record.aatSummary.lastVerifiedPayment
              ? ` Last verified ${date(record.aatSummary.lastVerifiedPayment)}.`
              : ""}
            {record.aatSummary.nextDueDate
              ? ` Next due ${date(record.aatSummary.nextDueDate)}.`
              : ""}
          </p>
        </div>
        {record.aatContributions.length ? (
          <div className={styles.stampGrid}>
            {visibleAat.map((entry) => {
              const status = aatStatus(entry);
              return (
                <article key={entry.id}>
                  <div>
                    <span>{entry.paymentDate.slice(0, 4)}</span>
                    <strong>{date(entry.paymentDate)}</strong>
                  </div>
                  <span className={status.className}>
                    <status.Icon aria-hidden="true" /> {status.label}
                  </span>
                  <small>
                    {entry.renewalDueDate
                      ? `Renewal due ${date(entry.renewalDueDate)}`
                      : "Renewal date not recorded"}
                    {entry.amount !== null
                      ? ` · ${entry.amount.toLocaleString()} ${entry.currency}`
                      : ""}
                  </small>
                  <ProofActions
                    proof={entry.proof}
                    record={record}
                    paymentLabel="AAT annual contribution"
                  />
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState
            Icon={ReceiptText}
            title="No annual contribution history"
            copy="No approved or pending AAT annual contribution records are stored for this student."
          />
        )}
        <HistoryPagination
          page={aatPage}
          pageCount={aatPageCount}
          total={record.aatContributions.length}
          onChange={setAatPage}
        />
      </PassportPage>
      {showMonthlyContributions ? (
        <PassportPage
          folio="08"
          eyebrow="RENSHINKAN / 月謝"
          title="RenShinKan Monthly Contribution"
        >
          {monthly.length ? (
            <div className={styles.monthGrid}>
              {visibleMonthly.map((entry) => {
                const status = monthlyStatus(entry);
                return (
                  <article key={entry.id}>
                    <time>{month(entry.month)}</time>
                    <span className={status.className}>
                      <status.Icon aria-hidden="true" /> {status.label}
                    </span>
                    <small>
                      {entry.paidAt
                        ? `Confirmed ${date(entry.paidAt)}`
                        : entry.submittedAt
                          ? `Submitted ${date(entry.submittedAt)}`
                          : entry.expected
                            ? "Payment is expected for this month"
                            : "No payment submitted"}
                    </small>
                    <ProofActions
                      proof={entry.proof}
                      record={record}
                      paymentLabel={`${month(entry.month)} monthly contribution`}
                    />
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState
              Icon={CalendarDays}
              title="No monthly contribution history"
              copy="No RenShinKan monthly contribution records are stored for this student."
            />
          )}
          <HistoryPagination
            page={monthlyPage}
            pageCount={monthlyPageCount}
            total={monthly.length}
            onChange={setMonthlyPage}
          />
        </PassportPage>
      ) : null}
    </div>
  );
}

function requestStatus(request: PassportRequest) {
  if (request.status === "approved") return { label: "Approved", className: styles.statusApproved, Icon: CheckCircle2 };
  if (request.status === "pending") return { label: "Pending Review", className: styles.statusPending, Icon: FileClock };
  return { label: "Denied", className: styles.statusDenied, Icon: CircleX };
}

function RequestsPage({
  record,
  openContributions,
}: {
  record: StudentPassportRecord;
  openContributions: () => void;
}) {
  const counts = record.requests.reduce(
    (result, request) => ({
      ...result,
      [request.status]: result[request.status] + 1,
    }),
    { approved: 0, pending: 0, denied: 0 },
  );
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(record.requests.length / 5));
  const visibleRequests = record.requests.slice((page - 1) * 5, page * 5);
  return (
    <div className={styles.spread}>
      <PassportPage
        folio="09"
        eyebrow="申請状況 / REQUESTS"
        title="Request Summary"
      >
        <dl className={styles.requestSummary}>
          <div>
            <dt>
              <CheckCircle2 aria-hidden="true" /> Approved
            </dt>
            <dd>{counts.approved}</dd>
          </div>
          <div>
            <dt>
              <FileClock aria-hidden="true" /> Pending review
            </dt>
            <dd>{counts.pending}</dd>
          </div>
          <div>
            <dt>
              <CircleX aria-hidden="true" /> Denied
            </dt>
            <dd>{counts.denied}</dd>
          </div>
        </dl>
        <div className={styles.noticeList}>
          <button type="button" onClick={openContributions}>
            <ReceiptText aria-hidden="true" /> Open contribution history
          </button>
        </div>
      </PassportPage>
      <PassportPage
        folio="10"
        eyebrow="REVIEW LEDGER"
        title="Request & Notice History"
      >
        {record.requests.length ? (
          <div className={styles.requestList}>
            {visibleRequests.map((request) => {
              const status = requestStatus(request);
              return (
                <article key={request.id}>
                  <header>
                    <div>
                      <p className={styles.microLabel}>
                        {request.type.replace(/_/g, " ")}
                      </p>
                      <h4>{request.title}</h4>
                    </div>
                    <span className={status.className}>
                      <status.Icon aria-hidden="true" /> {status.label}
                    </span>
                  </header>
                  <p>
                    Submitted {date(request.submittedAt)}
                    {request.decisionAt
                      ? ` · Decision ${date(request.decisionAt)}`
                      : ""}
                  </p>
                  {request.previousValue ||
                  request.requestedValue ||
                  request.explanation ||
                  request.studentVisibleNote ? (
                    <details>
                      <summary>View details</summary>
                      {request.previousValue || request.requestedValue ? (
                        <dl>
                          <div>
                            <dt>Previous / reference</dt>
                            <dd>{request.previousValue || "Not applicable"}</dd>
                          </div>
                          <div>
                            <dt>Requested / period</dt>
                            <dd>
                              {request.requestedValue ||
                                request.period ||
                                "Not applicable"}
                            </dd>
                          </div>
                        </dl>
                      ) : null}
                      <p>{request.explanation}</p>
                      {request.studentVisibleNote ? (
                        <blockquote>
                          <strong>Note from your sensei</strong>
                          <br />
                          {request.studentVisibleNote}
                        </blockquote>
                      ) : null}
                    </details>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState
            Icon={History}
            title="No requests or notices"
            copy="Requests submitted from this verified student record will appear here."
          />
        )}
        <HistoryPagination
          page={page}
          pageCount={pageCount}
          total={record.requests.length}
          onChange={setPage}
        />
      </PassportPage>
    </div>
  );
}

export function DigitalPassport({ record, onRecordChange }: {
  record: PublicStudentRecord | StudentPassportRecord;
  onRecordChange?: (record: StudentPassportRecord) => void;
}) {
  const { language } = useTranslation();
  const translationScope = useRef<HTMLElement>(null);
  useScopedRecordTranslations(translationScope, language);
  const owner = isOwnerRecord(record) ? record : null;
  const tabs = owner ? OWNER_TABS : PUBLIC_TABS;
  const [active, setActive] = useState<PassportTab>("identity");
  const id = useId().replace(/:/g, "");
  const activeIndex = tabs.findIndex((tab) => tab.id === active);

  function moveTab(direction: number) {
    const next = tabs[(activeIndex + direction + tabs.length) % tabs.length];
    setActive(next.id);
    requestAnimationFrame(() => document.getElementById(`${id}-tab-${next.id}`)?.focus());
  }

  return <article ref={translationScope} className={styles.passport} aria-label={`${record.displayName} digital student passport`}>
    <header className={styles.coverStrip}><div><span>REN SHIN KAN</span><strong>STUDENT PASSPORT</strong></div><p>{record.profileStatus === "approved" ? "Approved digital training record" : "Usable profile · pending administrator review"}</p></header>
    {owner ? <PaymentAlerts record={owner} openTab={setActive} /> : null}
    <nav className={styles.tabs} role="tablist" aria-label="Student passport pages">
      {tabs.map(({ id: tab, label, Icon }, index) => <button
        id={`${id}-tab-${tab}`} key={tab} type="button" role="tab"
        aria-selected={active === tab} aria-controls={`${id}-panel-${tab}`} tabIndex={active === tab ? 0 : -1}
        className={active === tab ? styles.activeTab : ""} onClick={() => setActive(tab)}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") { event.preventDefault(); moveTab(1); }
          if (event.key === "ArrowLeft") { event.preventDefault(); moveTab(-1); }
          if (event.key === "Home") { event.preventDefault(); setActive(tabs[0].id); requestAnimationFrame(() => document.getElementById(`${id}-tab-${tabs[0].id}`)?.focus()); }
          if (event.key === "End") { event.preventDefault(); const last = tabs.at(-1)!; setActive(last.id); requestAnimationFrame(() => document.getElementById(`${id}-tab-${last.id}`)?.focus()); }
        }}
      ><span>{String(index + 1).padStart(2, "0")}</span><Icon size={16} aria-hidden="true" /><strong>{label}</strong></button>)}
    </nav>
    <div id={`${id}-panel-${active}`} className={styles.panel} role="tabpanel" tabIndex={0} aria-labelledby={`${id}-tab-${active}`}>
      {active === "identity" ? <IdentityPage record={record} owner={owner} onRecordChange={onRecordChange} /> : null}
      {active === "training" ? <TrainingPage record={record} owner={owner} /> : null}
      {active === "examinations" ? <ExaminationPage record={record} /> : null}
      {active === "contributions" && owner ? <ContributionsPage record={owner} /> : null}
      {active === "requests" && owner ? <RequestsPage record={owner} openContributions={() => setActive("contributions")} /> : null}
    </div>
    <footer className={styles.passportFooter}><span>{record.profileStatus === "approved" ? "Verified student record" : "Pending administrator review"}</span><span>Page {activeIndex + 1} of {tabs.length}</span><span>{record.studentId}</span></footer>
  </article>;
}
