/**
 * Public entry point for examination report exports.
 *
 * The report is normalized once into a shared model, then handed to the PDF and
 * Excel renderers so every format contains identical records, values, ordering,
 * and totals for a given report scope.
 */

import {
  buildExamReportModel,
  type ExamReportCycle,
  type ExamReportSourceRow,
} from "./reports/examReportModel";
import { renderExamReportPdf } from "./reports/examReportPdf";
import { renderExamReportXlsx } from "./reports/examReportXlsx";

export type ExamExportRow = ExamReportSourceRow;
export type ExamExportCycle = ExamReportCycle;

export { buildExamReportModel, renderExamReportPdf, renderExamReportXlsx };
export type { ExamReportModel, ExamReportRow } from "./reports/examReportModel";

/** Convenience wrapper that normalizes and renders the workbook in one call. */
export function buildExamXlsx(
  cycle: ExamExportCycle,
  rows: readonly ExamExportRow[],
  scopeLabel: string,
) {
  return renderExamReportXlsx(buildExamReportModel(cycle, rows, scopeLabel));
}

/** Convenience wrapper that normalizes and renders a PDF in one call. */
export function buildExamPdf(
  cycle: ExamExportCycle,
  rows: readonly ExamExportRow[],
  scopeLabel: string,
  fontBytes: Uint8Array,
  printFriendly: boolean,
) {
  return renderExamReportPdf(buildExamReportModel(cycle, rows, scopeLabel), {
    fontBytes,
    printFriendly,
  });
}
