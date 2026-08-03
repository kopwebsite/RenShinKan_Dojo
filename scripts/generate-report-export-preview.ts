/**
 * Generates preview copies of all three examination report exports plus visual
 * renders, so the layout can be reviewed without a database or an admin session.
 *
 * Run with: npm run report:preview
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildExamReportModel } from "../functions/_lib/examExports";
import { renderExamReportPdf } from "../functions/_lib/reports/examReportPdf";
import { renderExamReportXlsx } from "../functions/_lib/reports/examReportXlsx";
import {
  sampleExamCycle,
  sampleExamRows,
  stressExamRows,
} from "../tests/fixtures/examReportFixture";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = resolve(root, "artifacts/report-export-preview");
mkdirSync(outputDirectory, { recursive: true });

const fontBytes = new Uint8Array(
  readFileSync(resolve(root, "public/fonts/NotoSansThai.ttf")),
);
const scopeLabel = "All Dojos";
const model = buildExamReportModel(sampleExamCycle, sampleExamRows, scopeLabel);
const stressModel = buildExamReportModel(
  { ...sampleExamCycle, name: "Dan Examination II — stress fixture" },
  stressExamRows(64),
  scopeLabel,
);

const written: string[] = [];
function write(name: string, bytes: Uint8Array) {
  const target = resolve(outputDirectory, name);
  writeFileSync(target, bytes);
  written.push(name);
  return target;
}

const standardPdf = write(
  "sample-exam-report.pdf",
  await renderExamReportPdf(model, { fontBytes }),
);
const printFriendlyPdf = write(
  "sample-exam-report-print-friendly.pdf",
  await renderExamReportPdf(model, { fontBytes, printFriendly: true }),
);
const workbook = write("sample-exam-report.xlsx", renderExamReportXlsx(model));
write(
  "sample-exam-report-stress.pdf",
  await renderExamReportPdf(stressModel, { fontBytes }),
);
write("sample-exam-report-stress.xlsx", renderExamReportXlsx(stressModel));

if (model.dataIssues.length) {
  console.log("\nReported data issues:");
  for (const issue of model.dataIssues) console.log(`  - ${issue}`);
}

/** Renders page one of a PDF with the Chromium build Playwright already has. */
async function renderPdfPage(input: string, output: string) {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ channel: "chromium" });
  try {
    const page = await browser.newPage({
      viewport: { width: 1400, height: 1000 },
      deviceScaleFactor: 2,
    });
    await page.goto(
      `${pathToFileURL(input).href}#zoom=page-fit&toolbar=0&view=Fit`,
      { waitUntil: "load" },
    );
    await page.waitForTimeout(3500);
    await page.screenshot({ path: output });
    written.push(output.slice(outputDirectory.length + 1));
  } finally {
    await browser.close();
  }
}

/** Uses the locally installed Excel to print the workbook exactly as Excel does. */
function convertWorkbookWithExcel(input: string, output: string) {
  const script = `
$ErrorActionPreference = 'Stop'
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
try {
  $book = $excel.Workbooks.Open('${input.replace(/'/g, "''")}', 0, $true)
  $book.ExportAsFixedFormat(0, '${output.replace(/'/g, "''")}')
  $book.Close($false)
} finally {
  $excel.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
}
`;
  execFileSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    {
      stdio: "pipe",
      timeout: 180_000,
    },
  );
}

await renderPdfPage(
  standardPdf,
  resolve(outputDirectory, "sample-exam-report-page-1.png"),
);
await renderPdfPage(
  printFriendlyPdf,
  resolve(outputDirectory, "sample-exam-report-print-friendly-page-1.png"),
);

const workbookPdf = resolve(
  outputDirectory,
  "sample-exam-report-xlsx-preview.pdf",
);
try {
  convertWorkbookWithExcel(workbook, workbookPdf);
  written.push("sample-exam-report-xlsx-preview.pdf");
  await renderPdfPage(
    workbookPdf,
    resolve(outputDirectory, "sample-exam-report-xlsx-page-1.png"),
  );
} catch (error) {
  console.warn(
    `\nExcel preview unavailable: ${error instanceof Error ? error.message : String(error)}`,
  );
}

console.log(`\nArtifacts in ${outputDirectory}:`);
for (const name of [...new Set(written)].sort()) {
  console.log(
    `  ${name.padEnd(48)} ${statSync(resolve(outputDirectory, name)).size.toLocaleString()} bytes`,
  );
}
