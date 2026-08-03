/**
 * Deterministic, anonymized examination report data.
 *
 * These are invented records used for tests and preview artifacts. They contain
 * no production student data.
 */

import type {
  ExamExportCycle,
  ExamExportRow,
} from "../../functions/_lib/examExports";

/** Every age in this fixture is calculated against this examination date. */
export const FIXTURE_REPORT_DATE = "2026-06-14";

export const sampleExamCycle: ExamExportCycle = {
  title: "รายชื่อนักไอคิโดสายดำที่ทำการสอบเลื่อนสาย",
  name: "Dan Examination II",
  rank_category: "Dan",
  examination_at: FIXTURE_REPORT_DATE,
  venue: "มหาวิทยาลัยเชียงใหม่ จ.เชียงใหม่",
  instructions: "",
};

/** A renewal due date implies the payment that produced it, one year earlier. */
function paymentBehind(renewalDue: string | null) {
  if (!renewalDue) return null;
  const [year, month, day] = renewalDue.split("-").map(Number);
  return `${year - 1}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

type FixtureInput = {
  id: string;
  name: string;
  dojoCode: string;
  dojoName: string;
  aatNumber: string | null;
  /** Original AAT membership date, shown in the Member Date column. */
  memberDate: string | null;
  renewalDue: string | null;
  currentRank: string;
  attemptedRank: string;
  lastExam: string | null;
  grade: string;
  fee: number;
  hours: number | null;
  dob: string | null;
};

function toRow(input: FixtureInput): ExamExportRow {
  return {
    public_student_id: input.id,
    student_name: input.name,
    dojo_name: input.dojoName,
    dojo_code: input.dojoCode,
    aat_number: input.aatNumber,
    aat_member_since: input.memberDate,
    aat_last_paid_date: paymentBehind(input.renewalDue),
    aat_renewal_due_date: input.renewalDue,
    current_rank: input.currentRank,
    attempted_rank: input.attemptedRank,
    last_examination_date: input.lastExam,
    grade_given: input.grade,
    exam_fee: input.fee,
    practice_hours: input.hours,
    answers_json: JSON.stringify({
      dob: input.dob,
      name: input.name,
      age: 999,
    }),
  };
}

/**
 * Fourteen rows matching the reference report's density, covering merged rank
 * groups, several dojo codes, a missing AAT number, a long name, wrapped AAT
 * notes, birthdays either side of the report date, and partial practice hours.
 */
const FIXTURE_INPUTS: FixtureInput[] = [
  {
    id: "AG-6901",
    name: "Ms. Sukanya Kaewsangdee",
    dojoCode: "AG",
    dojoName: "All Gym Chiang Mai",
    aatNumber: "7002",
    memberDate: "2016-05-16",
    renewalDue: "2027-05-16",
    currentRank: "1 Kyu",
    attemptedRank: "SHO Dan-Ho",
    lastExam: "2023-10-28",
    // Birthday later in the year than the report date: 55, not 56.
    grade: "SHO Dan-Ho",
    fee: 2000,
    hours: 412,
    dob: "1970-08-02",
  },
  {
    id: "CMU-6902",
    name: "Ms. Tarnnamthip Siriwan",
    dojoCode: "CMU",
    dojoName: "Chiang Mai University Aikido Club",
    aatNumber: "6253",
    memberDate: "2013-07-08",
    renewalDue: "2026-07-08",
    currentRank: "SHO Dan-Ho",
    attemptedRank: "1st Dan",
    lastExam: "2023-02-12",
    // Birthday already passed this year: 25.
    grade: "1st Dan",
    fee: 2500,
    hours: 268.5,
    dob: "2001-03-05",
  },
  {
    id: "CMU-6903",
    name: "Ms. Ratchadaporn Siriwan",
    dojoCode: "CMU",
    dojoName: "Chiang Mai University Aikido Club",
    aatNumber: "1649",
    memberDate: "1993-02-04",
    renewalDue: "2026-02-04",
    currentRank: "1st Dan",
    attemptedRank: "2nd Dan",
    lastExam: "2022-02-12",
    grade: "2nd Dan",
    fee: 3500,
    hours: 1180,
    dob: "1971-01-19",
  },
  {
    id: "ZZZ-6904",
    name: "Mr. Kanapod Konsri",
    dojoCode: "ZZZ",
    dojoName: "Unlisted Training Group",
    // No AAT number at all: this row must render NEW.
    aatNumber: null,
    memberDate: null,
    renewalDue: null,
    currentRank: "1st Dan",
    attemptedRank: "2nd Dan",
    lastExam: "2019-03-05",
    grade: "2nd Dan",
    fee: 3500,
    hours: 640,
    dob: "1987-04-30",
  },
  {
    id: "NU-6905",
    name: "Mr. Watcharapol Supajakwattana",
    dojoCode: "NU",
    dojoName: "Naresuan University Aikido Club",
    aatNumber: "  ",
    memberDate: "2001-04-30",
    renewalDue: "2026-04-30",
    currentRank: "1st Dan",
    attemptedRank: "2nd Dan",
    lastExam: "2014-06-08",
    grade: "2nd Dan",
    fee: 3500,
    hours: 905.5,
    dob: "1980-06-14",
  },
  {
    id: "MHS-6906",
    name: "Mr. Wisut Leksomboon",
    dojoCode: "MHS",
    dojoName: "Aikido Mae Hong Son",
    aatNumber: "4036",
    memberDate: "2003-10-14",
    renewalDue: "2026-10-14",
    currentRank: "1st Dan",
    attemptedRank: "2nd Dan",
    lastExam: "2015-06-25",
    grade: "2nd Dan",
    fee: 3500,
    hours: 96,
    dob: "1974-11-23",
  },
  {
    id: "CMU-6907",
    name: "Mr. Pipatphong Wongyai",
    dojoCode: "CMU",
    dojoName: "Chiang Mai University Aikido Club",
    aatNumber: "4191",
    memberDate: "2004-04-30",
    renewalDue: null,
    currentRank: "1st Dan",
    attemptedRank: "2nd Dan",
    lastExam: "2016-06-05",
    grade: "2nd Dan",
    fee: 3500,
    hours: 720,
    dob: "1989-02-11",
  },
  {
    // Deliberately long name: it must wrap instead of being shortened.
    id: "CMU-6908",
    name: "Ms. Kanyaphat Chalermwongsakul Rattanaphichetkul",
    dojoCode: "CMU",
    dojoName: "Chiang Mai University Aikido Club",
    aatNumber: "4213",
    memberDate: "2004-05-18",
    renewalDue: "2026-05-18",
    currentRank: "1st Dan",
    attemptedRank: "2nd Dan",
    lastExam: "2023-02-12",
    grade: "2nd Dan",
    fee: 3500,
    hours: 512.5,
    dob: "1983-09-08",
  },
  {
    id: "CMU-6909",
    name: "Mr. Kittisak Siriparp",
    dojoCode: "CMU",
    dojoName: "Chiang Mai University Aikido Club",
    aatNumber: "4416",
    memberDate: "2005-01-07",
    renewalDue: null,
    currentRank: "1st Dan",
    attemptedRank: "2nd Dan",
    lastExam: "2016-06-05",
    grade: "2nd Dan",
    fee: 3500,
    hours: 748,
    dob: "1986-06-14",
  },
  {
    id: "CMU-6910",
    name: "Ms. Siriphorn Manokaew",
    dojoCode: "CMU",
    dojoName: "Chiang Mai University Aikido Club",
    aatNumber: "6082",
    memberDate: "2012-11-08",
    renewalDue: null,
    currentRank: "1st Dan",
    attemptedRank: "2nd Dan",
    lastExam: "2023-02-12",
    // No training hours recorded at all.
    grade: "2nd Dan",
    fee: 3500,
    hours: null,
    dob: "1992-12-01",
  },
  {
    id: "CMU-6911",
    name: "Mr. Chucheep Soontaranont",
    dojoCode: "CMU",
    dojoName: "Chiang Mai University Aikido Club",
    aatNumber: "2350",
    memberDate: "1998-01-01",
    renewalDue: "2027-01-01",
    currentRank: "2nd Dan",
    attemptedRank: "3rd Dan",
    lastExam: "2015-06-25",
    grade: "3rd Dan",
    fee: 4500,
    hours: 1544,
    dob: "1981-05-20",
  },
  {
    id: "AI-6912",
    name: "Ms. Rakchanok Chayutkul",
    dojoCode: "AI",
    dojoName: "Ai Dojo",
    aatNumber: "2533",
    memberDate: "1998-11-02",
    renewalDue: "2026-11-02",
    currentRank: "2nd Dan",
    attemptedRank: "3rd Dan",
    lastExam: "2015-06-25",
    grade: "3rd Dan",
    fee: 4500,
    hours: 1602.5,
    dob: "1969-02-28",
  },
  {
    id: "CMU-6913",
    name: "Mr. Ping Roekphisut",
    dojoCode: "CMU",
    dojoName: "Chiang Mai University Aikido Club",
    aatNumber: "4192",
    memberDate: "2004-04-30",
    renewalDue: "2026-04-30",
    currentRank: "2nd Dan",
    attemptedRank: "3rd Dan",
    lastExam: "2015-06-25",
    // Leap-day birth date.
    grade: "3rd Dan",
    fee: 4500,
    hours: 1288,
    dob: "1988-02-29",
  },
  {
    id: "RSK-6914",
    name: "Ms. Narumol Thammapruksa",
    dojoCode: "RSK",
    dojoName: "RenShinKan Dojo",
    aatNumber: "3834",
    memberDate: "2002-11-25",
    renewalDue: "2026-11-25",
    currentRank: "2nd Dan",
    attemptedRank: "3rd Dan",
    lastExam: "2021-04-20",
    // No date of birth recorded: Age must render the missing-value marker.
    grade: "3rd Dan",
    fee: 4500,
    hours: 430,
    dob: null,
  },
];

export const sampleExamRows: ExamExportRow[] = FIXTURE_INPUTS.map(toRow);

const STRESS_DOJOS = ["AG", "AI", "CMU", "MHS", "NU", "RSK"] as const;
const STRESS_RANKS = ["SHO Dan-Ho", "1st Dan", "2nd Dan", "3rd Dan"] as const;

/** A larger deterministic report used to prove multi-page PDF behaviour. */
export function stressExamRows(count: number): ExamExportRow[] {
  return Array.from({ length: count }, (_, index) => {
    const rank =
      STRESS_RANKS[
        Math.floor(index / Math.max(1, Math.ceil(count / STRESS_RANKS.length)))
      ] || "3rd Dan";
    const dojo = STRESS_DOJOS[index % STRESS_DOJOS.length];
    const sequence = String(index + 1).padStart(3, "0");
    return toRow({
      id: `${dojo}-69${sequence}`,
      name: `Aikidoka Sample Number ${sequence}`,
      dojoCode: dojo,
      dojoName: `${dojo} Training Group`,
      aatNumber: index % 7 === 0 ? null : String(5000 + index),
      memberDate: `20${String(10 + (index % 15)).padStart(2, "0")}-0${(index % 9) + 1}-1${index % 10}`,
      renewalDue:
        index % 3 === 0 ? `2027-0${(index % 9) + 1}-1${index % 10}` : null,
      currentRank: "1st Dan",
      attemptedRank: rank,
      lastExam: `20${String(15 + (index % 10)).padStart(2, "0")}-0${(index % 9) + 1}-0${(index % 9) + 1}`,
      grade: rank,
      fee: 2000 + (index % 5) * 500,
      hours: index % 4 === 0 ? null : 100 + index * 7.5,
      dob: `19${String(60 + (index % 40)).padStart(2, "0")}-0${(index % 9) + 1}-1${index % 10}`,
    });
  });
}
