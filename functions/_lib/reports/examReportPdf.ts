/**
 * Renders the examination report as an A4 landscape PDF with pdf-lib.
 *
 * The standard and print-friendly variants share this renderer and differ only
 * by the theme they are given, so both always contain identical values.
 */

import fontkit from "@pdf-lib/fontkit";
import {
  PDFDocument,
  TextRenderingMode,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setLineWidth,
  setStrokingRgbColor,
  setTextRenderingMode,
  type PDFFont,
  type PDFPage,
  type RGB,
} from "pdf-lib";
import {
  EXAM_REPORT_COLUMNS,
  EXAM_REPORT_MISSING_VALUE,
  EXAM_REPORT_PDF_STYLE,
  EXAM_REPORT_PRINT_FRIENDLY_THEME,
  EXAM_REPORT_STANDARD_THEME,
  EXAM_REPORT_TOTAL_COLUMNS,
  EXAM_REPORT_TOTAL_HIGHLIGHT_COLUMN,
  EXAM_REPORT_TOTAL_LABEL,
  EXAM_REPORT_TOTAL_LABEL_COLUMN,
  dojoFillColor,
  examReportTableWidth,
  type ExamReportColumn,
  type ExamReportTheme,
} from "./examReportConfig";
import {
  formatReportMoney,
  reportCellText,
  type ExamReportModel,
  type ExamReportRow,
} from "./examReportModel";

/** Thai vowels and tone marks that must stay attached to their base letter. */
const THAI_COMBINING_MARK = /[ัิ-ฺ็-๎]/;

type Measure = (text: string) => number;

type LaidOutRow = {
  row: ExamReportRow;
  /** Wrapped lines per column, in `EXAM_REPORT_COLUMNS` order. */
  cells: string[][];
  height: number;
  groupIndex: number;
};

function toColor(hex: string): RGB {
  const value = hex.replace("#", "");
  return rgb(
    parseInt(value.slice(0, 2), 16) / 255,
    parseInt(value.slice(2, 4), 16) / 255,
    parseInt(value.slice(4, 6), 16) / 255,
  );
}

/** Splits text into clusters so a line break never detaches a Thai mark. */
function graphemeClusters(text: string) {
  const clusters: string[] = [];
  for (const character of text) {
    if (clusters.length && THAI_COMBINING_MARK.test(character)) {
      clusters[clusters.length - 1] += character;
      continue;
    }
    clusters.push(character);
  }
  return clusters;
}

/** Breaks a single token that is wider than the cell, without dropping text. */
function breakLongToken(token: string, measure: Measure, maxWidth: number) {
  const pieces: string[] = [];
  let current = "";
  for (const cluster of graphemeClusters(token)) {
    const candidate = current + cluster;
    if (current && measure(candidate) > maxWidth) {
      pieces.push(current);
      current = cluster;
      continue;
    }
    current = candidate;
  }
  if (current) pieces.push(current);
  return pieces.length ? pieces : [""];
}

