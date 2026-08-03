/**
 * Renders the examination report as a genuinely formatted XLSX package.
 *
 * The sheet mirrors the PDF: the same three heading lines, the same column
 * order and proportions, merged rank groups, and the same totals row. Element
 * order follows the ECMA-376 CT_Worksheet sequence so Excel opens it without
 * repair.
 */

import { strToU8, zipSync } from "fflate";
import { isCanonicalDate } from "../../../shared/date";
import {
  EXAM_REPORT_COLUMNS,
  EXAM_REPORT_FORMATS,
  EXAM_REPORT_MISSING_VALUE,
  EXAM_REPORT_STANDARD_THEME,
  EXAM_REPORT_TOTAL_COLUMNS,
  EXAM_REPORT_TOTAL_HIGHLIGHT_COLUMN,
  EXAM_REPORT_TOTAL_LABEL,
  EXAM_REPORT_TOTAL_LABEL_COLUMN,
  EXAM_REPORT_XLSX_STYLE,
  dojoFillColor,
  type ExamReportColumn,
} from "./examReportConfig";
import {
  reportCellText,
  type ExamReportModel,
  type ExamReportRow,
} from "./examReportModel";

const FIRST_TITLE_ROW = 1;
const HEADER_ROW = FIRST_TITLE_ROW + 3;
const FIRST_DATA_ROW = HEADER_ROW + 1;

function xmlText(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/\n/g, "&#10;");
}

/** Converts a zero-based column index into its spreadsheet letter. */
export function columnLetter(index: number) {
  let letters = "";
  for (
    let current = index + 1;
    current > 0;
    current = Math.floor((current - 1) / 26)
  ) {
    letters = String.fromCharCode(65 + ((current - 1) % 26)) + letters;
  }
  return letters;
}

/** Excel stores dates as days since 1899-12-30. */
export function excelDateSerial(value: string) {
  const time = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(time) ? null : Math.floor(time / 86_400_000) + 25_569;
}

/** Thai glyphs are wider than the width unit, so they count for a little more. */
function estimateTextUnits(text: string) {
  let units = 0;
  for (const character of text)
    units += character.charCodeAt(0) > 0x0e00 ? 1.15 : 1;
  return units;
}

/** Approximates how many wrapped lines a value needs at a given column width. */
export function estimateWrappedLines(text: string, widthInCharacters: number) {
  const source = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!source) return 1;
  const usable = Math.max(2, widthInCharacters - 1);
  let lines = 1;
  let used = 0;
  for (const word of source.split(" ")) {
    const wordUnits = estimateTextUnits(word);
    if (wordUnits > usable) {
      lines += Math.ceil((used + wordUnits) / usable) - 1;
      used = (used + wordUnits) % usable;
      continue;
    }
    const projected = used ? used + 1 + wordUnits : wordUnits;
    if (projected > usable) {
      lines += 1;
      used = wordUnits;
      continue;
    }
    used = projected;
  }
  return Math.max(1, lines);
}

type StyleSpec = {
  font: number;
  fill: number;
  border: number;
  numFmt: number;
  horizontal: "left" | "center" | "right";
  wrap: boolean;
};

/** Registers the unique cell formats the sheet needs and emits styles.xml. */
class StyleTable {
  private readonly fills: string[] = [];
  private readonly specs: StyleSpec[] = [];
  private readonly index = new Map<string, number>();

  constructor() {
    // Index 0 must be the default format for a valid styles part.
    this.register({
      font: 0,
      fill: 0,
      border: 0,
      numFmt: 0,
      horizontal: "left",
      wrap: false,
    });
  }

  fill(color: string) {
    const normalized = color.replace("#", "").toUpperCase();
    if (normalized === "FFFFFF") return 0;
    const existing = this.fills.indexOf(normalized);
    if (existing >= 0) return existing + 2; // 0 = none, 1 = gray125 placeholder
    this.fills.push(normalized);
    return this.fills.length + 1;
  }

