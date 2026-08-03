/**
 * Minimal PDF text extraction for tests.
 *
 * Walks the object graph with pdf-lib, inflates the content streams, and maps
 * the embedded subset font's glyph codes back through its ToUnicode CMap. This
 * proves the generated PDF carries real selectable text rather than an image.
 */

import { inflateSync } from "node:zlib";
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  type PDFRef,
} from "pdf-lib";

function decodeStream(stream: PDFRawStream) {
  const filter = stream.dict.get(PDFName.of("Filter"));
  const bytes = Buffer.from(stream.contents);
  if (filter && String(filter.toString()).includes("FlateDecode")) {
    try {
      return inflateSync(bytes).toString("latin1");
    } catch {
      return "";
    }
  }
  return bytes.toString("latin1");
}

function hexToUnicode(hex: string) {
  let text = "";
  for (let index = 0; index + 3 < hex.length + 1; index += 4) {
    const code = parseInt(hex.slice(index, index + 4), 16);
    if (Number.isFinite(code)) text += String.fromCharCode(code);
  }
  return text;
}

/** Parses `beginbfchar` and `beginbfrange` sections of a ToUnicode CMap. */
function parseCMap(cmap: string) {
  const mapping = new Map<number, string>();
  for (const block of cmap.match(/beginbfchar([\s\S]*?)endbfchar/g) || []) {
    for (const entry of block.match(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g) ||
      []) {
      const pair = entry.match(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/);
      if (pair) mapping.set(parseInt(pair[1], 16), hexToUnicode(pair[2]));
    }
  }
  for (const block of cmap.match(/beginbfrange([\s\S]*?)endbfrange/g) || []) {
    for (const entry of block.match(
      /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g,
    ) || []) {
      const parts = entry.match(
        /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/,
      );
      if (!parts) continue;
      const start = parseInt(parts[1], 16);
      const end = parseInt(parts[2], 16);
      const target = parseInt(parts[3], 16);
      for (let code = start; code <= end && code - start < 65_536; code += 1) {
        mapping.set(code, String.fromCharCode(target + (code - start)));
      }
    }
  }
  return mapping;
}

/** Returns every string drawn on every page, decoded to Unicode. */
export async function extractPdfText(bytes: Uint8Array) {
  const document = await PDFDocument.load(bytes, { updateMetadata: false });
  const context = document.context;
  const resolve = (value: unknown) => {
    const looked = context.lookup(value as PDFRef);
    return looked ?? value;
  };

  const mapping = new Map<number, string>();
  for (const [, object] of context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFDict)) continue;
    const toUnicode = object.get(PDFName.of("ToUnicode"));
    if (!toUnicode) continue;
    const stream = resolve(toUnicode);
    if (stream instanceof PDFRawStream) {
      for (const [code, text] of parseCMap(decodeStream(stream)))
        mapping.set(code, text);
    }
  }

  const pieces: string[] = [];
  for (const page of document.getPages()) {
    const contents = resolve(page.node.get(PDFName.of("Contents")));
    const streams: PDFRawStream[] = [];
    if (contents instanceof PDFRawStream) streams.push(contents);
    if (contents instanceof PDFArray) {
      for (let index = 0; index < contents.size(); index += 1) {
        const entry = resolve(contents.get(index));
        if (entry instanceof PDFRawStream) streams.push(entry);
      }
    }
    for (const stream of streams) {
      const content = decodeStream(stream);
      for (const match of content.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) {
        const hex = match[1];
        let text = "";
        for (let index = 0; index + 3 < hex.length + 1; index += 4) {
          const code = parseInt(hex.slice(index, index + 4), 16);
          text += mapping.get(code) ?? "";
        }
        pieces.push(text);
      }
    }
  }
  return pieces;
}

/**
 * OpenType shaping decomposes THAI CHARACTER SARA AM (ำ) into NIKHAHIT + SARA AA
 * before drawing, which is how the glyph is actually composed on the page. The
 * ToUnicode CMap therefore reports the decomposed form. Recomposing it here lets
 * tests compare extracted text against the original source strings.
 */
export function recomposeThai(text: string) {
  return (
    text
      // A tone mark may be drawn between the two halves of SARA AM.
      .replace(/ำ([่-๋])า/g, "$1ำ")
      .replace(/ำา/g, "ำ")
  );
}

/** Convenience: all drawn text joined with newlines. */
export async function extractPdfPlainText(bytes: Uint8Array) {
  return recomposeThai((await extractPdfText(bytes)).join("\n"));
}

/** Same text with wrapped lines flattened, for whole-value containment checks. */
export async function extractPdfFlatText(bytes: Uint8Array) {
  return (await extractPdfPlainText(bytes)).replace(/\n/g, " ");
}
