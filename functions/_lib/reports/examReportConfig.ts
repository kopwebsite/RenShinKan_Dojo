/**
 * Single source of truth for the examination report layout.
 *
 * Every label, column width, colour, and spacing value used by the standard
 * PDF, the print-friendly PDF, and the Excel workbook is defined here so the
 * report can be retuned without editing the three renderers.
 */

export type ExamReportColumnKey =
  | "index"
  | "testForDan"
  | "groupCount"
  | "aatNumber"
  | "memberDate"
  | "studentName"
  | "age"
  | "dojo"
  | "presentRank"
  | "lastTest"
  | "herebyRank"
  | "practiceHours"
  | "gradeGiven"
  | "examFee"
  | "totalBaht"
  | "aatDate";

export type ExamReportAlignment = "left" | "center" | "right";

/** How a value is formatted and stored, which also drives the Excel cell type. */
export type ExamReportValueKind =
  "text" | "integer" | "decimal" | "money" | "date";

export type ExamReportColumn = {
  key: ExamReportColumnKey;
  /** First header line. Empty when the column only needs a single lower line. */
  headerTop: string;
  /** Second header line. Empty when the column only needs a single upper line. */
  headerBottom: string;
  /** Printed width in PDF points. The sum must fit the printable page width. */
  pdfWidth: number;
  /** Excel column width in character units, kept proportional to `pdfWidth`. */
  excelWidth: number;
  align: ExamReportAlignment;
  kind: ExamReportValueKind;
};

/**
 * Column order and labels. Annual Fee and Yen are intentionally absent: they
 * were removed from the report, its totals, and its formulas.
 */
export const EXAM_REPORT_COLUMNS: readonly ExamReportColumn[] = [
  {
    key: "index",
    headerTop: "",
    headerBottom: "#",
    pdfWidth: 18,
    excelWidth: 3.4,
    align: "center",
    kind: "integer",
  },
  {
    key: "testForDan",
    headerTop: "TEST FOR",
    headerBottom: "(DAN)",
    pdfWidth: 54,
    excelWidth: 10.3,
    align: "center",
    kind: "text",
  },
  {
    key: "groupCount",
    headerTop: "",
    headerBottom: "#",
    pdfWidth: 28,
    excelWidth: 5.3,
    align: "center",
    kind: "text",
  },
  {
    key: "aatNumber",
    headerTop: "AAT.",
    headerBottom: "No",
    pdfWidth: 34,
    excelWidth: 6.5,
    align: "center",
    kind: "text",
  },
  {
    key: "memberDate",
    headerTop: "Member Date",
    headerBottom: "(D/M/Y)",
    pdfWidth: 56,
    excelWidth: 10.7,
    align: "center",
    kind: "date",
  },
  {
    key: "studentName",
    headerTop: "Name & Surname",
    headerBottom: "",
    pdfWidth: 150,
    excelWidth: 28.6,
    align: "left",
    kind: "text",
  },
  {
    key: "age",
    headerTop: "Age",
    headerBottom: "(Yr)",
    pdfWidth: 26,
    excelWidth: 5,
    align: "center",
    kind: "integer",
  },
  {
    key: "dojo",
    headerTop: "Dojo",
    headerBottom: "",
    pdfWidth: 42,
    excelWidth: 8,
    align: "center",
    kind: "text",
  },
  {
    key: "presentRank",
    headerTop: "Present",
    headerBottom: "Rank",
    pdfWidth: 48,
    excelWidth: 9.1,
    align: "center",
    kind: "text",
  },
  {
    key: "lastTest",
    headerTop: "Last Test",
    headerBottom: "(D/M/Y)",
    pdfWidth: 52,
    excelWidth: 9.9,
    align: "center",
    kind: "date",
  },
  {
    key: "herebyRank",
    headerTop: "Hereby",
    headerBottom: "Rank",
    pdfWidth: 46,
    excelWidth: 8.8,
    align: "center",
    kind: "text",
  },
  {
    key: "practiceHours",
    headerTop: "Practice",
    headerBottom: "Hours",
    pdfWidth: 42,
    excelWidth: 8,
    align: "center",
    kind: "decimal",
  },
  {
    key: "gradeGiven",
    headerTop: "Grade",
    headerBottom: "Given",
    pdfWidth: 44,
    excelWidth: 8.4,
    align: "center",
    kind: "text",
  },
  {
    key: "examFee",
    headerTop: "Exam",
    headerBottom: "Fee",
    pdfWidth: 40,
    excelWidth: 7.6,
    align: "center",
    kind: "money",
  },
  {
    key: "totalBaht",
    headerTop: "TOTAL",
    headerBottom: "(Baht)",
    pdfWidth: 46,
    excelWidth: 8.8,
    align: "center",
    kind: "money",
  },
  {
    key: "aatDate",
    headerTop: "AAT. Date",
    headerBottom: "",
    pdfWidth: 76,
    excelWidth: 14.5,
    align: "center",
    kind: "text",
  },
];