  register(spec: StyleSpec) {
    const key = JSON.stringify(spec);
    const existing = this.index.get(key);
    if (existing !== undefined) return existing;
    const next = this.specs.length;
    this.specs.push(spec);
    this.index.set(key, next);
    return next;
  }

  toXml() {
    const font = EXAM_REPORT_XLSX_STYLE.fontName;
    const size = EXAM_REPORT_XLSX_STYLE.fontSize;
    const [titleOne, titleTwo, titleThree] =
      EXAM_REPORT_XLSX_STYLE.titleFontSizes;
    const fonts = [
      `<font><sz val="${size}"/><name val="${font}"/><family val="2"/></font>`,
      `<font><b/><sz val="${size}"/><name val="${font}"/><family val="2"/></font>`,
      `<font><b/><sz val="${titleOne}"/><name val="${font}"/><family val="2"/></font>`,
      `<font><sz val="${titleTwo}"/><name val="${font}"/><family val="2"/></font>`,
      `<font><b/><sz val="${titleThree}"/><name val="${font}"/><family val="2"/></font>`,
    ];
    const fills = [
      `<fill><patternFill patternType="none"/></fill>`,
      `<fill><patternFill patternType="gray125"/></fill>`,
      ...this.fills.map(
        (color) =>
          `<fill><patternFill patternType="solid"><fgColor rgb="FF${color}"/><bgColor indexed="64"/></patternFill></fill>`,
      ),
    ];
    const edge = `<left style="thin"><color rgb="FF000000"/></left><right style="thin"><color rgb="FF000000"/></right><top style="thin"><color rgb="FF000000"/></top><bottom style="thin"><color rgb="FF000000"/></bottom>`;
    const borders = [
      `<border><left/><right/><top/><bottom/><diagonal/></border>`,
      `<border>${edge}<diagonal/></border>`,
    ];
    const cellXfs = this.specs
      .map((spec) => {
        const attributes = [
          `numFmtId="${spec.numFmt}"`,
          `fontId="${spec.font}"`,
          `fillId="${spec.fill}"`,
          `borderId="${spec.border}"`,
          `xfId="0"`,
          spec.numFmt ? `applyNumberFormat="1"` : "",
          `applyFont="1"`,
          spec.fill ? `applyFill="1"` : "",
          spec.border ? `applyBorder="1"` : "",
          `applyAlignment="1"`,
        ]
          .filter(Boolean)
          .join(" ");
        return `<xf ${attributes}><alignment horizontal="${spec.horizontal}" vertical="center"${spec.wrap ? ' wrapText="1"' : ""}/></xf>`;
      })
      .join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="3"><numFmt numFmtId="164" formatCode="${EXAM_REPORT_FORMATS.excelDateFormat}"/><numFmt numFmtId="165" formatCode="${EXAM_REPORT_FORMATS.excelMoneyFormat}"/><numFmt numFmtId="166" formatCode="${EXAM_REPORT_FORMATS.excelHoursFormat}"/></numFmts><fonts count="${fonts.length}">${fonts.join("")}</fonts><fills count="${fills.length}">${fills.join("")}</fills><borders count="${borders.length}">${borders.join("")}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${this.specs.length}">${cellXfs}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  }
}

function numberFormatFor(column: ExamReportColumn, value: number | null) {
  if (column.kind === "date") return 164;
  if (column.kind === "money") return 165;
  // Whole hours use the integer format so Excel does not print "412." for 412.
  if (column.kind === "decimal")
    return value !== null && !Number.isInteger(value) ? 166 : 165;
  return 0;
}

type CellValue =
  { kind: "number"; number: number } | { kind: "text"; text: string };

const numberCell = (number: number): CellValue => ({ kind: "number", number });
const textCell = (text: string): CellValue => ({ kind: "text", text });

/** The typed cell value for a column, so Excel stores real dates and numbers. */
function cellValue(
  row: ExamReportRow,
  column: ExamReportColumn,
  groupCountLabel: string,
): CellValue {
  if (column.kind === "date") {
    const canonical =
      column.key === "memberDate"
        ? row.memberDate
        : column.key === "aatDate"
          ? row.aatDate
          : row.lastTestDate;
    if (isCanonicalDate(canonical)) {
      const serial = excelDateSerial(canonical);
      if (serial !== null) return numberCell(serial);
    }
    return textCell(EXAM_REPORT_MISSING_VALUE);
  }
  if (column.key === "examFee") return numberCell(row.examFee);
  if (column.key === "age")
    return row.age === null
      ? textCell(EXAM_REPORT_MISSING_VALUE)
      : numberCell(row.age);
  if (column.key === "practiceHours") {
    return row.practiceHours === null
      ? textCell(EXAM_REPORT_MISSING_VALUE)
      : numberCell(row.practiceHours);
  }
  if (column.key === "index") return numberCell(row.index);
  return textCell(reportCellText(row, column.key, groupCountLabel));
}

export function renderExamReportXlsx(model: ExamReportModel) {
  const style = EXAM_REPORT_XLSX_STYLE;
  const theme = EXAM_REPORT_STANDARD_THEME;
  const styles = new StyleTable();
  const columns = EXAM_REPORT_COLUMNS;
  const lastColumn = columnLetter(columns.length - 1);

  const titleStyles = [
    styles.register({
      font: 2,
      fill: 0,
      border: 1,
      numFmt: 0,
      horizontal: "center",
      wrap: false,
    }),
    styles.register({
      font: 3,
      fill: 0,
      border: 1,
      numFmt: 0,
      horizontal: "center",
      wrap: false,
    }),
    styles.register({
      font: 4,
      fill: 0,
      border: 0,
      numFmt: 0,
      horizontal: "center",
      wrap: false,
    }),
  ];
  const headerStyle = styles.register({
    font: 1,
    fill: 0,
    border: 1,
    numFmt: 0,
    horizontal: "center",
    wrap: true,
  });
  const groupStyle = styles.register({
    font: 0,
    fill: 0,
    border: 1,
    numFmt: 0,
    horizontal: "center",
    wrap: true,
  });

  const rows: string[] = [];
  const merges: string[] = [];

  model.titleLines.forEach((line, index) => {
    const reference = `A${FIRST_TITLE_ROW + index}`;
    merges.push(`${reference}:${lastColumn}${FIRST_TITLE_ROW + index}`);
    const cells = columns
      .map((_, columnIndex) => {
        const target = `${columnLetter(columnIndex)}${FIRST_TITLE_ROW + index}`;
        if (columnIndex === 0) {
          return `<c r="${target}" t="inlineStr" s="${titleStyles[index]}"><is><t xml:space="preserve">${xmlText(line)}</t></is></c>`;
        }
        return `<c r="${target}" s="${titleStyles[index]}"/>`;
      })
      .join("");
    rows.push(
      `<row r="${FIRST_TITLE_ROW + index}" ht="${style.titleRowHeights[index]}" customHeight="1" spans="1:${columns.length}">${cells}</row>`,
    );
  });

  // Each header label wraps independently, so the row must be tall enough for
  // the worst column or Excel clips the lower line.
  const headerLineCount = Math.max(
    2,
    ...columns.map((column) =>
      [column.headerTop, column.headerBottom]
        .filter(Boolean)
        .reduce(
          (lines, label) =>
            lines + estimateWrappedLines(label, column.excelWidth),
          0,
        ),
    ),
  );
  const headerCells = columns
    .map((column, columnIndex) => {
      const label = [column.headerTop, column.headerBottom]
        .filter(Boolean)
        .join("\n");
      return `<c r="${columnLetter(columnIndex)}${HEADER_ROW}" t="inlineStr" s="${headerStyle}"><is><t xml:space="preserve">${xmlText(label)}</t></is></c>`;
    })
    .join("");
  rows.push(
    `<row r="${HEADER_ROW}" ht="${(headerLineCount * style.headerRowHeight).toFixed(2)}" customHeight="1" spans="1:${columns.length}">${headerCells}</row>`,
  );

  model.rows.forEach((row, rowIndex) => {
    const rowNumber = FIRST_DATA_ROW + rowIndex;
    const group = model.groups.find(
      (entry) => rowIndex >= entry.start && rowIndex < entry.start + entry.size,
    );
    let wrappedLines = 1;
    const cells = columns
      .map((column, columnIndex) => {
        const reference = `${columnLetter(columnIndex)}${rowNumber}`;
        if (column.key === "testForDan" || column.key === "groupCount") {
          const isGroupStart = group?.start === rowIndex;
          const text =
            column.key === "testForDan"
              ? (group?.rank ?? "")
              : (group?.countLabel ?? "");
          if (!isGroupStart) return `<c r="${reference}" s="${groupStyle}"/>`;
          return `<c r="${reference}" t="inlineStr" s="${groupStyle}"><is><t xml:space="preserve">${xmlText(text)}</t></is></c>`;
        }
        const isNewAat = column.key === "aatNumber" && row.isNewAat;
        const fillColor =
          column.key === "dojo" && row.dojoCode !== EXAM_REPORT_MISSING_VALUE
            ? dojoFillColor(row.dojoCode, theme)
            : isNewAat
              ? theme.attentionFill
              : column.key === "aatDate" && row.aatDate
                ? theme.aatDateFill
                : "FFFFFF";
        const value = cellValue(row, column, group?.countLabel ?? "");
        const cellStyle = styles.register({
          font: isNewAat ? 1 : 0,
          fill: styles.fill(fillColor),
          border: 1,
          numFmt: numberFormatFor(
            column,
            value.kind === "number" ? value.number : null,
          ),
          horizontal: column.align,
          wrap: true,
        });
        wrappedLines = Math.max(
          wrappedLines,
          estimateWrappedLines(
            reportCellText(row, column.key, group?.countLabel ?? ""),
            column.excelWidth,
          ),
        );
        if (value.kind === "number")
          return `<c r="${reference}" s="${cellStyle}"><v>${value.number}</v></c>`;
        return `<c r="${reference}" t="inlineStr" s="${cellStyle}"><is><t xml:space="preserve">${xmlText(value.text)}</t></is></c>`;
      })
      .join("");
    const height = Math.max(
      style.minimumRowHeight,
      wrappedLines * style.wrappedLineHeight,
    );
    rows.push(
      `<row r="${rowNumber}" ht="${height.toFixed(2)}" customHeight="1" spans="1:${columns.length}">${cells}</row>`,
    );
  });

  for (const group of model.groups) {
    if (group.size < 2) continue;
    const top = FIRST_DATA_ROW + group.start;
    const bottom = top + group.size - 1;
    const rankColumn = columnLetter(
      columns.findIndex((column) => column.key === "testForDan"),
    );
    const countColumn = columnLetter(
      columns.findIndex((column) => column.key === "groupCount"),
    );
    merges.push(`${rankColumn}${top}:${rankColumn}${bottom}`);
    merges.push(`${countColumn}${top}:${countColumn}${bottom}`);
  }

  const lastDataRow = FIRST_DATA_ROW + Math.max(0, model.rows.length) - 1;
  const totalsRow = model.rows.length ? lastDataRow + 1 : FIRST_DATA_ROW;
  if (model.rows.length) {
    const labelIndex = columns.findIndex(
      (column) => column.key === EXAM_REPORT_TOTAL_LABEL_COLUMN,
    );
    const totalKeys = new Set<string>(EXAM_REPORT_TOTAL_COLUMNS);
    const cells = columns
      .map((column, columnIndex) => {
        const reference = `${columnLetter(columnIndex)}${totalsRow}`;
        if (columnIndex === labelIndex) {
          const labelStyle = styles.register({
            font: 1,
            fill: 0,
            border: 1,
            numFmt: 0,
            horizontal: "center",
            wrap: false,
          });
          return `<c r="${reference}" t="inlineStr" s="${labelStyle}"><is><t xml:space="preserve">${EXAM_REPORT_TOTAL_LABEL}</t></is></c>`;
        }
        if (!totalKeys.has(column.key)) return "";
        const letter = columnLetter(columnIndex);
        const totalStyle = styles.register({
          font: 1,
          fill: styles.fill(
            column.key === EXAM_REPORT_TOTAL_HIGHLIGHT_COLUMN
              ? theme.totalFill
              : "FFFFFF",
          ),
          border: 1,
          numFmt: 165,
          horizontal: column.align,
          wrap: false,
        });
        const total = model.totals[column.key as "examFee"];
        return `<c r="${reference}" s="${totalStyle}"><f>SUM(${letter}${FIRST_DATA_ROW}:${letter}${lastDataRow})</f><v>${total}</v></c>`;
      })
      .join("");
    rows.push(
      `<row r="${totalsRow}" ht="${style.minimumRowHeight}" customHeight="1" spans="1:${columns.length}">${cells}</row>`,
    );
  }

  const lastRow = model.rows.length ? totalsRow : HEADER_ROW;
  const cols = columns
    .map(
      (column, index) =>
        `<col min="${index + 1}" max="${index + 1}" width="${column.excelWidth}" customWidth="1"/>`,
    )
    .join("");
  const mergeXml = merges.length
    ? `<mergeCells count="${merges.length}">${merges.map((reference) => `<mergeCell ref="${reference}"/>`).join("")}</mergeCells>`
    : "";
  const margins = style.margins;

  // ECMA-376 CT_Worksheet child order: sheetPr, dimension, sheetViews,
  // sheetFormatPr, cols, sheetData, mergeCells, printOptions, pageMargins,
  // pageSetup. Excel reports the file as damaged if this order is broken.
  const worksheet =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>` +
    `<dimension ref="A1:${lastColumn}${lastRow}"/>` +
    `<sheetViews><sheetView showGridLines="0" tabSelected="1" workbookViewId="0">` +
    `<pane ySplit="${HEADER_ROW}" topLeftCell="A${FIRST_DATA_ROW}" activePane="bottomLeft" state="frozen"/>` +
    `<selection pane="bottomLeft" activeCell="A${FIRST_DATA_ROW}" sqref="A${FIRST_DATA_ROW}"/>` +
    `</sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="${style.minimumRowHeight}"/>` +
    `<cols>${cols}</cols>` +
    `<sheetData>${rows.join("")}</sheetData>` +
    mergeXml +
    `<printOptions horizontalCentered="1"/>` +
    `<pageMargins left="${margins.left}" right="${margins.right}" top="${margins.top}" bottom="${margins.bottom}" header="${margins.header}" footer="${margins.footer}"/>` +
    `<pageSetup paperSize="${style.paperSize}" orientation="landscape" fitToWidth="1" fitToHeight="0" horizontalDpi="600" verticalDpi="600"/>` +
    `</worksheet>`;

  const sheetName = style.worksheetName.slice(0, 31);
  const workbook =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<bookViews><workbookView activeTab="0"/></bookViews>` +
    `<sheets><sheet name="${xmlText(sheetName)}" sheetId="1" r:id="rId1"/></sheets>` +
    `<definedNames>` +
    `<definedName name="_xlnm.Print_Area" localSheetId="0">'${sheetName}'!$A$1:$${lastColumn}$${lastRow}</definedName>` +
    `<definedName name="_xlnm.Print_Titles" localSheetId="0">'${sheetName}'!$${HEADER_ROW}:$${HEADER_ROW}</definedName>` +
    `</definedNames>` +
    `<calcPr calcId="191029" fullCalcOnLoad="1"/>` +
    `</workbook>`;

  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    "xl/workbook.xml": strToU8(workbook),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ),
    "xl/worksheets/sheet1.xml": strToU8(worksheet),
    "xl/styles.xml": strToU8(styles.toXml()),
  };
  return zipSync(files, { level: 6 });
}
