/**
 * Normalizes examination applications into the single row model that the
 * standard PDF, the print-friendly PDF, and the Excel workbook all render.
 * Every calculation the report needs lives here so the three renderers cannot
 * drift apart.
 */

import {
  bangkokCanonicalDate,
  canonicalDateToDisplay,
  isCanonicalDate,
} from "../../../shared/date";
import { examinationFeeThb } from "../../../shared/examFees";
import {
  EXAM_REPORT_FORMATS,
  EXAM_REPORT_GROUP_COUNT_SUFFIX,
  EXAM_REPORT_MISSING_VALUE,
  EXAM_REPORT_NEW_AAT_LABEL,
  EXAM_REPORT_TITLE,
  type ExamReportTotalKey,
} from "./examReportConfig";

/** One examination application joined with its student and dojo. */
export type ExamReportSourceRow = {
  public_student_id: string;
  student_name: string;
  dojo_name: string;
  /** Canonical `dojos.code`, the abbreviation the student ID system uses. */
  dojo_code: string;
  aat_number: string | null;
  /** Latest AAT annual membership payment: the AAT. Date column shows this. */
  aat_last_paid_date: string | null;
  /** When the student account was created: the Member Date column shows this. */
  account_created_date?: string | null;
  current_rank: string;
  attempted_rank: string;
  /** Date of the student's most recent completed examination. */
  last_examination_date: string | null;
  grade_given: string;
  exam_fee: number;
  /** Summed `training_hours.verified_hours` for the student, in hours. */
  practice_hours: number | null;
  /** Submitted application answers; the applicant's `dob` is read from here. */
  answers_json: string;
};

export type ExamReportCycle = {
  title: string;
  name: string;
  rank_category: string;
  examination_at: string | null;
  venue: string;
  instructions: string;
};

export type ExamReportRow = {
  index: number;
  attemptedRank: string;
  aatNumber: string;
  isNewAat: boolean;
  /** The dojo-issued public Student ID, for example "RSK-6905". */
  studentIdNumber: string;
  memberDate: string | null;
  studentName: string;
  age: number | null;
  dojoCode: string;
  presentRank: string;
  lastTestDate: string | null;
  herebyRank: string;
  practiceHours: number | null;
  gradeGiven: string;
  examFee: number;
  /** Date of the newest AAT annual membership payment. */
  aatDate: string | null;
};

/** A run of consecutive rows that share the same requested rank. */
export type ExamReportGroup = {
  rank: string;
  /** Zero-based index of the first row of the group. */
  start: number;
  size: number;
  /** Reference-style count label, for example "8 คน". */
  countLabel: string;
};

export type ExamReportModel = {
  titleLines: readonly [string, string, string];
  scopeLabel: string;
  /** Canonical examination date used for every age calculation. */
  reportDate: string;
  /** True when no examination date was configured and today's date was used. */
  reportDateIsFallback: boolean;
  rows: readonly ExamReportRow[];
  groups: readonly ExamReportGroup[];
  totals: Readonly<Record<ExamReportTotalKey, number>>;
  /** Human-readable notes about data that could not be resolved. */
  dataIssues: readonly string[];
};

/**
 * Fee fields the report still totals. Annual Fee, Yen, and TOTAL (Baht) were
 * removed, so they are deliberately not listed and cannot be summed.
 */
export const EXAM_REPORT_INCLUDED_FEE_FIELDS = ["examFee"] as const;

export type ExamReportIncludedFeeField =
  (typeof EXAM_REPORT_INCLUDED_FEE_FIELDS)[number];

/**
 * Completed years between a date of birth and the report date. Both values are
 * canonical Asia/Bangkok calendar dates, so the comparison is a plain calendar
 * comparison and never shifts across a timezone boundary.
 */
export function ageOnReportDate(dateOfBirth: unknown, reportDate: unknown) {
  if (!isCanonicalDate(dateOfBirth) || !isCanonicalDate(reportDate))
    return null;
  const [birthYear, birthMonth, birthDay] = dateOfBirth.split("-").map(Number);
  const [year, month, day] = reportDate.split("-").map(Number);
  let age = year - birthYear;
  if (month < birthMonth || (month === birthMonth && day < birthDay)) age -= 1;
  return age >= 0 && age <= 120 ? age : null;
}

/** Reads the applicant's stored date of birth from the submitted answers. */
export function dateOfBirthFromAnswers(answersJson: string) {
  try {
    const answers = JSON.parse(answersJson) as Record<string, unknown>;
    for (const key of ["dob", "date_of_birth", "dateOfBirth"]) {
      if (isCanonicalDate(answers[key])) return answers[key] as string;
    }
  } catch {
    /* A malformed legacy answer set must not prevent an authorized export. */
  }
  return null;
}

