import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildExamReportModel,
  buildExamPdf,
  buildExamXlsx,
  renderExamReportPdf,
  renderExamReportXlsx,
  type ExamExportRow,
} from "../functions/_lib/examExports";
import {
  EXAM_REPORT_COLUMNS,
  EXAM_REPORT_MISSING_VALUE,
  EXAM_REPORT_NEW_AAT_LABEL,
  EXAM_REPORT_PRINT_FRIENDLY_THEME,
  EXAM_REPORT_STANDARD_THEME,
  dojoFillColor,
  examReportTableWidth,
} from "../functions/_lib/reports/examReportConfig";
import {
  EXAM_REPORT_INCLUDED_FEE_FIELDS,
  ageOnReportDate,
  normalizePracticeHours,
  reportCellText,
} from "../functions/_lib/reports/examReportModel";
import { wrapCellText } from "../functions/_lib/reports/examReportPdf";
import {
  FIXTURE_REPORT_DATE,
  sampleExamCycle,
  sampleExamRows,
  stressExamRows,
} from "./fixtures/examReportFixture";
import { extractPdfFlatText, extractPdfPlainText } from "./helpers/pdfText";
import { loadWorkbook, overlappingMergedCells } from "./helpers/xlsxReader";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fontBytes = new Uint8Array(
  readFileSync(resolve(root, "public/fonts/NotoSansThai.ttf")),
);
const file = (path: string) => readFileSync(resolve(root, path), "utf8");

const model = buildExamReportModel(
  sampleExamCycle,
  sampleExamRows,
  "All Dojos",
);
const columnKeys = EXAM_REPORT_COLUMNS.map((column) => column.key);
const rowByName = (name: string) => {
  const row = model.rows.find((entry) => entry.studentName.includes(name));
  if (!row) throw new Error(`Fixture row not found: ${name}`);
  return row;
};

describe("age is calculated from the application birthday on the examination date", () => {
  it("does not count a birthday that falls later in the report year", () => {
    // Born 02/08/1970, report date 14/06/2026: the birthday has not happened yet.
    expect(ageOnReportDate("1970-08-02", FIXTURE_REPORT_DATE)).toBe(55);
    expect(rowByName("Sukanya Kaewsangdee").age).toBe(55);
  });

  it("counts a birthday that has already passed in the report year", () => {
    expect(ageOnReportDate("2001-03-05", FIXTURE_REPORT_DATE)).toBe(25);
    expect(rowByName("Tarnnamthip Siriwan").age).toBe(25);
  });

  it("counts the birthday itself", () => {
    expect(ageOnReportDate("1980-06-14", FIXTURE_REPORT_DATE)).toBe(46);
    expect(rowByName("Watcharapol Supajakwattana").age).toBe(46);
  });

  it("handles a leap-day birth date on either side of the anniversary", () => {
    expect(ageOnReportDate("1988-02-29", FIXTURE_REPORT_DATE)).toBe(38);
    expect(ageOnReportDate("2004-02-29", "2025-02-28")).toBe(20);
    expect(ageOnReportDate("2004-02-29", "2025-03-01")).toBe(21);
    expect(rowByName("Ping Roekphisut").age).toBe(38);
  });

  it("renders the missing-value marker and reports the issue for a missing birthday", () => {
    expect(ageOnReportDate(null, FIXTURE_REPORT_DATE)).toBeNull();
    expect(ageOnReportDate("not-a-date", FIXTURE_REPORT_DATE)).toBeNull();
    const row = rowByName("Narumol Thammapruksa");
    expect(row.age).toBeNull();
    expect(reportCellText(row, "age", "")).toBe(EXAM_REPORT_MISSING_VALUE);
    expect(model.dataIssues.join(" ")).toContain("no usable date of birth");
  });

  it("uses the examination date rather than the current date", () => {
    expect(model.reportDate).toBe(FIXTURE_REPORT_DATE);
    expect(model.reportDateIsFallback).toBe(false);
    const later = buildExamReportModel(
      sampleExamCycle,
      sampleExamRows,
      "All Dojos",
      new Date("2099-01-01T00:00:00Z"),
    );
    expect(later.rows.map((row) => row.age)).toEqual(
      model.rows.map((row) => row.age),
    );
  });
});

