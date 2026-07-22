import { useId, useMemo, useState, type ComponentType, type ReactNode } from "react";
import {
  BadgeCheck,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  CircleX,
  Clock3,
  FileClock,
  GraduationCap,
  History,
  ReceiptText,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import type {
  PassportAatContribution,
  PassportChangeRequest,
  PassportMonthlyContribution,
  PublicExamination,
  PublicStudentRecord,
  StudentPassportRecord,
} from "../../types/studentRecord";
import { BeltMark } from "../BeltMark";
import styles from "./DigitalPassport.module.css";

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
  { id: "requests", label: "Change Requests", Icon: History },
];

function isOwnerRecord(record: PublicStudentRecord | StudentPassportRecord): record is StudentPassportRecord {
  return "trainingEntries" in record && Array.isArray(record.trainingEntries);
}

function date(value?: string | null) {
  if (!value) return "Not recorded";
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(parsed);
}

function month(value: string) {
  const parsed = new Date(`${value}-01T12:00:00`);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(parsed);
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

function VerificationSeal() {
  return <div className={styles.seal} role="img" aria-label="Approved and verified by the dojo">
    <BadgeCheck aria-hidden="true" /><span>DOJO</span><strong>VERIFIED</strong><small>APPROVED RECORD</small>
  </div>;
}

function IdentityPage({ record, owner }: { record: PublicStudentRecord | StudentPassportRecord; owner: StudentPassportRecord | null }) {
  const fallback = owner?.dojoLogo;
  return <div className={styles.spread}>
    <PassportPage folio="01" eyebrow="会員証 / MEMBER RECORD" title="Identity Record">
      <div className={styles.identityLead}>
        {record.profileImage
          ? <img src={record.profileImage} alt={`${record.displayName} profile`} />
          : fallback
            ? <img className={styles.logoFallback} src={fallback} alt={`${record.dojoName} logo`} />
            : <div className={styles.avatarFallback} role="img" aria-label="No profile photograph"><UserRound aria-hidden="true" /></div>}
        <div><p className={styles.microLabel}>NAME / 氏名</p><h4>{record.displayName}</h4><p>{record.studentId}</p></div>
      </div>
      <dl className={styles.identityGrid}>
        <div><dt>DOJO / 道場</dt><dd>{record.dojoName}</dd></div>
        <div><dt>CURRENT RANK / 級・段</dt><dd><BeltMark rank={record.currentBelt} legacyColor={record.beltColor} /> {record.currentBelt}</dd></div>
        <div><dt>RECORD STATUS</dt><dd><ShieldCheck aria-hidden="true" /> Approved</dd></div>
        <div><dt>VERIFIED HOURS</dt><dd>{record.totalVerifiedTrainingHours} hours</dd></div>
      </dl>
    </PassportPage>
    <PassportPage folio="02" eyebrow="REGISTRATION / 登録" title="Official Details">
      <dl className={styles.printedFields}>
        <div><dt>STUDENT ID</dt><dd>{record.studentId}</dd></div>
        {owner ? <div><dt>AAT MEMBERSHIP NUMBER</dt><dd>{owner.aatNumber || "Not assigned"}</dd></div> : null}
        {owner ? <div><dt>REGISTRATION DATE</dt><dd>{date(owner.registrationDate)}</dd></div> : null}
        <div><dt>LAST UPDATED</dt><dd>{date(record.lastUpdated)}</dd></div>
        {owner?.practiceDuration ? <div><dt>PRACTICE RECORD</dt><dd>{owner.practiceDuration}</dd></div> : null}
      </dl>
      {owner?.profileBio ? <div className={styles.profileNote}><p className={styles.microLabel}>STUDENT PROFILE</p><p>{owner.profileBio}</p></div> : null}
      <VerificationSeal />
    </PassportPage>
  </div>;
}

function TrainingPage({ record, owner }: { record: PublicStudentRecord | StudentPassportRecord; owner: StudentPassportRecord | null }) {
  const entries = owner?.trainingEntries || [];
  return <div className={styles.spread}>
    <PassportPage folio="03" eyebrow="稽古記録 / TRAINING" title="Verified Training">
      <div className={styles.hoursHero}><Clock3 aria-hidden="true" /><strong>{record.totalVerifiedTrainingHours}</strong><span>verified hours</span></div>
      <div className={styles.officialNote}><CheckCircle2 aria-hidden="true" /><p>Only hours approved by an authorized dojo administrator are included in this total.</p></div>
      {owner?.practiceDuration ? <dl className={styles.printedFields}><div><dt>PRACTICE DURATION</dt><dd>{owner.practiceDuration}</dd></div></dl> : null}
    </PassportPage>
    <PassportPage folio="04" eyebrow="LEDGER / 台帳" title="Recent Entries">
      {entries.length ? <div className={styles.ledger} role="table" aria-label="Verified training entries">
        <div className={styles.ledgerHead} role="row"><span role="columnheader">Date</span><span role="columnheader">Hours</span><span role="columnheader">Details</span><span role="columnheader">Status</span></div>
        {entries.map((entry) => <div className={styles.ledgerRow} role="row" key={entry.id}>
          <time role="cell">{date(entry.entryDate)}</time><strong role="cell">{entry.hours} hr</strong>
          <span role="cell">{entry.location || sourceLabel(entry.source)}</span><span role="cell" className={styles.verifiedInk}><CheckCircle2 aria-hidden="true" /> Verified</span>
        </div>)}
      </div> : <EmptyState Icon={Clock3}
        title={owner ? "No individual entries yet" : "Verified total only"}
        copy={owner
          ? "The verified total is still official. Detailed entries will appear here when the dojo records them."
          : "This shared profile shows the approved total without private entry details."} />}
    </PassportPage>
  </div>;
}

function ExaminationPage({ record }: { record: PublicStudentRecord }) {
  const exams = useMemo(() => [...record.examinations].sort((left, right) => left.examination_date.localeCompare(right.examination_date)), [record.examinations]);
  const latest = exams.at(-1);
  const latestResult = latest ? examinationResult(latest) : null;
  return <div className={styles.spread}>
    <PassportPage folio="05" eyebrow="審査記録 / EXAMINATION" title="Rank Progression">
      {latest ? <div className={styles.latestRank}>
        <p className={styles.microLabel}>LATEST RECORDED RESULT</p><BeltMark rank={rankLabel(latest)} legacyColor={latest.belt_color} />
        <h4>{rankLabel(latest)}</h4><p>{date(latest.examination_date)}</p>
        {latestResult ? <span className={latestResult.className}>{latestResult.label}</span> : null}
      </div> : <EmptyState Icon={GraduationCap} title="No examinations recorded" copy="Approved examination results will appear in the official ledger." />}
      <p className={styles.archiveNote}>The ledger follows the student’s recorded progression and does not create missing ranks or dates.</p>
    </PassportPage>
    <PassportPage folio="06" eyebrow="KYU / DAN LEDGER" title="Examination History">
      {exams.length ? <div className={`${styles.ledger} ${styles.examLedger}`} role="table" aria-label="Examination history">
        <div className={styles.ledgerHead} role="row"><span role="columnheader">Rank</span><span role="columnheader">Date</span><span role="columnheader">Examiner / place</span><span role="columnheader">Result</span></div>
        {exams.map((exam, index) => {
          const result = examinationResult(exam);
          return <div className={styles.ledgerRow} role="row" key={`${exam.examination_date}-${rankLabel(exam)}-${index}`}>
            <strong role="cell"><BeltMark rank={rankLabel(exam)} legacyColor={exam.belt_color} /> {rankLabel(exam)}</strong>
            <time role="cell">{date(exam.examination_date)}</time>
            <span role="cell">{exam.examiner || exam.examination_location || "Not recorded"}</span>
            <span role="cell" className={result.className}><result.Icon aria-hidden="true" />{result.label}</span>
            {exam.public_notes ? <p className={styles.rowNote}>{exam.public_notes}</p> : null}
          </div>;
        })}
      </div> : <EmptyState Icon={GraduationCap} title="No examination history" copy="There are no approved examination entries on this record yet." />}
    </PassportPage>
  </div>;
}

function aatStatus(entry: PassportAatContribution) {
  if (entry.status === "paid") return { label: "Paid", className: styles.statusApproved, Icon: CheckCircle2 };
  if (entry.status === "awaiting_payment") return { label: "Pending review", className: styles.statusPending, Icon: FileClock };
  if (entry.status === "refunded") return { label: "Refunded", className: styles.statusNeutral, Icon: History };
  return { label: "Cancelled", className: styles.statusDenied, Icon: CircleX };
}

function monthlyStatus(entry: PassportMonthlyContribution) {
  if (entry.status === "paid") return { label: "Paid", className: styles.statusApproved, Icon: CheckCircle2 };
  if (entry.status === "awaiting_payment") return { label: "Pending review", className: styles.statusPending, Icon: FileClock };
  return { label: "Not submitted", className: styles.statusNeutral, Icon: CalendarDays };
}

function ContributionsPage({ record }: { record: StudentPassportRecord }) {
  const showMonthlyContributions = record.monthlyContributions !== null;
  return <div className={`${styles.spread} ${showMonthlyContributions ? "" : styles.singlePageSpread}`}>
    <PassportPage folio="07" eyebrow="AAT / 年会費" title="AAT Annual Contribution">
      <p className={styles.sectionIntro}>Annual Aikido Association of Thailand records are kept separately from dojo monthly contributions.</p>
      {record.aatContributions.length ? <div className={styles.stampGrid}>
        {record.aatContributions.map((entry) => { const status = aatStatus(entry); return <article key={entry.id}>
          <div><span>{new Date(`${entry.paymentDate.slice(0, 10)}T12:00:00`).getFullYear()}</span><strong>{date(entry.paymentDate)}</strong></div>
          <span className={status.className}><status.Icon aria-hidden="true" /> {status.label}</span>
          <small>{entry.renewalDueDate ? `Renewal due ${date(entry.renewalDueDate)}` : "Renewal date not recorded"}</small>
        </article>; })}
      </div> : <EmptyState Icon={ReceiptText} title="No annual contribution history" copy="No approved or pending AAT annual contribution records are stored for this student." />}
    </PassportPage>
    {showMonthlyContributions ? <PassportPage folio="08" eyebrow="RENSHINKAN / 月謝" title="RenShinKan Monthly Contribution">
      {record.monthlyContributions.length
          ? <div className={styles.monthGrid}>{record.monthlyContributions.map((entry) => { const status = monthlyStatus(entry); return <article key={entry.id}>
            <time>{month(entry.month)}</time><span className={status.className}><status.Icon aria-hidden="true" /> {status.label}</span>
            <small>{entry.paidAt ? `Confirmed ${date(entry.paidAt)}` : entry.submittedAt ? `Submitted ${date(entry.submittedAt)}` : "No payment submitted"}</small>
          </article>; })}</div>
          : <EmptyState Icon={CalendarDays} title="No monthly contribution history" copy="No RenShinKan monthly contribution records are stored for this student." />}
    </PassportPage> : null}
  </div>;
}

function requestStatus(request: PassportChangeRequest) {
  if (request.status === "approved") return { label: "Approved", className: styles.statusApproved, Icon: CheckCircle2 };
  if (request.status === "pending") return { label: "Pending Review", className: styles.statusPending, Icon: FileClock };
  return { label: "Denied", className: styles.statusDenied, Icon: CircleX };
}

function RequestsPage({ record }: { record: StudentPassportRecord }) {
  const counts = record.changeRequests.reduce((result, request) => ({ ...result, [request.status]: result[request.status] + 1 }), { approved: 0, pending: 0, denied: 0 });
  return <div className={styles.spread}>
    <PassportPage folio="09" eyebrow="申請状況 / REQUESTS" title="Record Change Requests">
      <p className={styles.sectionIntro}>Requests are listed newest first and reflect the dojo’s current review status.</p>
      <dl className={styles.requestSummary}>
        <div><dt><CheckCircle2 aria-hidden="true" /> Approved</dt><dd>{counts.approved}</dd></div>
        <div><dt><FileClock aria-hidden="true" /> Pending review</dt><dd>{counts.pending}</dd></div>
        <div><dt><CircleX aria-hidden="true" /> Denied</dt><dd>{counts.denied}</dd></div>
      </dl>
      <div className={styles.officialNote}><ShieldCheck aria-hidden="true" /><p>Only requests submitted through the verified student-record workflow appear here.</p></div>
    </PassportPage>
    <PassportPage folio="10" eyebrow="REVIEW LEDGER" title="Request History">
      {record.changeRequests.length ? <div className={styles.requestList}>{record.changeRequests.map((request) => { const status = requestStatus(request); return <article key={request.id}>
        <header><div><p className={styles.microLabel}>REQUESTED CHANGE</p><h4>{request.title}</h4></div><span className={status.className}><status.Icon aria-hidden="true" /> {status.label}</span></header>
        <dl><div><dt>Previous</dt><dd>{request.previousValue}</dd></div><div><dt>Requested</dt><dd>{request.requestedValue}</dd></div></dl>
        <p>Submitted {date(request.submittedAt)}{request.reviewedAt ? ` · Reviewed ${date(request.reviewedAt)}` : ""}</p>
        {request.reviewNote ? <blockquote>{request.reviewNote}</blockquote> : null}
        {request.status === "approved" ? <footer><CheckCircle2 aria-hidden="true" /> The approved student record has been updated.</footer> : null}
        {request.status === "pending" ? <footer><FileClock aria-hidden="true" /> This request is waiting for a sensei to review it.</footer> : null}
        {request.status === "denied" ? <footer className={styles.deniedMessage}><CircleX aria-hidden="true" /> Please speak with a sensei for more information.</footer> : null}
      </article>; })}</div> : <EmptyState Icon={History} title="No change requests" copy="Requests submitted from this verified student record will appear here." />}
    </PassportPage>
  </div>;
}

export function DigitalPassport({ record }: { record: PublicStudentRecord | StudentPassportRecord }) {
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

  return <article className={styles.passport} aria-label={`${record.displayName} digital student passport`}>
    <header className={styles.coverStrip}><div><span>REN SHIN KAN</span><strong>STUDENT PASSPORT</strong></div><p>Approved digital training record</p></header>
    <nav className={styles.tabs} role="tablist" aria-label="Student passport pages">
      {tabs.map(({ id: tab, label, Icon }, index) => <button
        id={`${id}-tab-${tab}`} key={tab} type="button" role="tab"
        aria-selected={active === tab} aria-controls={`${id}-panel-${tab}`} tabIndex={active === tab ? 0 : -1}
        className={active === tab ? styles.activeTab : ""} onClick={() => setActive(tab)}
        onKeyDown={(event) => { if (event.key === "ArrowRight") { event.preventDefault(); moveTab(1); } if (event.key === "ArrowLeft") { event.preventDefault(); moveTab(-1); } }}
      ><span>{String(index + 1).padStart(2, "0")}</span><Icon size={16} aria-hidden="true" /><strong>{label}</strong></button>)}
    </nav>
    <div id={`${id}-panel-${active}`} className={styles.panel} role="tabpanel" tabIndex={0} aria-labelledby={`${id}-tab-${active}`}>
      {active === "identity" ? <IdentityPage record={record} owner={owner} /> : null}
      {active === "training" ? <TrainingPage record={record} owner={owner} /> : null}
      {active === "examinations" ? <ExaminationPage record={record} /> : null}
      {active === "contributions" && owner ? <ContributionsPage record={owner} /> : null}
      {active === "requests" && owner ? <RequestsPage record={owner} /> : null}
    </div>
    <footer className={styles.passportFooter}><span>Verified student record</span><span>Page {activeIndex + 1} of {tabs.length}</span><span>{record.studentId}</span></footer>
  </article>;
}