/** The examination date drives every age calculation, never the current date. */
export function resolveReportDate(cycle: ExamReportCycle, now = new Date()) {
  // Held as `unknown` so a non-canonical date string is still reachable below.
  const value: unknown = cycle.examination_at;
  if (isCanonicalDate(value)) return { reportDate: value, isFallback: false };
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) {
      return { reportDate: bangkokCanonicalDate(parsed), isFallback: false };
    }
  }
  return { reportDate: bangkokCanonicalDate(now), isFallback: true };
}

/** Trims an AAT number and substitutes NEW for blank or whitespace values. */
export function normalizeAatNumber(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return text
    ? { aatNumber: text, isNewAat: false }
    : { aatNumber: EXAM_REPORT_NEW_AAT_LABEL, isNewAat: true };
}

/** Rounds accumulated practice duration to a readable number of hours. */
export function normalizePracticeHours(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    return null;
  const factor = 10 ** EXAM_REPORT_FORMATS.maximumHoursDecimals;
  return Math.round(value * factor) / factor;
}

/** Canonical dojo abbreviation, upper-cased exactly like the student ID system. */
export function normalizeDojoCode(value: unknown) {
  const code =
    typeof value === "string" ? value.trim().toLocaleUpperCase("en-US") : "";
  return code || EXAM_REPORT_MISSING_VALUE;
}

/** AAT. Date is the day the student last paid their AAT annual membership. */
export function aatLastPaidDate(
  row: Pick<ExamReportSourceRow, "aat_last_paid_date">,
) {
  return isCanonicalDate(row.aat_last_paid_date)
    ? row.aat_last_paid_date
    : null;
}

/** Member Date is the day the student's account was created. */
export function memberSinceDate(
  row: Pick<ExamReportSourceRow, "account_created_date">,
) {
  // Stored values may be full timestamps, so only the calendar date is kept.
  const value = (row.account_created_date || "").slice(0, 10);
  return isCanonicalDate(value) ? value : null;
}

export function formatReportDate(value: string | null) {
  return isCanonicalDate(value)
    ? canonicalDateToDisplay(value)
    : EXAM_REPORT_MISSING_VALUE;
}

export function formatReportMoney(value: number) {
  return value.toLocaleString(EXAM_REPORT_FORMATS.moneyLocale, {
    maximumFractionDigits: 0,
  });
}

/** Whole hours print as "12" and partial hours as "12.5". */
export function formatPracticeHours(value: number | null) {
  if (value === null) return EXAM_REPORT_MISSING_VALUE;
  return value.toLocaleString(EXAM_REPORT_FORMATS.moneyLocale, {
    maximumFractionDigits: EXAM_REPORT_FORMATS.maximumHoursDecimals,
  });
}

export function formatReportAge(value: number | null) {
  return value === null ? EXAM_REPORT_MISSING_VALUE : String(value);
}

/** The reference's three centred heading lines, built from live cycle values. */
export function buildReportTitleLines(
  cycle: ExamReportCycle,
  scopeLabel: string,
  now = new Date(),
) {
  const mainTitle =
    cycle.title?.trim() ||
    cycle.name?.trim() ||
    EXAM_REPORT_TITLE.mainTitleFallback;
  const organization = [EXAM_REPORT_TITLE.organization, scopeLabel.trim()]
    .filter(Boolean)
    .join(EXAM_REPORT_TITLE.separator);
  // The heading date is the same date every age is calculated against.
  const { reportDate, isFallback } = resolveReportDate(cycle, now);
  const examinationDate = isFallback
    ? EXAM_REPORT_TITLE.dateFallback
    : canonicalDateToDisplay(reportDate);
  const venue = cycle.venue?.trim()
    ? `${EXAM_REPORT_TITLE.venuePrefix} ${cycle.venue.trim()}`
    : EXAM_REPORT_TITLE.venueFallback;
  return [mainTitle, organization, `${examinationDate}  ${venue}`] as const;
}

/** Groups consecutive rows that request the same rank, as the reference does. */
export function buildReportGroups(
  rows: readonly ExamReportRow[],
): ExamReportGroup[] {
  const groups: ExamReportGroup[] = [];
  rows.forEach((row, index) => {
    const previous = groups[groups.length - 1];
    if (previous && previous.rank === row.attemptedRank) {
      previous.size += 1;
      previous.countLabel = `${previous.size} ${EXAM_REPORT_GROUP_COUNT_SUFFIX}`;
      return;
    }
    groups.push({
      rank: row.attemptedRank,
      start: index,
      size: 1,
      countLabel: `1 ${EXAM_REPORT_GROUP_COUNT_SUFFIX}`,
    });
  });
  return groups;
}