describe("AAT numbers", () => {
  it("shows NEW when the AAT number is missing", () => {
    const row = rowByName("Kanapod Konsri");
    expect(row.aatNumber).toBe(EXAM_REPORT_NEW_AAT_LABEL);
    expect(row.isNewAat).toBe(true);
  });

  it("shows NEW for blank and whitespace-only AAT numbers", () => {
    expect(rowByName("Watcharapol Supajakwattana").aatNumber).toBe(
      EXAM_REPORT_NEW_AAT_LABEL,
    );
    for (const value of [null, undefined, "", "   ", "\t\n"]) {
      const [row] = buildExamReportModel(
        sampleExamCycle,
        [{ ...sampleExamRows[0], aat_number: value as string | null }],
        "All Dojos",
      ).rows;
      expect(row.aatNumber).toBe(EXAM_REPORT_NEW_AAT_LABEL);
    }
    expect(rowByName("Sukanya Kaewsangdee").aatNumber).toBe("7002");
  });
});

describe("dojo abbreviations", () => {
  it("shows the canonical dojo code, never the full name or the student ID", () => {
    expect(rowByName("Ratchadaporn Siriwan").dojoCode).toBe("CMU");
    expect(rowByName("Narumol Thammapruksa").dojoCode).toBe("RSK");
    const rendered = model.rows.map((row) => row.dojoCode);
    expect(rendered).not.toContain("Chiang Mai University Aikido Club");
    expect(rendered.some((code) => code.includes("-"))).toBe(false);
  });

  it("falls back to a neutral fill for an unknown code without crashing", () => {
    expect(rowByName("Kanapod Konsri").dojoCode).toBe("ZZZ");
    expect(dojoFillColor("ZZZ", EXAM_REPORT_STANDARD_THEME)).toBe(
      EXAM_REPORT_STANDARD_THEME.unknownDojoFill,
    );
    expect(dojoFillColor("CMU", EXAM_REPORT_STANDARD_THEME)).toBe("DDB6F6");
    expect(() => renderExamReportXlsx(model)).not.toThrow();
  });
});

describe("practice hours", () => {
  it("uses real accumulated training duration rather than a day count", () => {
    expect(rowByName("Sukanya Kaewsangdee").practiceHours).toBe(412);
    expect(
      reportCellText(rowByName("Chucheep Soontaranont"), "practiceHours", ""),
    ).toBe("1,544");
  });

  it("keeps partial hours to one decimal without trailing noise", () => {
    expect(normalizePracticeHours(12.5)).toBe(12.5);
    expect(normalizePracticeHours(12.500000001)).toBe(12.5);
    expect(normalizePracticeHours(12)).toBe(12);
    expect(
      reportCellText(rowByName("Tarnnamthip Siriwan"), "practiceHours", ""),
    ).toBe("268.5");
  });

  it("reports missing duration instead of inventing a value", () => {
    expect(normalizePracticeHours(null)).toBeNull();
    expect(normalizePracticeHours(-4)).toBeNull();
    const row = rowByName("Siriphorn Manokaew");
    expect(row.practiceHours).toBeNull();
    expect(reportCellText(row, "practiceHours", "")).toBe(
      EXAM_REPORT_MISSING_VALUE,
    );
    expect(model.dataIssues.join(" ")).toContain("no verified training hours");
  });
});

