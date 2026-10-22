import { Inflate, strToU8, zipSync } from "fflate";
import { IMPORT_MAX_ROWS } from "@/domain/guest-import";

/** Total size of everything we inflate from one upload. */
export const MAX_INFLATED_BYTES = 20_000_000;
/** Far beyond any guest list; protects against `r="XFD1048576"` blowing up memory. Only cells with a value count. */
const MAX_ROWS = 100_000;
const MAX_COLUMNS = 256;
/** Cells materialized after padding rows to their last value. */
const MAX_CELLS = 300_000;
/**
 * Rows with a value we read at most: the header and one more than the importer accepts, so it
 * still reports "too many rows". Formatting-only rows and cells do not count.
 */
const MAX_FILLED_ROWS = IMPORT_MAX_ROWS + 2;

export class TooLargeError extends Error {}
export class UnreadableError extends Error {}
class EnoughRows extends Error {}


const NAMED: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

/** One pass, so "&amp;lt;" becomes "&lt;" and not "<". */
function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#[0-9]+|lt|gt|amp|quot|apos);/gi, (match, body: string) => {
    const lower = body.toLowerCase();
    if (lower in NAMED) return NAMED[lower]!;
    const code = lower.startsWith("#x") ? parseInt(lower.slice(2), 16) : parseInt(lower.slice(1), 10);
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : match;
  });
}

/** Linear attribute parser (no backtracking regexes: the input is hostile). */
function attributes(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;
  const n = tag.length;
  const space = (c: number) => c <= 32;
  while (i < n) {
    while (i < n && (space(tag.charCodeAt(i)) || tag[i] === "/")) i++;
    const start = i;
    while (i < n && !space(tag.charCodeAt(i)) && tag[i] !== "=" && tag[i] !== "/") i++;
    const name = tag.slice(start, i);
    while (i < n && space(tag.charCodeAt(i))) i++;
    if (tag[i] !== "=") continue;
    i++;
    while (i < n && space(tag.charCodeAt(i))) i++;
    const quote = tag[i];
    if (quote !== '"' && quote !== "'") continue;
    const close = tag.indexOf(quote, i + 1);
    if (close === -1) break;
    if (name) out[name] = decodeEntities(tag.slice(i + 1, close));
    i = close + 1;
  }
  return out;
}

type Tag = { closing: boolean; selfClosing: boolean; name: string; attrs: string };

/**
 * Single linear pass over the tags (indexOf only, never a lazy regex over the rest of the
 * document), so unclosed tags cannot make parsing quadratic. Namespace prefixes are dropped
 * from element names ("x:row" is "row"). `textAfter` is the text up to the next tag.
 */
function scan(xml: string, visit: (tag: Tag, textAfter: () => string) => void): void {
  let i = 0;
  for (;;) {
    const lt = xml.indexOf("<", i);
    if (lt === -1) return;
    const gt = xml.indexOf(">", lt);
    if (gt === -1) return;
    i = gt + 1;
    const first = xml[lt + 1];
    if (first === "?" || first === "!") continue;
    const closing = first === "/";
    const from = closing ? lt + 2 : lt + 1;
    let to = from;
    while (to < gt && xml.charCodeAt(to) > 32 && xml[to] !== "/") to++;
    const raw = xml.slice(from, to);
    if (!raw) continue;
    const textAfter = () => {
      const next = xml.indexOf("<", gt + 1);
      return xml.slice(gt + 1, next === -1 ? xml.length : next);
    };
    visit({ closing, selfClosing: xml[gt - 1] === "/", name: raw.slice(raw.lastIndexOf(":") + 1), attrs: xml.slice(to, gt) }, textAfter);
  }
}

/** "A" = 0, "Z" = 25, "AA" = 26. */
function columnIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function columnLetters(index: number): string {
  let s = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Resolves a relationship target (relative to xl/ or absolute) to a zip entry name. */
function resolveTarget(target: string): string {
  const parts: string[] = [];
  for (const part of (target.startsWith("/") ? target.slice(1) : `xl/${target}`).split("/")) {
    if (part === "..") parts.pop();
    else if (part !== "." && part !== "") parts.push(part);
  }
  return parts.join("/");
}

const MAX_ENTRIES = 1_000;
const CHUNK = 4_096;

type Entry = { method: number; compressed: number; size: number; offset: number };

/** Entries from the central directory (the authority every zip reader uses), by name. */
function centralDirectory(bytes: Uint8Array, wanted: Set<string>): Map<string, Entry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65_535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new UnreadableError();
  const count = view.getUint16(eocd + 10, true);
  const start = view.getUint32(eocd + 16, true);
  if (count > MAX_ENTRIES || count === 0xffff || start === 0xffffffff || start >= bytes.length) throw new UnreadableError();
  const found = new Map<string, Entry>();
  let at = start;
  for (let n = 0; n < count; n++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== 0x02014b50) throw new UnreadableError();
    const nameLength = view.getUint16(at + 28, true);
    const end = at + 46 + nameLength;
    if (end > bytes.length) throw new UnreadableError();
    const name = new TextDecoder().decode(bytes.subarray(at + 46, end));
    if (wanted.has(name)) {
      if (found.has(name)) throw new UnreadableError();
      const compressed = view.getUint32(at + 20, true);
      const size = view.getUint32(at + 24, true);
      const offset = view.getUint32(at + 42, true);
      if (compressed === 0xffffffff || size === 0xffffffff || offset === 0xffffffff) throw new UnreadableError();
      found.set(name, { method: view.getUint16(at + 10, true), compressed, size, offset });
    }
    at = end + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
  }
  return found;
}