/** Normalizes one application row into the shared report row. */
function buildRow(
  source: ExamReportSourceRow,
  index: number,
  reportDate: string,
  issues: string[],
): ExamReportRow {
  const dateOfBirth = dateOfBirthFromAnswers(source.answers_json);
  const age = ageOnReportDate(dateOfBirth, reportDate);
  const studentName = source.student_name?.trim() || EXAM_REPORT_MISSING_VALUE;
  if (age === null) {
    issues.push(
      dateOfBirth
        ? `${studentName}: the recorded date of birth (${dateOfBirth}) is not a valid birth date for this report.`
        : `${studentName}: the application record has no usable date of birth, so Age is blank.`,
    );
  }
  const dojoCode = normalizeDojoCode(source.dojo_code);
  if (dojoCode === EXAM_REPORT_MISSING_VALUE) {
    issues.push(
      `${studentName}: no dojo code is recorded, so the Dojo column is blank.`,
    );
  }
  const practiceHours = normalizePracticeHours(source.practice_hours);
  if (practiceHours === null) {
    issues.push(
      `${studentName}: no verified training hours are recorded, so Practice Hours is blank.`,
    );
  }
  const { aatNumber, isNewAat } = normalizeAatNumber(source.aat_number);
  const herebyRank = source.attempted_rank?.trim() || EXAM_REPORT_MISSING_VALUE;
  // A student confirmed as paid without a submitted application has no stored
  // fee snapshot, so the standard fee for the requested rank stands in.
  const examFee =
    Number.isFinite(source.exam_fee) && source.exam_fee > 0
      ? source.exam_fee
      : (examinationFeeThb(herebyRank) ?? 0);
  return {
    index: index + 1,
    attemptedRank: herebyRank,
    aatNumber,
    isNewAat,
    studentIdNumber:
      source.public_student_id?.trim() || EXAM_REPORT_MISSING_VALUE,
    memberDate: memberSinceDate(source),
    studentName,
    age,
    dojoCode,
    presentRank: source.current_rank?.trim() || EXAM_REPORT_MISSING_VALUE,
    lastTestDate: isCanonicalDate(source.last_examination_date)
      ? source.last_examination_date
      : null,
    herebyRank,
    practiceHours,
    // Grade Given always matches Hereby Rank unless an examiner recorded a
    // different result for this application.
    gradeGiven: source.grade_given?.trim() || herebyRank,
    examFee,
    aatDate: aatLastPaidDate(source),
  };
}

/**
 * Builds the complete report model. All three exports call this so they share
 * identical records, ordering, values, and totals for a given report scope.
 */
export function buildExamReportModel(
  cycle: ExamReportCycle,
  sourceRows: readonly ExamReportSourceRow[],
  scopeLabel: string,
  now = new Date(),
): ExamReportModel {
  const { reportDate, isFallback } = resolveReportDate(cycle, now);
  const issues: string[] = [];
  if (isFallback) {
    issues.push(
      "The examination cycle has no examination date, so ages were calculated from today's Asia/Bangkok date.",
    );
  }
  const rows = sourceRows.map((source, index) =>
    buildRow(source, index, reportDate, issues),
  );
  const totals = {
    examFee: rows.reduce((sum, row) => sum + row.examFee, 0),
  };
  return {
    titleLines: buildReportTitleLines(cycle, scopeLabel, now),
    scopeLabel,
    reportDate,
    reportDateIsFallback: isFallback,
    rows,
    groups: buildReportGroups(rows),
    totals,
    dataIssues: issues,
  };
}

/** The display string for one column of one row, shared by every renderer. */
export function reportCellText(
  row: ExamReportRow,
  key: string,
  groupCountLabel: string,
) {
  switch (key) {
    case "index":
      return String(row.index);
    case "testForDan":
      return row.attemptedRank;
    case "groupCount":
      return groupCountLabel;
    case "aatNumber":
      return row.aatNumber;
    case "studentIdNumber":
      return row.studentIdNumber;
    case "memberDate":
      return formatReportDate(row.memberDate);
    case "studentName":
      return row.studentName;
    case "age":
      return formatReportAge(row.age);
    case "dojo":
      return row.dojoCode;
    case "presentRank":
      return row.presentRank;
    case "lastTest":
      return formatReportDate(row.lastTestDate);
    case "herebyRank":
      return row.herebyRank;
    case "practiceHours":
      return formatPracticeHours(row.practiceHours);
    case "gradeGiven":
      return row.gradeGiven;
    case "examFee":
      return formatReportMoney(row.examFee);
    case "aatDate":
      return formatReportDate(row.aatDate);
    default:
      return "";
  }
}
