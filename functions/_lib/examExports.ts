import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";
import { strToU8, zipSync } from "fflate";
import { formatGregorianDate } from "../../shared/date";

export type ExamExportRow = {
  public_student_id: string; student_name: string; dojo_name: string; dojo_code: string;
  aat_number: string | null; aat_last_paid_date: string | null; current_rank: string;
  attempted_rank: string; last_examination_date: string | null; practice_period: string;
  grade_given: string; exam_fee: number; aat_annual_fee: number; other_fees: number;
  total_fee: number; notes: string; answers_json: string;
};

export type ExamExportCycle = {
  title: string; name: string; rank_category: string; examination_at: string | null;
  venue: string; instructions: string;
};

const headers = ["No.", "Test rank", "Rank count", "AAT no.", "Member date", "Name and surname", "Age", "Dojo", "Present rank", "Last test", "Practice", "Grade", "Exam fee", "Annual fee", "Other fees", "Total", "Notes", "AAT expires"];

function answer(row: ExamExportRow, ...names: string[]) {
  try {
    const value = JSON.parse(row.answers_json) as Record<string, unknown>;
    for (const name of names) if (typeof value[name] === "string" || typeof value[name] === "number") return String(value[name]);
  } catch { /* A malformed legacy answer set should not prevent an authorized export. */ }
  return "";
}

function addYear(date: string | null) {
  if (!date) return "";
  const parsed = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf())) return "";
  parsed.setUTCFullYear(parsed.getUTCFullYear() + 1);
  return parsed.toISOString().slice(0, 10);
}

function values(rows: ExamExportRow[]) {
  const counts = new Map<string, number>();
  rows.forEach((row) => counts.set(row.attempted_rank, (counts.get(row.attempted_rank) || 0) + 1));
  return rows.map((row, index) => [
    index + 1, row.attempted_rank, counts.get(row.attempted_rank) || 0, row.aat_number || "NEW",
    row.aat_last_paid_date || "", row.student_name, answer(row, "age", "studentAge"), row.dojo_code,
    row.current_rank, row.last_examination_date || "", row.practice_period || answer(row, "practiceDays", "practicePeriod"),
    row.grade_given, row.exam_fee, row.aat_annual_fee, row.other_fees, row.total_fee,
    row.notes || answer(row, "notes"), addYear(row.aat_last_paid_date),
  ]);
}

function xml(value: unknown) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function columnName(index: number) {
  let result = "";
  for (let current = index + 1; current > 0; current = Math.floor((current - 1) / 26)) result = String.fromCharCode(65 + ((current - 1) % 26)) + result;
  return result;
}

function excelSerial(value: string) {
  const time = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(time) ? null : Math.floor(time / 86_400_000) + 25_569;
}

function cell(ref: string, value: unknown, style = 0) {
  if (typeof value === "number") return `<c r="${ref}"${style ? ` s="${style}"` : ""}><v>${value}</v></c>`;
  return `<c r="${ref}" t="inlineStr"${style ? ` s="${style}"` : ""}><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
}

export function buildExamXlsx(cycle: ExamExportCycle, rows: ExamExportRow[], scopeLabel: string) {
  const data = values(rows);
  const dateColumns = new Set([4, 9, 17]);
  const moneyColumns = new Set([12, 13, 14, 15]);
  const tableRows = data.map((row, rowIndex) => `<row r="${rowIndex + 2}">${row.map((value, columnIndex) => {
    const ref = `${columnName(columnIndex)}${rowIndex + 2}`;
    if (dateColumns.has(columnIndex) && typeof value === "string" && value) {
      const serial = excelSerial(value);
      if (serial != null) return cell(ref, serial, 2);
    }
    return cell(ref, value, moneyColumns.has(columnIndex) ? 3 : 0);
  }).join("")}</row>`).join("");
  const totalRow = data.length + 2;
  const totals = `<row r="${totalRow}">${cell(`A${totalRow}`, "TOTAL", 1)}${[12, 13, 14, 15].map((column) => `<c r="${columnName(column)}${totalRow}" s="3"><f>SUM(${columnName(column)}2:${columnName(column)}${Math.max(2, totalRow - 1)})</f><v>0</v></c>`).join("")}</row>`;
  const widths = [7, 14, 11, 14, 15, 28, 8, 12, 15, 15, 18, 14, 13, 13, 13, 14, 28, 15];
  const worksheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("")}</cols><sheetData><row r="1">${headers.map((header, index) => cell(`${columnName(index)}1`, header, 1)).join("")}</row>${tableRows}${totals}</sheetData><autoFilter ref="A1:R${Math.max(2, totalRow - 1)}"/><pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/></worksheet>`;
  const summary = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="28" customWidth="1"/><col min="2" max="2" width="45" customWidth="1"/></cols><sheetData>${[
    ["Examination report", cycle.title || cycle.name], ["Scope", scopeLabel], ["Category", cycle.rank_category],
    ["Examination date", formatGregorianDate(cycle.examination_at, "")], ["Venue", cycle.venue], ["Students", rows.length],
    ["Exam fees", { formula: `SUM('Applications'!M2:M${Math.max(2, data.length + 1)})` }],
    ["Annual fees", { formula: `SUM('Applications'!N2:N${Math.max(2, data.length + 1)})` }],
    ["Grand total", { formula: `SUM('Applications'!P2:P${Math.max(2, data.length + 1)})` }],
  ].map((row, index) => `<row r="${index + 1}">${cell(`A${index + 1}`, row[0], 1)}${typeof row[1] === "object" ? `<c r="B${index + 1}" s="3"><f>${(row[1] as { formula: string }).formula}</f><v>0</v></c>` : cell(`B${index + 1}`, row[1])}</row>`).join("")}</sheetData></worksheet>`;
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Applications" sheetId="1" r:id="rId1"/><sheet name="Summary" sheetId="2" r:id="rId2"/></sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    "xl/styles.xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="#,##0.00"/></numFmts><fonts count="2"><font><sz val="10"/><name val="Noto Sans Thai"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Noto Sans Thai"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF26382D"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="1" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>`),
    "xl/worksheets/sheet1.xml": strToU8(worksheet), "xl/worksheets/sheet2.xml": strToU8(summary),
  };
  return zipSync(files, { level: 6 });
}