/**
 * Inflates only the named entries, with one byte budget for the whole upload. Names and sizes
 * come from the central directory; the bytes actually produced are counted (the sizes are
 * attacker-controlled) and inflating stops at the first byte over budget. Duplicate entries,
 * too many entries, unsupported methods and size mismatches are unreadable.
 */
function inflate(bytes: Uint8Array, names: string[], budget: { left: number }): Record<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: Record<string, string> = {};
  for (const [name, entry] of centralDirectory(bytes, new Set(names))) {
    if (entry.size > budget.left) throw new TooLargeError();
    if (entry.offset + 30 > bytes.length || view.getUint32(entry.offset, true) !== 0x04034b50) throw new UnreadableError();
    const dataStart = entry.offset + 30 + view.getUint16(entry.offset + 26, true) + view.getUint16(entry.offset + 28, true);
    const dataEnd = dataStart + entry.compressed;
    if (dataEnd > bytes.length) throw new UnreadableError();
    const parts: Uint8Array[] = [];
    let produced = 0;
    let over = false;
    const take = (data: Uint8Array) => {
      produced += data.length;
      budget.left -= data.length;
      if (budget.left < 0) over = true;
      else parts.push(data);
    };
    if (entry.method === 0) {
      take(bytes.subarray(dataStart, dataEnd));
    } else if (entry.method === 8) {
      const inflater = new Inflate((data) => take(data));
      try {
        for (let i = dataStart; i < dataEnd && !over; i += CHUNK) inflater.push(bytes.subarray(i, Math.min(i + CHUNK, dataEnd)), i + CHUNK >= dataEnd);
        if (dataStart === dataEnd) inflater.push(new Uint8Array(0), true);
      } catch {
        if (!over) throw new UnreadableError();
      }
    } else throw new UnreadableError();
    if (over) throw new TooLargeError();
    if (produced !== entry.size) throw new UnreadableError();
    const all = new Uint8Array(produced);
    let at = 0;
    for (const c of parts) {
      all.set(c, at);
      at += c.length;
    }
    out[name] = new TextDecoder().decode(all);
  }
  return out;
}

/** C0 controls except tab and line breaks: Postgres rejects NUL, and none belong in a guest list. */
export const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g;
/** Control characters are dropped when reading (index.ts), so a cell of only those is blank too. */
const isBlank = (s: string) => s.replace(CONTROL, "").trim() === "";

function sharedStrings(xml: string | undefined): string[] {
  if (!xml) return [];
  const out: string[] = [];
  let current: string | null = null;
  let phonetic = false;
  scan(xml, (tag, textAfter) => {
    if (tag.name === "si") {
      if (current !== null) out.push(current);
      current = null;
      if (!tag.closing) {
        if (tag.selfClosing) out.push("");
        else current = "";
      }
    } else if (tag.name === "rPh") phonetic = !tag.closing && !tag.selfClosing;
    else if (tag.name === "t" && !tag.closing && !tag.selfClosing && !phonetic && current !== null) current += decodeEntities(textAfter());
  });
  if (current !== null) out.push(current);
  return out;
}

