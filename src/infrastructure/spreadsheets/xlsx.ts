import { strToU8, unzipSync, zipSync } from "fflate";

/** Total size of everything we inflate from one upload. */
export const MAX_INFLATED_BYTES = 20_000_000;
/** Far beyond any guest list; protects against `r="XFD1048576"` blowing up memory. */
const MAX_ROWS = 100_000;
const MAX_COLUMNS = 1_000;

export class TooLargeError extends Error {}
export class UnreadableError extends Error {}

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

function attributes(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) out[m[1]!] = decodeEntities(m[2] ?? m[3] ?? "");
  return out;
}

/** Text of all <t> elements, ignoring phonetic runs (<rPh>), which are not part of the value. */
function textOf(xml: string): string {
  const withoutPhonetic = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let out = "";
  for (const m of withoutPhonetic.matchAll(/<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g)) out += decodeEntities(m[1] ?? "");
  return out;
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

/** Inflates only the named entries; checks the declared sizes against the budget first. */
function inflate(bytes: Uint8Array, names: string[], budget: { left: number }): Record<string, string> {
  const wanted = new Set(names);
  const sizes = new Map<string, number>();
  unzipSync(bytes, {
    filter: (file) => {
      if (wanted.has(file.name)) {
        if (file.originalSize > budget.left) throw new TooLargeError();
        sizes.set(file.name, file.originalSize);
      }
      return false;
    },
  });
  let total = 0;
  for (const size of sizes.values()) total += size;
  if (total > budget.left) throw new TooLargeError();
  const files = unzipSync(bytes, { filter: (file) => wanted.has(file.name) });
  const out: Record<string, string> = {};
  for (const [name, data] of Object.entries(files)) {
    budget.left -= data.length;
    if (budget.left < 0) throw new TooLargeError();
    out[name] = new TextDecoder().decode(data);
  }
  return out;
}

function sharedStrings(xml: string | undefined): string[] {
  if (!xml) return [];
  return [...xml.matchAll(/<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g)].map((m) => textOf(m[1] ?? ""));
}

export function readXlsx(bytes: Uint8Array): string[][] {
  const budget = { left: MAX_INFLATED_BYTES };
  const meta = inflate(bytes, ["xl/workbook.xml", "xl/_rels/workbook.xml.rels"], budget);
  const workbook = meta["xl/workbook.xml"];
  const rels = meta["xl/_rels/workbook.xml.rels"];
  if (workbook === undefined || rels === undefined) throw new UnreadableError();

  const firstSheet = /<sheet\b[^>]*>/.exec(workbook);
  const relationId = firstSheet && Object.entries(attributes(firstSheet[0])).find(([key]) => key === "r:id" || key.endsWith(":id"))?.[1];
  if (!relationId) throw new UnreadableError();
  let sheetPath: string | null = null;
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const a = attributes(m[0]);
    if (a.Id === relationId && a.Target) sheetPath = resolveTarget(a.Target);
  }
  if (!sheetPath) throw new UnreadableError();

  const parts = inflate(bytes, [sheetPath, "xl/sharedStrings.xml"], budget);
  const sheet = parts[sheetPath];
  if (sheet === undefined) throw new UnreadableError();
  const shared = sharedStrings(parts["xl/sharedStrings.xml"]);

  const rows: string[][] = [];
  let rowNumber = 0;
  for (const rowMatch of sheet.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const given = Number(attributes(rowMatch[1]!).r);
    rowNumber = Number.isInteger(given) && given > 0 ? given : rowNumber + 1;
    if (rowNumber > MAX_ROWS) throw new TooLargeError();
    const row: string[] = (rows[rowNumber - 1] ??= []);
    let nextColumn = 0;
    for (const cellMatch of (rowMatch[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const a = attributes(cellMatch[1]!);
      const ref = /^([A-Za-z]+)\d*$/.exec(a.r ?? "");
      const column = ref ? columnIndex(ref[1]!) : nextColumn;
      nextColumn = column + 1;
      if (column >= MAX_COLUMNS) throw new TooLargeError();
      const inner = cellMatch[2] ?? "";
      let value: string;
      if (a.t === "inlineStr") value = textOf(/<is\b[^>]*>([\s\S]*?)<\/is>/.exec(inner)?.[1] ?? "");
      else {
        const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(inner)?.[1];
        value = v === undefined ? "" : decodeEntities(v);
        if (a.t === "s") value = shared[Number(value)] ?? "";
      }
      for (let i = row.length; i < column; i++) row[i] = "";
      row[column] = value;
    }
  }
  for (let i = 0; i < rows.length; i++) rows[i] ??= [];
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