describe("columns and fees", () => {
  it("declares the required columns in the required order", () => {
    expect(columnKeys).toEqual([
      "index",
      "testForDan",
      "groupCount",
      "aatNumber",
      "studentIdNumber",
      "memberDate",
      "studentName",
      "age",
      "dojo",
      "presentRank",
      "lastTest",
      "herebyRank",
      "practiceHours",
      "gradeGiven",
      "examFee",
      "aatDate",
    ]);
    expect(
      EXAM_REPORT_COLUMNS.map((column) =>
        `${column.headerTop} ${column.headerBottom}`.trim(),
      ),
    ).toContain("Practice Hours");
  });

  it("shows the database Student ID directly after the AAT number", () => {
    expect(columnKeys.indexOf("studentIdNumber")).toBe(
      columnKeys.indexOf("aatNumber") + 1,
    );
    const column = EXAM_REPORT_COLUMNS.find(
      (entry) => entry.key === "studentIdNumber",
    );
    expect(`${column?.headerTop} ${column?.headerBottom}`).toBe(
      "Student ID No.",
    );
    expect(rowByName("Narumol Thammapruksa").studentIdNumber).toBe("RSK-6914");
    expect(
      reportCellText(rowByName("Kanapod Konsri"), "studentIdNumber", ""),
    ).toBe("ZZZ-6904");
  });

  it("takes Member Date from the account creation date", () => {
    expect(rowByName("Sukanya Kaewsangdee").memberDate).toBe("2016-05-16");
    expect(
      reportCellText(rowByName("Sukanya Kaewsangdee"), "memberDate", ""),
    ).toBe("16/05/2016");
    // No account creation date recorded: the missing-value marker, not a guess.
    expect(rowByName("Kanapod Konsri").memberDate).toBeNull();
  });

  it("shows the last AAT annual membership payment date in AAT. Date", () => {
    // Renewal falls on 16/05/2027, so the payment behind it is 16/05/2026.
    expect(rowByName("Sukanya Kaewsangdee").aatDate).toBe("2026-05-16");
    expect(
      reportCellText(rowByName("Sukanya Kaewsangdee"), "aatDate", ""),
    ).toBe("16/05/2026");
    expect(rowByName("Kanapod Konsri").aatDate).toBeNull();
    expect(reportCellText(rowByName("Kanapod Konsri"), "aatDate", "")).toBe(
      EXAM_REPORT_MISSING_VALUE,
    );
  });

  it("keeps Grade Given matching Hereby Rank", () => {
    for (const row of model.rows) expect(row.gradeGiven).toBe(row.herebyRank);
    // An application with no recorded grade still prints the requested rank.
    const [row] = buildExamReportModel(
      sampleExamCycle,
      [{ ...sampleExamRows[0], grade_given: "" }],
      "All Dojos",
    ).rows;
    expect(row.gradeGiven).toBe(row.herebyRank);
    expect(row.gradeGiven).toBe("SHO Dan-Ho");
  });

  it("has no Annual Fee, Yen, TOTAL (Baht), or Practice Days column anywhere", () => {
    const configuration = file("functions/_lib/reports/examReportConfig.ts");
    for (const removed of [
      "Annual",
      "Yen",
      "TOTAL",
      "Practice Days",
      "aat_annual_fee",
      "other_fees",
    ]) {
      expect(columnKeys.join(" ")).not.toContain(removed);
      expect(configuration).not.toContain(`headerTop: "${removed}"`);
    }
    expect(file("functions/api/admin/examinations/export.ts")).not.toContain(
      "aat_annual_fee",
    );
    expect(file("functions/api/admin/examinations/export.ts")).not.toContain(
      "other_fees",
    );
  });

  it("totals only the fee fields the report still includes", () => {
    expect(EXAM_REPORT_INCLUDED_FEE_FIELDS).toEqual(["examFee"]);
    expect(Object.keys(model.totals)).toEqual(["examFee"]);
    const expected = sampleExamRows.reduce((sum, row) => sum + row.exam_fee, 0);
    expect(model.totals.examFee).toBe(expected);
    expect(model.totals.examFee).toBe(50_500);
  });

  it("falls back to the standard fee when no application fee was stored", () => {
    // A student marked paid on the roster has no application fee snapshot.
    const [row] = buildExamReportModel(
      sampleExamCycle,
      [{ ...sampleExamRows[0], attempted_rank: "1 Kyu", exam_fee: 0 }],
      "All Dojos",
    ).rows;
    expect(row.examFee).toBe(1400);
    // A stored fee always wins over the standard fee.
    expect(rowByName("Sukanya Kaewsangdee").examFee).toBe(2000);
  });

  it("groups repeated requested ranks with a reference-style count", () => {
    expect(
      model.groups.map((group) => [group.rank, group.size, group.countLabel]),
    ).toEqual([
      ["SHO Dan-Ho", 1, "1 คน"],
      ["1st Dan", 1, "1 คน"],
      ["2nd Dan", 8, "8 คน"],
      ["3rd Dan", 4, "4 คน"],
    ]);
  });
});

