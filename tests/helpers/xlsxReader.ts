/**
 * Reopens a generated XLSX package so tests can assert on what Excel will see:
 * cell values, formulas, merged ranges, defined names, and page setup.
 */

import { strFromU8, unzipSync } from "fflate";

export type WorkbookCell = {
  reference: string;
  type: string;
  style: string;
  value: string;
  formula: string | null;
};

export type LoadedWorkbook = {
  entries: string[];
  sheetXml: string;
  workbookXml: string;
  stylesXml: string;
  sheetName: string;
  cells: Map<string, WorkbookCell>;
  /** Every cell value as text, in document order. */
  texts: string[];
  merges: string[];
  definedNames: Record<string, string>;
  pageSetup: Record<string, string> | null;
};

function attribute(tag: string, name: string) {
  const match = tag.match(new RegExp(`${name}="([^"]*)"`));
  return match ? match[1] : "";
}

function unescapeXml(value: string) {
  return value
    .replace(/&#10;/g, "\n")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

export function loadWorkbook(bytes: Uint8Array): LoadedWorkbook {
  const files = unzipSync(bytes);
  const entries = Object.keys(files).sort();
  const read = (name: string) => (files[name] ? strFromU8(files[name]) : "");
  const sheetXml = read("xl/worksheets/sheet1.xml");
  const workbookXml = read("xl/workbook.xml");

  const cells = new Map<string, WorkbookCell>();
  const texts: string[] = [];
  for (const match of sheetXml.matchAll(
    /<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g,
  )) {
    const attributes = match[1];
    const body = match[2] || "";
    const reference = attribute(attributes, "r");
    if (!reference) continue;
    const inline = body.match(
      /<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>[\s\S]*?<\/is>/,
    );
    const numeric = body.match(/<v>([\s\S]*?)<\/v>/);
    const formula = body.match(/<f>([\s\S]*?)<\/f>/);
    const value = inline ? unescapeXml(inline[1]) : numeric ? numeric[1] : "";
    const cell: WorkbookCell = {
      reference,
      type: attribute(attributes, "t"),
      style: attribute(attributes, "s"),
      value,
      formula: formula ? formula[1] : null,
    };
    cells.set(reference, cell);
    if (value) texts.push(value);
  }

  const merges = [...sheetXml.matchAll(/<mergeCell ref="([^"]+)"\/>/g)].map(
    (match) => match[1],
  );
  const definedNames: Record<string, string> = {};
  for (const match of workbookXml.matchAll(
    /<definedName name="([^"]+)"[^>]*>([\s\S]*?)<\/definedName>/g,
  )) {
    definedNames[match[1]] = match[2];
  }
  const pageSetupTag = sheetXml.match(/<pageSetup\s([^>]*)\/>/);
  const pageSetup = pageSetupTag
    ? Object.fromEntries(
        [...pageSetupTag[1].matchAll(/(\w+)="([^"]*)"/g)].map((match) => [
          match[1],
          match[2],
        ]),
      )
    : null;

  return {
    entries,
    sheetXml,
    workbookXml,
    stylesXml: read("xl/styles.xml"),
    sheetName: attribute(
      workbookXml.match(/<sheet\s([^>]*)\/>/)?.[1] || "",
      "name",
    ),
    cells,
    texts,
    merges,
    definedNames,
    pageSetup,
  };
}

function columnIndex(letters: string) {
  let index = 0;
  for (const character of letters)
    index = index * 26 + (character.charCodeAt(0) - 64);
  return index;
}

/** Expands `B6:B13` into its individual cell references. */
export function expandRange(range: string) {
  const match = range.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
  if (!match) return [range];
  const [, startColumn, startRow, endColumn, endRow] = match;
  const references: string[] = [];
  for (
    let column = columnIndex(startColumn);
    column <= columnIndex(endColumn);
    column += 1
  ) {
    for (let row = Number(startRow); row <= Number(endRow); row += 1) {
      let letters = "";
      for (
        let current = column;
        current > 0;
        current = Math.floor((current - 1) / 26)
      ) {
        letters = String.fromCharCode(65 + ((current - 1) % 26)) + letters;
      }
      references.push(`${letters}${row}`);
    }
  }
  return references;
}

/** Returns any cell claimed by more than one merged range. */
export function overlappingMergedCells(merges: string[]) {
  const seen = new Set<string>();
  const overlaps: string[] = [];
  for (const range of merges) {
    for (const reference of expandRange(range)) {
      if (seen.has(reference)) overlaps.push(reference);
      seen.add(reference);
    }
  }
  return overlaps;
}