/** Columns whose values are summed into the totals row, in report order. */
export type ExamReportTotalKey = Extract<
  ExamReportColumnKey,
  "examFee" | "totalBaht"
>;
export const EXAM_REPORT_TOTAL_COLUMNS: readonly ExamReportTotalKey[] = [
  "examFee",
  "totalBaht",
];

/** The column that carries the "TOTAL" caption on the totals row. */
export const EXAM_REPORT_TOTAL_LABEL_COLUMN: ExamReportColumnKey = "gradeGiven";

/** The totals cell that is highlighted the way the reference highlights it. */
export const EXAM_REPORT_TOTAL_HIGHLIGHT_COLUMN: ExamReportColumnKey =
  "totalBaht";

export const EXAM_REPORT_TOTAL_LABEL = "TOTAL";

/** Heading text that is not derived from the examination cycle. */
export const EXAM_REPORT_TITLE = {
  /** Used when the cycle has neither a title nor a name. */
  mainTitleFallback: "รายชื่อนักไอคิโดสายดำที่ทำการสอบเลื่อนสาย",
  organization: "จากกลุ่มไอคิโดภาคเหนือ",
  /** Thai preposition placed before the venue on the third heading line. */
  venuePrefix: "ณ",
  separator: "  ·  ",
  dateFallback: "Examination date not set",
  venueFallback: "Venue not set",
} as const;

/** Prefix for the Thai AAT renewal note shown in the AAT Date column. */
export const EXAM_REPORT_AAT_RENEWAL_PREFIX = "ต่ออายุถึง";

/** Suffix that turns a group size into the reference's "N คน" count label. */
export const EXAM_REPORT_GROUP_COUNT_SUFFIX = "คน";

/** Rendered when a value is genuinely missing rather than zero. */
export const EXAM_REPORT_MISSING_VALUE = "—";

/** Rendered instead of an empty cell when a student has no AAT number. */
export const EXAM_REPORT_NEW_AAT_LABEL = "NEW";

export type ExamReportTheme = {
  /** Cell fill for a student whose AAT number is missing. */
  attentionFill: string;
  /** Cell fill behind the highlighted grand total. */
  totalFill: string;
  /** Fill used when a dojo code has no entry in `dojoFills`. */
  unknownDojoFill: string;
  /** Fill for the AAT Date note cells. */
  aatDateFill: string;
  pageFill: string;
  headerFill: string;
  textColor: string;
  borderColor: string;
  dojoFills: Readonly<Record<string, string>>;
  /** Draw dojo codes and NEW with a heavier weight instead of relying on fill. */
  emphasiseWithoutColour: boolean;
};

/**
 * Dojo cell colours keyed by the canonical `dojos.code` value that the student
 * ID system uses. Codes absent from this map fall back to `unknownDojoFill`.
 */
const DOJO_FILLS: Readonly<Record<string, string>> = {
  AG: "66C6FF",
  AI: "FFC000",
  AKCM: "FFFF00",
  CHULA: "FFB3D9",
  CMU: "DDB6F6",
  MHS: "CCECFF",
  NU: "B16BD0",
  RSK: "FF7900",
};

/** Colour theme used by the standard PDF and the Excel workbook. */
export const EXAM_REPORT_STANDARD_THEME: ExamReportTheme = {
  attentionFill: "FFFF00",
  totalFill: "FFFF00",
  unknownDojoFill: "E8E8E8",
  aatDateFill: "FFFF00",
  pageFill: "FFFFFF",
  headerFill: "FFFFFF",
  textColor: "000000",
  borderColor: "000000",
  dojoFills: DOJO_FILLS,
  emphasiseWithoutColour: false,
};