describe("report scope", () => {
  it("exports only the selected dojo when a scope is applied", () => {
    const scoped = sampleExamRows.filter((row) => row.dojo_code === "CMU");
    const scopedModel = buildExamReportModel(
      sampleExamCycle,
      scoped,
      "Chiang Mai University Aikido Club",
    );
    expect(scopedModel.rows.length).toBe(scoped.length);
    expect([...new Set(scopedModel.rows.map((row) => row.dojoCode))]).toEqual([
      "CMU",
    ]);
    expect(scopedModel.rows.length).toBeLessThan(model.rows.length);
    expect(scopedModel.totals.examFee).toBeLessThan(model.totals.examFee);
    expect(scopedModel.titleLines[1]).toContain(
      "Chiang Mai University Aikido Club",
    );
  });

  it("exports only students marked paid for the selected cycle", () => {
    const endpoint = file("functions/api/admin/examinations/export.ts");
    expect(endpoint).toContain("FROM exam_cycle_student_status ecs");
    expect(endpoint).toContain("ecs.status = 'paid'");
    expect(endpoint).toContain("WHERE ecs.cycle_id = ?");
    // A paid student without a submitted application still has to appear.
    expect(endpoint).toContain("LEFT JOIN examination_applications ea");
    expect(endpoint).not.toContain("FROM examination_applications ea\n");
  });

  it("keeps the endpoint's authorization and dojo filter intact", () => {
    const endpoint = file("functions/api/admin/examinations/export.ts");
    expect(endpoint).toContain("getAuthorizedAdminSession");
    expect(endpoint).toContain("canAccessDojo");
    expect(endpoint).toContain("isRenShinKanSuperAdmin");
    expect(endpoint).toContain('dojoId ? "AND s.dojo_id = ?" : ""');
    expect(endpoint).toContain("All Dojos");
    expect(endpoint).toContain("NotoSansThai.ttf");
    // A single normalized model feeds every format.
    expect(endpoint).toContain("buildExamReportModel");
    expect((endpoint.match(/buildExamReportModel\(/g) || []).length).toBe(1);
  });
});

describe("layout safeguards", () => {
  it("fits the declared column widths inside a printable A4 landscape page", () => {
    expect(examReportTableWidth()).toBeLessThanOrEqual(841.89 - 18 * 2);
    expect(EXAM_REPORT_COLUMNS.every((column) => column.pdfWidth >= 18)).toBe(
      true,
    );
    expect(EXAM_REPORT_COLUMNS.every((column) => column.excelWidth >= 3)).toBe(
      true,
    );
  });

  it("wraps a long student name instead of shortening it", () => {
    const name = "Ms. Kanyaphat Chalermwongsakul Rattanaphichetkul";
    const measure = (text: string) => text.length * 3.6;
    const lines = wrapCellText(name, measure, 140);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(" ")).toBe(name);
    expect(lines.join("")).not.toContain("…");
    expect(rowByName("Kanyaphat").studentName).toBe(name);
  });

  it("wraps a long Thai value and keeps every Thai mark attached", () => {
    const heading = model.titleLines[0];
    const lines = wrapCellText(heading, (text) => text.length * 4, 40);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join("")).toBe(heading);
    // A Thai vowel or tone mark must never start a wrapped line.
    for (const line of lines) expect(/^[ัิ-ฺ็-๎]/.test(line)).toBe(false);
  });

  it("breaks an unspaced value rather than letting it overflow", () => {
    const token = "A".repeat(200);
    const lines = wrapCellText(token, (text) => text.length * 4, 40);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join("")).toBe(token);
    expect(
      Math.max(...lines.map((line) => line.length * 4)),
    ).toBeLessThanOrEqual(40);
  });
});