export function readXlsx(bytes: Uint8Array): string[][] {
  const budget = { left: MAX_INFLATED_BYTES };
  const meta = inflate(bytes, ["xl/workbook.xml", "xl/_rels/workbook.xml.rels"], budget);
  const workbook = meta["xl/workbook.xml"];
  const rels = meta["xl/_rels/workbook.xml.rels"];
  if (workbook === undefined || rels === undefined) throw new UnreadableError();

  let relationId: string | undefined;
  scan(workbook, (tag) => {
    if (relationId !== undefined || tag.closing || tag.name !== "sheet") return;
    relationId = Object.entries(attributes(tag.attrs)).find(([key]) => key.endsWith(":id"))?.[1] ?? "";
  });
  if (!relationId) throw new UnreadableError();
  let sheetPath: string | null = null;
  scan(rels, (tag) => {
    if (tag.closing || tag.name !== "Relationship") return;
    const a = attributes(tag.attrs);
    if (a.Id === relationId && a.Target) sheetPath = resolveTarget(a.Target);
  });
  if (!sheetPath) throw new UnreadableError();

  const parts = inflate(bytes, [sheetPath, "xl/sharedStrings.xml"], budget);
  const sheet = parts[sheetPath];
  if (sheet === undefined) throw new UnreadableError();
  const shared = sharedStrings(parts["xl/sharedStrings.xml"]);

  // Sparse: only cells with a value are kept, as [column, value]; rows are padded once at the end.
  const sparse = new Map<number, { cells: [number, string][]; width: number }>();
  let filledRows = 0;
  let cellsTotal = 0;
  let lastRow = 0;
  let rowNumber = 0;
  let row: { cells: [number, string][]; width: number } | null = null;
  let rowOpen = false;
  let nextColumn = 0;
  let cell: { attrs: Record<string, string>; v: string | undefined; inline: string } | null = null;
  let inInline = false;
  let phonetic = false;

  const flush = () => {
    if (!cell || !rowOpen) return void (cell = null);
    const a = cell.attrs;
    const ref = /^([A-Za-z]{1,4})\d*$/.exec(a.r ?? "");
    const column = ref ? columnIndex(ref[1]!) : nextColumn;
    nextColumn = column + 1;
    let value: string;
    if (a.t === "inlineStr") value = cell.inline;
    else if (a.t === "s") value = shared[Number(cell.v ?? "")] ?? "";
    else value = cell.v ?? "";
    cell = null;
    if (isBlank(value)) return;
    if (column >= MAX_COLUMNS) throw new TooLargeError();
    if (!row) {
      if (rowNumber > MAX_ROWS) throw new TooLargeError();
      row = sparse.get(rowNumber) ?? { cells: [], width: 0 };
      if (row.cells.length === 0) filledRows++;
      sparse.set(rowNumber, row);
      lastRow = Math.max(lastRow, rowNumber);
    }
    row.cells.push([column, value]);
    if (column + 1 > row.width) {
      cellsTotal += column + 1 - row.width;
      row.width = column + 1;
      if (cellsTotal > MAX_CELLS) throw new TooLargeError();
    }
  };
  const endRow = () => {
    flush();
    if (row && filledRows >= MAX_FILLED_ROWS) throw new EnoughRows();
    row = null;
    rowOpen = false;
  };

  try {
    scan(sheet, (tag, textAfter) => {
      switch (tag.name) {
        case "row": {
          endRow();
          inInline = false;
          if (tag.closing) break;
          const given = Number(attributes(tag.attrs).r);
          rowNumber = Number.isInteger(given) && given > 0 ? given : rowNumber + 1;
          rowOpen = !tag.selfClosing;
          nextColumn = 0;
          break;
        }
        case "c":
          flush();
          inInline = false;
          if (!tag.closing && rowOpen) {
            cell = { attrs: attributes(tag.attrs), v: undefined, inline: "" };
            if (tag.selfClosing) flush();
          }
          break;
        case "v":
          if (cell && !tag.closing && !tag.selfClosing) cell.v = decodeEntities(textAfter());
          break;
        case "is":
          inInline = !tag.closing && !tag.selfClosing;
          break;
        case "rPh":
          phonetic = !tag.closing && !tag.selfClosing;
          break;
        case "t":
          if (cell && inInline && !phonetic && !tag.closing && !tag.selfClosing) cell.inline += decodeEntities(textAfter());
          break;
        case "sheetData":
          endRow();
          break;
      }
    });
    endRow();
  } catch (error) {
    if (!(error instanceof EnoughRows)) throw error;
  }

  const rows: string[][] = [];
  for (let r = 1; r <= lastRow; r++) {
    const found = sparse.get(r);
    const out: string[] = found ? new Array<string>(found.width).fill("") : [];
    for (const [column, value] of found?.cells ?? []) out[column] = value;
    rows.push(out);
  }
  return rows;
}

// Characters XML 1.0 cannot carry at all.
const INVALID_XML = /[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g;
const escapeXml = (s: string) =>
  s
    .replace(INVALID_XML, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

export function writeXlsx(rows: string[][]): Uint8Array {
  const sheetRows = rows
    .map((row, r) => {
      const cells = row
        .map((value, c) => `<c r="${columnLetters(c)}${r + 1}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`)
        .join("");
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join("");
  return zipSync({
    "[Content_Types].xml": strToU8(
      `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    ),
    "_rels/.rels": strToU8(
      `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    "xl/workbook.xml": strToU8(`${HEAD}<workbook xmlns="${MAIN}" xmlns:r="${REL}"><sheets><sheet name="Gaeste" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(
      `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    ),
    "xl/worksheets/sheet1.xml": strToU8(`${HEAD}<worksheet xmlns="${MAIN}"><sheetData>${sheetRows}</sheetData></worksheet>`),
  });
}