/** Wraps cell text to the available width. No text is ever truncated. */
export function wrapCellText(
  value: string,
  measure: Measure,
  maxWidth: number,
) {
  const source = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!source) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of source.split(" ")) {
    const candidate = current ? `${current} ${word}` : word;
    if (measure(candidate) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) {
      lines.push(current);
      current = "";
    }
    if (measure(word) <= maxWidth) {
      current = word;
      continue;
    }
    const pieces = breakLongToken(word, measure, maxWidth);
    for (let index = 0; index < pieces.length - 1; index += 1)
      lines.push(pieces[index]);
    current = pieces[pieces.length - 1] || "";
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

export type ExamReportPdfOptions = {
  fontBytes: Uint8Array;
  /** Renders the monochrome variant when true. */
  printFriendly?: boolean;
};

export async function renderExamReportPdf(
  model: ExamReportModel,
  options: ExamReportPdfOptions,
) {
  const style = EXAM_REPORT_PDF_STYLE;
  const theme: ExamReportTheme = options.printFriendly
    ? EXAM_REPORT_PRINT_FRIENDLY_THEME
    : EXAM_REPORT_STANDARD_THEME;

  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const font = await document.embedFont(options.fontBytes, { subset: true });

  const availableWidth = style.pageWidth - style.minimumHorizontalMargin * 2;
  const declaredWidth = examReportTableWidth();
  // Explicit widths already fit A4 landscape; this only guards a future edit.
  const widthScale =
    declaredWidth > availableWidth ? availableWidth / declaredWidth : 1;
  const columns = EXAM_REPORT_COLUMNS.map((column) => ({
    ...column,
    pdfWidth: column.pdfWidth * widthScale,
  }));
  const bodySize = Math.max(
    style.minimumFontSize,
    style.bodyFontSize * widthScale,
  );
  const headerSize = Math.max(
    style.minimumFontSize,
    style.headerFontSize * widthScale,
  );
  const lineHeight = style.lineHeight * widthScale;
  const tableWidth = columns.reduce(
    (total, column) => total + column.pdfWidth,
    0,
  );
  const tableLeft = (style.pageWidth - tableWidth) / 2;

  const textColor = toColor(theme.textColor);
  const borderColor = toColor(theme.borderColor);

  const columnLeft = new Map<string, number>();
  let cursor = tableLeft;
  for (const column of columns) {
    columnLeft.set(column.key, cursor);
    cursor += column.pdfWidth;
  }
  const leftOf = (key: string) => columnLeft.get(key) ?? tableLeft;
  const widthOf = (key: string) =>
    columns.find((column) => column.key === key)?.pdfWidth ?? 0;
  const innerWidth = (column: ExamReportColumn) =>
    Math.max(4, column.pdfWidth - style.cellPaddingX * 2);

  const measureAt =
    (size: number): Measure =>
    (text: string) =>
      font.widthOfTextAtSize(text, size);
  const measureBody = measureAt(bodySize);
  const measureHeader = measureAt(headerSize);

  let page: PDFPage = document.addPage([style.pageWidth, style.pageHeight]);
  let pageNumber = 1;
  const pages: PDFPage[] = [page];

  /**
   * The bundled Thai font ships a single weight, so bold is simulated by
   * stroking the glyph outline. Using a text rendering mode rather than drawing
   * the run twice keeps the extracted text layer free of duplicates.
   */
  function drawTextRun(
    target: PDFPage,
    text: string,
    x: number,
    baseline: number,
    size: number,
    bold: boolean,
  ) {
    if (!text) return;
    if (bold) {
      target.pushOperators(
        pushGraphicsState(),
        setTextRenderingMode(TextRenderingMode.FillAndOutline),
        setLineWidth(size * style.boldStrokeRatio),
        setStrokingRgbColor(textColor.red, textColor.green, textColor.blue),
      );
    }
    target.drawText(text, { x, y: baseline, size, font, color: textColor });
    if (bold) target.pushOperators(popGraphicsState());
  }

  /** Draws a bordered cell and vertically centres its wrapped lines. */
  function drawCell(
    target: PDFPage,
    lines: string[],
    x: number,
    top: number,
    width: number,
    height: number,
    align: ExamReportColumn["align"],
    size: number,
    options2: { fill?: string; bold?: boolean; border?: boolean } = {},
  ) {
    const fill =
      options2.fill && options2.fill.toUpperCase() !== "FFFFFF"
        ? toColor(options2.fill)
        : undefined;
    if (options2.border !== false || fill) {
      target.drawRectangle({
        x,
        y: top - height,
        width,
        height,
        color: fill,
        borderColor: options2.border === false ? undefined : borderColor,
        borderWidth: options2.border === false ? 0 : style.borderWidth,
      });
    }
    const visible = lines.filter((line) => line.length > 0);
    if (!visible.length) return;
    const blockHeight = visible.length * lineHeight;
    const blockTop =
      top - Math.max(style.cellPaddingY, (height - blockHeight) / 2);
    visible.forEach((line, index) => {
      const textWidth = font.widthOfTextAtSize(line, size);
      const baseline = blockTop - index * lineHeight - size * 0.78;
      let textX = x + style.cellPaddingX;
      if (align === "center") textX = x + (width - textWidth) / 2;
      if (align === "right") textX = x + width - style.cellPaddingX - textWidth;
      drawTextRun(
        target,
        line,
        Math.max(x + style.cellPaddingX * 0.5, textX),
        baseline,
        size,
        Boolean(options2.bold),
      );
    });
  }

  const headerLines = columns.map((column) =>
    [column.headerTop, column.headerBottom]
      .filter(Boolean)
      .flatMap((label) =>
        wrapCellText(label, measureHeader, innerWidth(column)),
      ),
  );
  const headerHeight = Math.max(
    style.minimumHeaderRowHeight,
    Math.max(...headerLines.map((lines) => lines.length)) * lineHeight +
      style.cellPaddingY * 2,
  );

  function drawTitleBlock(target: PDFPage, top: number) {
    let y = top;
    model.titleLines.forEach((line, index) => {
      const size =
        style.titleFontSizes[index] ??
        style.titleFontSizes[style.titleFontSizes.length - 1];
      const lines = wrapCellText(
        line,
        measureAt(size),
        tableWidth - style.titleBoxPaddingX * 2,
      );
      const blockHeight = lines.length * (size + style.titleLineGap);
      if (index < 2) {
        const widest = Math.max(
          ...lines.map((entry) => font.widthOfTextAtSize(entry, size)),
        );
        const boxWidth = Math.min(
          tableWidth,
          widest + style.titleBoxPaddingX * 2,
        );
        target.drawRectangle({
          x: tableLeft + (tableWidth - boxWidth) / 2,
          y: y - blockHeight - style.titleBoxPaddingY,
          width: boxWidth,
          height: blockHeight + style.titleBoxPaddingY * 2,
          borderColor,
          borderWidth: style.borderWidth,
        });
      }
      lines.forEach((entry, lineIndex) => {
        const width = font.widthOfTextAtSize(entry, size);
        drawTextRun(
          target,
          entry,
          tableLeft + (tableWidth - width) / 2,
          y - size - lineIndex * (size + style.titleLineGap),
          size,
          index === 0,
        );
      });
      y -= blockHeight + style.titleBoxPaddingY * 2 + style.titleLineGap;
    });
    return y - style.titleBlockGap;
  }

  function drawHeaderRow(target: PDFPage, top: number) {
    columns.forEach((column, index) => {
      drawCell(
        target,
        headerLines[index],
        leftOf(column.key),
        top,
        column.pdfWidth,
        headerHeight,
        "center",
        headerSize,
        { fill: theme.headerFill, bold: true },
      );
    });
    return top - headerHeight;
  }

  const laidOutRows: LaidOutRow[] = model.rows.map((row) => {
    const groupIndex = model.groups.findIndex(
      (group) =>
        row.index - 1 >= group.start &&
        row.index - 1 < group.start + group.size,
    );
    const group = model.groups[groupIndex];
    const cells = columns.map((column) => {
      // Merged group columns are drawn once per group, not per row.
      if (column.key === "testForDan" || column.key === "groupCount")
        return [""];
      return wrapCellText(
        reportCellText(row, column.key, group?.countLabel ?? ""),
        measureBody,
        innerWidth(column),
      );
    });
    const height = Math.max(
      style.minimumRowHeight,
      Math.max(...cells.map((lines) => lines.length)) * lineHeight +
        style.cellPaddingY * 2,
    );
    return { row, cells, height, groupIndex };
  });

  const totalsHeight = Math.max(
    style.minimumRowHeight,
    lineHeight + style.cellPaddingY * 2,
  );
  const bodyBottomLimit = style.bottomMargin + style.footerGap;

  let y = drawTitleBlock(page, style.pageHeight - style.topMargin);
  y = drawHeaderRow(page, y);

  /** Open merged group cells on the current page, closed at a page break. */
  let openGroups = new Map<number, { top: number; bottom: number }>();

  function flushGroups(target: PDFPage) {
    for (const [groupIndex, span] of openGroups) {
      const group = model.groups[groupIndex];
      if (!group) continue;
      const height = span.top - span.bottom;
      const rankColumn = columns.find((column) => column.key === "testForDan");
      const countColumn = columns.find((column) => column.key === "groupCount");
      if (rankColumn) {
        drawCell(
          target,
          wrapCellText(group.rank, measureBody, innerWidth(rankColumn)),
          leftOf("testForDan"),
          span.top,
          widthOf("testForDan"),
          height,
          "center",
          bodySize,
        );
      }
      if (countColumn) {
        drawCell(
          target,
          wrapCellText(group.countLabel, measureBody, innerWidth(countColumn)),
          leftOf("groupCount"),
          span.top,
          widthOf("groupCount"),
          height,
          "center",
          bodySize,
        );
      }
    }
    openGroups = new Map();
  }

  function startPage() {
    flushGroups(page);
    page = document.addPage([style.pageWidth, style.pageHeight]);
    pages.push(page);
    pageNumber += 1;
    y = drawHeaderRow(page, style.pageHeight - style.topMargin);
  }

  for (const entry of laidOutRows) {
    if (y - entry.height < bodyBottomLimit) startPage();
    const rowTop = y;
    columns.forEach((column, index) => {
      if (column.key === "testForDan" || column.key === "groupCount") return;
      const isNewAat = column.key === "aatNumber" && entry.row.isNewAat;
      const fill =
        column.key === "dojo" &&
        entry.row.dojoCode !== EXAM_REPORT_MISSING_VALUE
          ? dojoFillColor(entry.row.dojoCode, theme)
          : isNewAat
            ? theme.attentionFill
            : column.key === "aatDate" && entry.row.aatDate
              ? theme.aatDateFill
              : undefined;
      drawCell(
        page,
        entry.cells[index],
        leftOf(column.key),
        rowTop,
        column.pdfWidth,
        entry.height,
        column.align,
        bodySize,
        {
          fill,
          bold:
            theme.emphasiseWithoutColour && (isNewAat || column.key === "dojo"),
        },
      );
    });
    const span = openGroups.get(entry.groupIndex);
    if (span) span.bottom = rowTop - entry.height;
    else
      openGroups.set(entry.groupIndex, {
        top: rowTop,
        bottom: rowTop - entry.height,
      });
    y = rowTop - entry.height;
  }
  flushGroups(page);

  if (!model.rows.length) {
    drawTextRun(
      page,
      "No examination applications match this report scope.",
      tableLeft,
      y - 18,
      10,
      false,
    );
    y -= 26;
  } else {
    if (y - totalsHeight < bodyBottomLimit) startPage();
    const totalsTop = y;
    const labelColumn = columns.find(
      (column) => column.key === EXAM_REPORT_TOTAL_LABEL_COLUMN,
    );
    if (labelColumn) {
      drawCell(
        page,
        [EXAM_REPORT_TOTAL_LABEL],
        leftOf(labelColumn.key),
        totalsTop,
        labelColumn.pdfWidth,
        totalsHeight,
        "center",
        bodySize,
        { bold: true },
      );
    }
    for (const key of EXAM_REPORT_TOTAL_COLUMNS) {
      const column = columns.find((entry) => entry.key === key);
      if (!column) continue;
      drawCell(
        page,
        [formatReportMoney(model.totals[key])],
        leftOf(key),
        totalsTop,
        column.pdfWidth,
        totalsHeight,
        column.align,
        bodySize,
        {
          fill:
            key === EXAM_REPORT_TOTAL_HIGHLIGHT_COLUMN
              ? theme.totalFill
              : undefined,
          bold: true,
        },
      );
    }
    y = totalsTop - totalsHeight;
  }

  // Outer rules are drawn last so they sit cleanly over the cell borders.
  pages.forEach((target, index) => {
    const footer = `Page ${index + 1} of ${pages.length}`;
    const width = font.widthOfTextAtSize(footer, style.footerFontSize);
    drawTextRun(
      target,
      footer,
      tableLeft + tableWidth - width,
      style.bottomMargin,
      style.footerFontSize,
      false,
    );
    const scope = model.scopeLabel;
    drawTextRun(
      target,
      scope,
      tableLeft,
      style.bottomMargin,
      style.footerFontSize,
      false,
    );
  });

  document.setTitle(`${model.titleLines[0]} – ${model.scopeLabel}`);
  document.setAuthor("RenShinKan Dojo");
  document.setCreator("RenShinKan administration");
  document.setProducer("RenShinKan examination report");
  return document.save();
}

export type { PDFFont };