describe("PDF exports", () => {
  it("renders a valid, non-empty, selectable-text A4 landscape PDF", async () => {
    const bytes = await renderExamReportPdf(model, { fontBytes });
    expect(new TextDecoder().decode(bytes.slice(0, 8))).toContain("%PDF");
    expect(bytes.length).toBeGreaterThan(5_000);
    const text = await extractPdfPlainText(bytes);
    expect(text.length).toBeGreaterThan(500);
    for (const expected of [
      "AAT.",
      "Practice",
      "Hours",
      "TOTAL",
      "NEW",
      "Name & Surname",
      "50,500",
    ]) {
      expect(text).toContain(expected);
    }
    for (const removed of ["Annual", "Yen", "Practice Days"])
      expect(text).not.toContain(removed);
  });

  it("renders Thai heading lines and Thai body text with real glyphs", async () => {
    const text = await extractPdfPlainText(
      await renderExamReportPdf(model, { fontBytes }),
    );
    expect(text).toContain("รายชื่อนักไอคิโดสายดำที่ทำการสอบเลื่อนสาย");
    expect(text).toContain("จากกลุ่มไอคิโดภาคเหนือ");
    expect(text).toContain("มหาวิทยาลัยเชียงใหม่");
    expect(text).toContain("คน");
    // No replacement characters, missing-glyph boxes, or question-mark fallbacks.
    expect(text).not.toMatch(/[�□]/);
  });

  it("produces the same values in the standard and print-friendly variants", async () => {
    const [standard, printFriendly] = await Promise.all([
      renderExamReportPdf(model, { fontBytes }),
      renderExamReportPdf(model, { fontBytes, printFriendly: true }),
    ]);
    expect(new TextDecoder().decode(printFriendly.slice(0, 8))).toContain(
      "%PDF",
    );
    expect(printFriendly.length).toBeGreaterThan(5_000);
    const [standardText, printText] = await Promise.all([
      extractPdfPlainText(standard),
      extractPdfPlainText(printFriendly),
    ]);
    expect(printText).toBe(standardText);
  });

  it("keeps emphasis without colour in the print-friendly theme", () => {
    expect(EXAM_REPORT_PRINT_FRIENDLY_THEME.emphasiseWithoutColour).toBe(true);
    expect(
      Object.keys(EXAM_REPORT_PRINT_FRIENDLY_THEME.dojoFills),
    ).toHaveLength(0);
    expect(EXAM_REPORT_PRINT_FRIENDLY_THEME.attentionFill).not.toBe(
      EXAM_REPORT_STANDARD_THEME.attentionFill,
    );
    // A neutral tint still reproduces on a monochrome printer.
    const [red, green, blue] = [0, 2, 4].map((offset) =>
      parseInt(
        EXAM_REPORT_PRINT_FRIENDLY_THEME.attentionFill.slice(
          offset,
          offset + 2,
        ),
        16,
      ),
    );
    expect(red).toBe(green);
    expect(green).toBe(blue);
  });

  it("repeats the header and keeps whole rows across a multi-page report", async () => {
    const large = buildExamReportModel(
      sampleExamCycle,
      stressExamRows(64),
      "All Dojos",
    );
    const bytes = await renderExamReportPdf(large, { fontBytes });
    const text = await extractPdfPlainText(bytes);
    expect(text.split("Name & Surname").length - 1).toBeGreaterThan(1);
    expect(text).toContain("Page 1 of ");
    expect(text).toContain("Page 3 of 3");
    expect(large.rows).toHaveLength(64);
  });
});