/**
 * Print-friendly overrides. Colour is removed entirely, so the same emphasis is
 * carried by bold text and heavier borders instead.
 */
export const EXAM_REPORT_PRINT_FRIENDLY_THEME: ExamReportTheme = {
  // Neutral tints, not colours: they survive a monochrome printer and keep NEW
  // and the grand total obvious without relying on hue.
  attentionFill: "D9D9D9",
  totalFill: "F2F2F2",
  unknownDojoFill: "FFFFFF",
  aatDateFill: "FFFFFF",
  pageFill: "FFFFFF",
  headerFill: "FFFFFF",
  textColor: "000000",
  borderColor: "000000",
  dojoFills: {},
  emphasiseWithoutColour: true,
};

/** Page geometry, typography, and spacing shared by both PDF variants. */
export const EXAM_REPORT_PDF_STYLE = {
  /** A4 landscape in PDF points, matching the supplied reference document. */
  pageWidth: 841.89,
  pageHeight: 595.28,
  /** Smallest acceptable side margin; the table is centred within what is left. */
  minimumHorizontalMargin: 18,
  topMargin: 22,
  bottomMargin: 24,
  fontFamily: "Noto Sans Thai",
  bodyFontSize: 7.2,
  headerFontSize: 7.2,
  titleFontSizes: [11.5, 9.5, 9] as const,
  titleLineGap: 3.5,
  titleBlockGap: 8,
  /** Padding inside the bordered title box drawn around the first heading. */
  titleBoxPaddingX: 10,
  titleBoxPaddingY: 3,
  lineHeight: 8.4,
  minimumRowHeight: 15.5,
  minimumHeaderRowHeight: 12.5,
  cellPaddingX: 2.2,
  cellPaddingY: 2.6,
  borderWidth: 0.5,
  outerBorderWidth: 0.9,
  /** Outline stroke width, as a fraction of the font size, used to simulate
   * bold with the single-weight Thai font. */
  boldStrokeRatio: 0.035,
  /** Never scale text below this size when fitting a wide table. */
  minimumFontSize: 5.5,
  footerFontSize: 6.5,
  footerGap: 9,
} as const;

/** Excel-specific geometry that has no PDF equivalent. */
export const EXAM_REPORT_XLSX_STYLE = {
  worksheetName: "Examination Report",
  /** Excel row heights in points. */
  titleRowHeights: [19, 16, 16] as const,
  headerRowHeight: 15,
  minimumRowHeight: 15.75,
  /** Extra height added for every wrapped line beyond the first. */
  wrappedLineHeight: 11.25,
  fontName: "Noto Sans Thai",
  fontSize: 9,
  titleFontSizes: [12, 10, 10] as const,
  /** A4 in the ECMA-376 paper size enumeration. */
  paperSize: 9,
  margins: {
    left: 0.25,
    right: 0.25,
    top: 0.35,
    bottom: 0.35,
    header: 0.15,
    footer: 0.15,
  },
} as const;

/** Number and date presentation shared by all three exports. */
export const EXAM_REPORT_FORMATS = {
  /** Latin-digit Gregorian day/month/year, as the repository requires. */
  excelDateFormat: "dd/mm/yyyy",
  excelMoneyFormat: "#,##0",
  /** Applied only to fractional hours; whole hours use the plain integer format
   * because Excel renders a stray trailing separator for "#,##0.#". */
  excelHoursFormat: "#,##0.0",
  moneyLocale: "en-US",
  maximumHoursDecimals: 1,
} as const;

/** Total printed width of the table in PDF points. */
export function examReportTableWidth(
  columns: readonly ExamReportColumn[] = EXAM_REPORT_COLUMNS,
) {
  return columns.reduce((total, column) => total + column.pdfWidth, 0);
}

/** Resolves the fill for a dojo code, falling back safely for unknown codes. */
export function dojoFillColor(dojoCode: string, theme: ExamReportTheme) {
  const code = dojoCode.trim().toUpperCase();
  if (!code || code === EXAM_REPORT_MISSING_VALUE) return theme.unknownDojoFill;
  return theme.dojoFills[code] || theme.unknownDojoFill;
}
