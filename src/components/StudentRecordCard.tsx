import { BadgeCheck, Clock3, ShieldCheck } from "lucide-react";
import type { PublicStudentRecord } from "../types/studentRecord";
import { recordsCopy } from "../data/recordsCopy";
import { useTranslation } from "../i18n";
import { BeltMark } from "./BeltMark";

function date(value: string) { const parsed = new Date(`${value.slice(0, 10)}T12:00:00`); return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long", year: "numeric" }).format(parsed); }

export function StudentRecordCard({ record }: { record: PublicStudentRecord }) {
  const { language } = useTranslation();
  const c = recordsCopy[language];
  return (
    <article className="record-sheet">
      <header>
        {record.profileImage ? <img src={record.profileImage} alt={`${record.displayName} profile`} /> : <div className="record-sheet__monogram" aria-hidden="true">{record.displayName.slice(0, 1)}</div>}
        <div><p className="folio-mark">{c.verified}</p><h2>{record.displayName}</h2><p>{record.dojoName} · {record.studentId}</p></div>
        <BadgeCheck aria-label="Verified" />
      </header>
      <dl className="record-sheet__summary">
        <div><dt>{c.currentBelt}</dt><dd><BeltMark rank={record.currentBelt} legacyColor={record.beltColor} />{record.currentBelt}</dd></div>
        <div><dt>{c.training}</dt><dd><Clock3 size={17} /> {record.totalVerifiedTrainingHours} {c.hours}</dd></div>
        <div><dt>{c.status}</dt><dd><ShieldCheck size={17} /> {c.dojoVerified}</dd></div>
      </dl>
      <section><h3>{c.exams}</h3>{record.examinations.length ? <ol className="record-exams">{record.examinations.map((exam) => <li key={`${exam.examination_date}-${exam.belt_awarded}`}><time>{date(exam.examination_date)}</time><strong><BeltMark rank={`${exam.belt_awarded} ${exam.rank ?? ""}`} legacyColor={exam.belt_color} />{exam.belt_awarded}{exam.rank ? ` · ${exam.rank}` : ""}</strong>{exam.examiner ? <span>{c.examiner}: {exam.examiner}</span> : null}{exam.public_notes ? <p>{exam.public_notes}</p> : null}</li>)}</ol> : <p className="marginal-note">{c.noExams}</p>}</section>
      {record.lastUpdated ? <footer>{c.updated} {date(record.lastUpdated)}</footer> : null}
    </article>
  );
}