describe("Excel export", () => {
  const workbook = loadWorkbook(renderExamReportXlsx(model));

  it("is a real XLSX package that reopens successfully", () => {
    const bytes = renderExamReportXlsx(model);
    expect([...bytes.slice(0, 2)]).toEqual([80, 75]);
    expect(bytes.length).toBeGreaterThan(2_000);
    const reopened = loadWorkbook(bytes);
    expect(reopened.entries).toContain("xl/worksheets/sheet1.xml");
    expect(reopened.entries).toContain("xl/styles.xml");
    expect(reopened.entries).toContain("xl/workbook.xml");
    expect(reopened.cells.size).toBeGreaterThan(100);
    expect(reopened.sheetName).toBe("Examination Report");
    expect(reopened.sheetName.length).toBeLessThanOrEqual(31);
  });

  it("carries the required headers and none of the removed ones", () => {
    const header = [...workbook.cells.values()]
      .filter((cell) => cell.reference.endsWith("4"))
      .map((cell) => cell.value.replace("\n", " "));
    expect(header).toContain("Practice Hours");
    expect(header).toContain("AAT. No");
    expect(header).toContain("Student ID No.");
    expect(header).toContain("Name & Surname");
    for (const removed of [
      "Annual Fee",
      "Yen",
      "TOTAL (Baht)",
      "Practice Days",
    ]) {
      expect(workbook.sheetXml).not.toContain(removed);
    }
  });

  it("stores dates, ages, hours, and money as numbers with number formats", () => {
    // F5 is the first Member Date: a real Excel date serial, not text.
    expect(workbook.cells.get("F5")?.type).toBe("");
    expect(Number(workbook.cells.get("F5")?.value)).toBeGreaterThan(40_000);
    expect(workbook.cells.get("E5")?.value).toBe("AG-6901");
    expect(workbook.cells.get("H5")?.value).toBe("55");
    expect(workbook.cells.get("M5")?.value).toBe("412");
    expect(workbook.cells.get("M6")?.value).toBe("268.5");
    expect(workbook.cells.get("O5")?.value).toBe("2000");
    // P5 is the first AAT. Date: also a real Excel date serial.
    expect(Number(workbook.cells.get("P5")?.value)).toBeGreaterThan(40_000);
    expect(workbook.stylesXml).toContain('formatCode="dd/mm/yyyy"');
    expect(workbook.stylesXml).toContain('formatCode="#,##0"');
    expect(workbook.stylesXml).toContain('formatCode="#,##0.0"');
  });

  it("shows NEW for the missing-AAT record and marks it for attention", () => {
    const newCells = [...workbook.cells.values()].filter(
      (cell) => cell.value === "NEW",
    );
    expect(newCells).toHaveLength(2);
    expect(newCells.every((cell) => cell.reference.startsWith("D"))).toBe(true);
    expect(workbook.stylesXml).toContain(
      `rgb="FF${EXAM_REPORT_STANDARD_THEME.attentionFill}"`,
    );
  });

  it("totals with formulas that match the computed values", () => {
    const totalsRow = 4 + model.rows.length + 1;
    expect(workbook.cells.get(`N${totalsRow}`)?.value).toBe("TOTAL");
    const examFee = workbook.cells.get(`O${totalsRow}`);
    expect(examFee?.formula).toBe(`SUM(O5:O${totalsRow - 1})`);
    expect(Number(examFee?.value)).toBe(model.totals.examFee);
    // No formula may reference a column that was removed from the report.
    for (const cell of workbook.cells.values()) {
      if (cell.formula) expect(cell.formula).toMatch(/^SUM\(O\d+:O\d+\)$/);
    }
  });

  it("merges the titles and the rank groups without overlapping ranges", () => {
    expect(workbook.merges).toContain("A1:P1");
    expect(workbook.merges).toContain("A2:P2");
    expect(workbook.merges).toContain("A3:P3");
    // The eight 2nd Dan applicants are merged in the rank and count columns.
    expect(workbook.merges).toContain("B7:B14");
    expect(workbook.merges).toContain("C7:C14");
    expect(overlappingMergedCells(workbook.merges)).toEqual([]);
  });

  it("is set up to print as A4 landscape, one page wide", () => {
    expect(workbook.pageSetup).toMatchObject({
      paperSize: "9",
      orientation: "landscape",
      fitToWidth: "1",
      fitToHeight: "0",
    });
    expect(workbook.sheetXml).toContain('<pageSetUpPr fitToPage="1"/>');
    expect(workbook.sheetXml).toContain('showGridLines="0"');
    expect(workbook.sheetXml).toContain('state="frozen"');
    expect(workbook.sheetXml).toContain("<pageMargins");
    expect(workbook.definedNames["_xlnm.Print_Area"]).toBe(
      "'Examination Report'!$A$1:$P$19",
    );
    expect(workbook.definedNames["_xlnm.Print_Titles"]).toBe(
      "'Examination Report'!$4:$4",
    );
  });

  it("keeps the ECMA-376 worksheet child order Excel requires", () => {
    const order = [
      "<sheetPr>",
      "<dimension",
      "<sheetViews>",
      "<sheetFormatPr",
      "<cols>",
      "<sheetData>",
      "<mergeCells",
      "<printOptions",
      "<pageMargins",
      "<pageSetup",
    ];
    const positions = order.map((tag) => workbook.sheetXml.indexOf(tag));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});

describe("all three exports agree", () => {
  it("uses the same normalized rows for the PDF and the workbook", async () => {
    const workbook = loadWorkbook(renderExamReportXlsx(model));
    const bytes = await renderExamReportPdf(model, { fontBytes });
    // Flattened so a name wrapped over two lines still matches in full.
    const pdfText = await extractPdfFlatText(bytes);
    for (const row of model.rows) {
      expect(workbook.texts).toContain(row.studentName);
      expect(pdfText).toContain(row.studentName);
    }
    expect(workbook.texts.filter((value) => value === "NEW")).toHaveLength(2);
    expect(pdfText.split("NEW").length - 1).toBe(2);
    // Both formats report the identical grand total.
    const totalsRow = 4 + model.rows.length + 1;
    expect(Number(workbook.cells.get(`O${totalsRow}`)?.value)).toBe(
      model.totals.examFee,
    );
    expect(pdfText).toContain(model.totals.examFee.toLocaleString("en-US"));
  });

  it("returns non-empty valid files for all three download actions", async () => {
    const rows: readonly ExamExportRow[] = sampleExamRows;
    const [standard, printFriendly] = await Promise.all([
      buildExamPdf(sampleExamCycle, rows, "All Dojos", fontBytes, false),
      buildExamPdf(sampleExamCycle, rows, "All Dojos", fontBytes, true),
    ]);
    const workbook = buildExamXlsx(sampleExamCycle, rows, "All Dojos");
    expect(new TextDecoder().decode(standard.slice(0, 5))).toBe("%PDF-");
    expect(new TextDecoder().decode(printFriendly.slice(0, 5))).toBe("%PDF-");
    expect([...workbook.slice(0, 2)]).toEqual([80, 75]);
    for (const bytes of [standard, printFriendly, workbook])
      expect(bytes.length).toBeGreaterThan(2_000);
  });

  it("serves each format with the right content type and file name", () => {
    const endpoint = file("functions/api/admin/examinations/export.ts");
    expect(endpoint).toContain(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(endpoint).toContain('contentType = "application/pdf"');
    expect(endpoint).toContain('extension = "xlsx"');
    expect(endpoint).toContain('extension = "pdf"');
    expect(endpoint).toContain("model.reportDate");
    expect(endpoint).toContain('printFriendly ? "print-friendly" : ""');
    expect(endpoint).toContain("attachment; filename=");
  });

  it("keeps the three download buttons wired to the shared endpoint", () => {
    const ui = file("src/components/admin/AdminExamApplications.tsx");
    expect(ui).toContain('download("pdf")');
    expect(ui).toContain('download("pdf", true)');
    expect(ui).toContain('download("xlsx")');
    expect(ui).toContain('params.set("monochrome", "1")');
    expect(ui).toContain('if (exportDojo) params.set("dojoId", exportDojo)');
    expect(ui).toContain("/api/admin/examinations/export?");
  });
});