function fit(text: string, max: number) { return text.length > max ? `${text.slice(0, Math.max(1, max - 1))}…` : text; }

export async function buildExamPdf(cycle: ExamExportCycle, rows: ExamExportRow[], scopeLabel: string, fontBytes: Uint8Array, monochrome: boolean) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes, { subset: true });
  const pageSize: [number, number] = [1190.55, 841.89];
  const margin = 30; const titleHeight = 74; const rowHeight = 26; const headerHeight = 34;
  const widths = [28, 60, 35, 60, 62, 128, 30, 50, 60, 62, 66, 49, 54, 54, 54, 59, 113, 62];
  const data = values(rows);
  const bodyColor = rgb(0.08, 0.09, 0.08); const accent = monochrome ? bodyColor : rgb(0.12, 0.27, 0.19);
  let pageNumber = 0; let page = doc.addPage(pageSize); let y = pageSize[1] - margin;
  const drawHeader = () => {
    pageNumber += 1;
    page.drawText(cycle.title || cycle.name, { x: margin, y: y - 18, size: 16, font, color: accent });
    page.drawText(`${scopeLabel}  •  ${formatGregorianDate(cycle.examination_at, "Date not set")}  •  ${cycle.venue || "Venue not set"}`, { x: margin, y: y - 40, size: 9, font, color: bodyColor });
    page.drawText(`Page ${pageNumber}`, { x: pageSize[0] - margin - 55, y: y - 18, size: 8, font, color: bodyColor });
    y -= titleHeight;
    let x = margin;
    headers.forEach((header, index) => { page.drawRectangle({ x, y: y - headerHeight, width: widths[index], height: headerHeight, color: monochrome ? rgb(.9,.9,.9) : rgb(.87,.92,.88), borderColor: bodyColor, borderWidth: .35 }); page.drawText(fit(header, Math.max(4, Math.floor(widths[index] / 5.2))), { x: x + 2, y: y - 21, size: 7, font, color: bodyColor }); x += widths[index]; });
    y -= headerHeight;
  };
  drawHeader();
  data.forEach((row, rowIndex) => {
    if (y - rowHeight < margin + 20) { page = doc.addPage(pageSize); y = pageSize[1] - margin; drawHeader(); }
    let x = margin;
    row.forEach((value, index) => { page.drawRectangle({ x, y: y - rowHeight, width: widths[index], height: rowHeight, borderColor: rgb(.45,.45,.45), borderWidth: .25 }); const shown = typeof value === "number" && index >= 12 ? value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(value); page.drawText(fit(shown, Math.max(3, Math.floor(widths[index] / 4.6))), { x: x + 2, y: y - 16, size: 7.1, font, color: bodyColor }); x += widths[index]; });
    y -= rowHeight;
    if (rowIndex === data.length - 1) {
      const totals = rows.reduce((sum, item) => ({ exam: sum.exam + item.exam_fee, annual: sum.annual + item.aat_annual_fee, other: sum.other + item.other_fees, total: sum.total + item.total_fee }), { exam: 0, annual: 0, other: 0, total: 0 });
      page.drawText(`Students: ${rows.length}     Exam fees: ${totals.exam.toLocaleString()}     Annual fees: ${totals.annual.toLocaleString()}     Other fees: ${totals.other.toLocaleString()}     Grand total: ${totals.total.toLocaleString()} THB`, { x: margin, y: y - 17, size: 9, font, color: accent });
    }
  });
  if (!data.length) page.drawText("No examination applications match this report scope.", { x: margin, y: y - 20, size: 11, font, color: bodyColor });
  doc.setTitle(`${cycle.title || cycle.name} – ${scopeLabel}`); doc.setAuthor("RenShinKan Dojo"); doc.setCreator("RenShinKan administration");
  return doc.save();
}
