import { deflateSync, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { FflateSpreadsheets } from "@/infrastructure/spreadsheets";

const codec = new FflateSpreadsheets();
const text = (s: string) => new TextEncoder().encode(s);
const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';

const sheetXml = (rows: string) => `<worksheet ${NS}><sheetData>${rows}</sheetData></worksheet>`;
const workbookParts = () => ({
  "xl/workbook.xml": strToU8(`<workbook ${NS} xmlns:r="x"><sheets><sheet name="a" sheetId="1" r:id="rId3"/></sheets></workbook>`),
  "xl/_rels/workbook.xml.rels": strToU8('<Relationships><Relationship Id="rId3" Target="worksheets/blatt.xml"/></Relationships>'),
});

function workbook(parts: { sheet: string; shared?: string; sheetPath?: string; rid?: string }) {
  const path = parts.sheetPath ?? "worksheets/blatt.xml";
  const files: Record<string, Uint8Array> = {
    "xl/workbook.xml": strToU8(
      `<workbook ${NS} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>` +
        `<sheet name="Erstes" sheetId="1" r:id="${parts.rid ?? "rId3"}"/><sheet name="Zweites" sheetId="2" r:id="rId9"/></sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<Relationships><Relationship Id="rId9" Target="worksheets/other.xml" Type="x"/>` +
        `<Relationship Id="rId3" Type="x" Target="${path}"/></Relationships>`,
    ),
    [`xl/${path}`]: strToU8(`<worksheet ${NS}><sheetData>${parts.sheet}</sheetData></worksheet>`),
    "xl/worksheets/other.xml": strToU8(`<worksheet ${NS}><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>falsch</t></is></c></row></sheetData></worksheet>`),
  };
  if (parts.shared) files["xl/sharedStrings.xml"] = strToU8(`<sst ${NS}>${parts.shared}</sst>`);
  return zipSync(files);
}

describe("CSV", () => {
  it("reads BOM, semicolons, quotes and CRLF", () => {
    const r = codec.read(text('﻿Name;Haushalt\r\n"Anna; B";"Müller ""M"""\r\n'));
    expect(r).toEqual({ ok: true, rows: [["Name", "Haushalt"], ["Anna; B", 'Müller "M"']] });
  });
  it("uses a comma when the header has more commas than semicolons", () => {
    expect(codec.read(text("a,b,c\n1,2,3\n"))).toEqual({ ok: true, rows: [["a", "b", "c"], ["1", "2", "3"]] });
  });
  it("keeps a quoted newline in one cell", () => {
    expect(codec.read(text('a;b\n"x\ny";z\n'))).toEqual({ ok: true, rows: [["a", "b"], ["x\ny", "z"]] });
  });
  it("trims cells and drops trailing empty rows", () => {
    expect(codec.read(text("a; b \n 1 ;2\n;\n\n"))).toEqual({ ok: true, rows: [["a", "b"], ["1", "2"]] });
  });
});

describe("XLSX", () => {
  it("resolves the first sheet through workbook.xml and its rels", () => {
    const bytes = workbook({ sheet: '<row r="1"><c r="A1" t="inlineStr"><is><t>richtig</t></is></c></row>' });
    expect(codec.read(bytes)).toEqual({ ok: true, rows: [["richtig"]] });
  });
  it("joins rich-text runs of shared strings", () => {
    const bytes = workbook({
      shared: "<si><r><t>An</t></r><r><t>na</t></r></si><si><t>B</t></si>",
      sheet: '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>',
    });
    expect(codec.read(bytes)).toEqual({ ok: true, rows: [["Anna", "B"]] });
  });
  it("skips phonetic runs in shared strings", () => {
    const bytes = workbook({
      shared: "<si><t>Ann</t><rPh sb=\"0\" eb=\"1\"><t>ZZ</t></rPh></si>",
      sheet: '<row r="1"><c r="A1" t="s"><v>0</v></c></row>',
    });
    expect(codec.read(bytes)).toEqual({ ok: true, rows: [["Ann"]] });
  });
  it("decodes entities", () => {
    const bytes = workbook({ sheet: '<row r="1"><c r="A1" t="inlineStr"><is><t>a &amp; b &lt;&#65;&#x42;&gt; &quot;&apos;</t></is></c></row>' });
    expect(codec.read(bytes)).toEqual({ ok: true, rows: [["a & b <AB> \"'"]] });
  });
  it("reads numbers as text", () => {
    const bytes = workbook({ sheet: '<row r="2"><c r="C2"><v>1</v></c></row>' });
    expect(codec.read(bytes)).toEqual({ ok: true, rows: [[], ["", "", "1"]] });
  });
  it("places sparse cells by their reference", () => {
    const bytes = workbook({
      sheet: '<row r="2"><c r="A2" t="inlineStr"><is><t>x</t></is></c><c r="C2" t="inlineStr"><is><t>z</t></is></c></row>',
    });
    const r = codec.read(bytes);
    expect(r).toEqual({ ok: true, rows: [[], ["x", "", "z"]] });
  });
  it("maps column letters beyond Z", () => {
    const bytes = workbook({ sheet: '<row r="1"><c r="AA1" t="inlineStr"><is><t>q</t></is></c></row>' });
    const r = codec.read(bytes);
    expect(r.ok && r.rows[0]![26]).toBe("q");
  });
  it("reads self-closing and empty cells", () => {
    const bytes = workbook({ sheet: '<row r="1"><c r="A1"/><c r="B1" t="inlineStr"><is><t>b</t></is></c></row>' });
    expect(codec.read(bytes)).toEqual({ ok: true, rows: [["", "b"]] });
  });
  it("rejects an entry that inflates beyond 20 MB before inflating", () => {
    const bytes = workbook({ sheet: `<row r="1"><c r="A1"><v>${"1".repeat(21_000_000)}</v></c></row>` });
    expect(bytes.length).toBeLessThan(1_000_000);
    expect(codec.read(bytes)).toEqual({ ok: false, error: "too_large" });
  });
  it("is unreadable for PK-prefixed garbage", () => {
    const junk = new Uint8Array(200).map((_, i) => (i * 37) % 251);
    junk.set([0x50, 0x4b, 3, 4]);
    expect(codec.read(junk)).toEqual({ ok: false, error: "unreadable" });
  });
  it("is unreadable when parts are missing or the sheet is not found", () => {
    expect(codec.read(zipSync({ "hello.txt": strToU8("hi") }))).toEqual({ ok: false, error: "unreadable" });
    expect(codec.read(workbook({ sheet: "", rid: "rId77" }))).toEqual({ ok: false, error: "unreadable" });
  });
  it("round-trips and writes string cells without formulas", () => {
    const rows = [["Name", "Kind"], ["=1+1", "ja & <nein>"]];
    const bytes = codec.writeXlsx(rows);
    expect(codec.read(bytes)).toEqual({ ok: true, rows });
    const xml = new TextDecoder().decode(unzipSync(bytes)["xl/worksheets/sheet1.xml"]);
    expect(xml).not.toContain("<f>");
    expect(xml).toContain('t="inlineStr"');
  });

  it("reads prefixed element names (x:row, x:c)", () => {
    const bytes = workbook({ sheet: '<x:row r="1"><x:c r="A1" t="inlineStr"><x:is><x:t>p</x:t></x:is></x:c></x:row>' });
    expect(codec.read(bytes)).toEqual({ ok: true, rows: [["p"]] });
  });
});

/** Builds a zip by hand so the headers can lie. */
function rawZip(entries: { name: string; data: Uint8Array; declared?: number }[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const u16 = (n: number) => [n & 255, (n >> 8) & 255];
  const u32 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
  for (const e of entries) {
    const comp = deflateSync(e.data);
    const name = strToU8(e.name);
    const size = e.declared ?? e.data.length;
    const local = Uint8Array.from([0x50, 0x4b, 3, 4, ...u16(20), ...u16(0), ...u16(8), ...u16(0), ...u16(0), ...u32(0), ...u32(comp.length), ...u32(size), ...u16(name.length), ...u16(0), ...name]);
    central.push(Uint8Array.from([0x50, 0x4b, 1, 2, ...u16(20), ...u16(20), ...u16(0), ...u16(8), ...u16(0), ...u16(0), ...u32(0), ...u32(comp.length), ...u32(size), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...name]));
    parts.push(local, comp);
    offset += local.length + comp.length;
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const end = Uint8Array.from([0x50, 0x4b, 5, 6, ...u16(0), ...u16(0), ...u16(entries.length), ...u16(entries.length), ...u32(cdSize), ...u32(offset), ...u16(0)]);
  return Uint8Array.from([...parts, ...central, end].flatMap((p) => [...p]));
}

describe("XLSX, hostile input", () => {
  const parts = (sheet: string) => ({
    wb: strToU8(`<workbook ${NS} xmlns:r="x"><sheets><sheet name="a" r:id="rId1"/></sheets></workbook>`),
    rels: strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/s.xml"/></Relationships>'),
    sheet: strToU8(`<worksheet ${NS}><sheetData>${sheet}</sheetData></worksheet>`),
  });

  it("finishes quickly on a megabyte of unclosed tags", () => {
    for (const tag of ["<row>", "<c>", "<c r=\"A1\"><is><t>", "<si>"]) {
      const bytes = workbook({ sheet: tag.repeat(Math.ceil(1_000_000 / tag.length)), shared: tag.repeat(200_000) });
      const t0 = performance.now();
      const r = codec.read(bytes);
      expect(performance.now() - t0).toBeLessThan(1000);
      expect(r.ok === false || r.rows.length <= 100_000).toBe(true);
    }
  });
  it("finishes quickly on one enormous tag without a closing bracket", () => {
    const bytes = workbook({ sheet: "<c " + "a".repeat(1_000_000) });
    const t0 = performance.now();
    codec.read(bytes);
    expect(performance.now() - t0).toBeLessThan(1000);
  });
  it("rejects duplicate entries of a wanted part", () => {
    const p = parts("");
    const bytes = rawZip([
      { name: "xl/workbook.xml", data: p.wb },
      ...Array.from({ length: 50 }, () => ({ name: "xl/workbook.xml", data: p.wb })),
      { name: "xl/_rels/workbook.xml.rels", data: p.rels },
      { name: "xl/worksheets/s.xml", data: p.sheet },
    ]);
    expect(codec.read(bytes)).toEqual({ ok: false, error: "unreadable" });
  });
  it("rejects a zip with absurdly many entries", () => {
    const bytes = zipSync(Object.fromEntries(Array.from({ length: 1500 }, (_, i) => [`f${i}.txt`, strToU8("x")])));
    expect(codec.read(bytes)).toEqual({ ok: false, error: "unreadable" });
  });
  it("does not trust a declared size that is smaller than the real one", () => {
    const p = parts("");
    const big = strToU8(`<worksheet ${NS}><sheetData><row r="1"><c r="A1"><v>${"1".repeat(25_000_000)}</v></c></row></sheetData></worksheet>`);
    const bytes = rawZip([
      { name: "xl/workbook.xml", data: p.wb },
      { name: "xl/_rels/workbook.xml.rels", data: p.rels },
      { name: "xl/worksheets/s.xml", data: big, declared: 200 },
    ]);
    expect(codec.read(bytes)).toEqual({ ok: false, error: "too_large" });
  });
  it("is unreadable when the declared size is wrong but the real size is within budget", () => {
    const p = parts('<row r="1"><c r="A1" t="inlineStr"><is><t>ok</t></is></c></row>');
    const bytes = rawZip([
      { name: "xl/workbook.xml", data: p.wb },
      { name: "xl/_rels/workbook.xml.rels", data: p.rels },
      { name: "xl/worksheets/s.xml", data: p.sheet, declared: p.sheet.length + 5 },
    ]);
    expect(codec.read(bytes)).toEqual({ ok: false, error: "unreadable" });
  });
  it("accepts an honest sheet through the same hand-built path", () => {
    const p = parts('<row r="1"><c r="A1" t="inlineStr"><is><t>ok</t></is></c></row>');
    const bytes = rawZip([
      { name: "xl/workbook.xml", data: p.wb },
      { name: "xl/_rels/workbook.xml.rels", data: p.rels },
      { name: "xl/worksheets/s.xml", data: p.sheet },
    ]);
    expect(codec.read(bytes)).toEqual({ ok: true, rows: [["ok"]] });
  });
});

function crc32(d: Uint8Array) {
  let c = ~0;
  for (const b of d) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

/** Data-descriptor zip (bit 3, zeroed local header sizes), signed or unsigned descriptor. */
function ddZip(entries: Record<string, Uint8Array>, opts: { sig: boolean; method: 0 | 8 }): Uint8Array {
  const u16 = (n: number) => [n & 255, (n >> 8) & 255];
  const u32 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
  const body: number[] = [];
  const central: number[] = [];
  let n = 0;
  for (const [nm, data] of Object.entries(entries)) {
    const comp = opts.method === 8 ? deflateSync(data) : data;
    const name = strToU8(nm);
    const crc = crc32(data);
    const off = body.length;
    body.push(0x50, 0x4b, 3, 4, ...u16(20), ...u16(8), ...u16(opts.method), ...u16(0), ...u16(0), ...u32(0), ...u32(0), ...u32(0), ...u16(name.length), ...u16(0), ...name);
    for (const b of comp) body.push(b);
    if (opts.sig) body.push(0x50, 0x4b, 7, 8);
    body.push(...u32(crc), ...u32(comp.length), ...u32(data.length));
    central.push(0x50, 0x4b, 1, 2, ...u16(20), ...u16(20), ...u16(8), ...u16(opts.method), ...u16(0), ...u16(0), ...u32(crc), ...u32(comp.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off), ...name);
    n++;
  }
  return Uint8Array.from([...body, ...central, 0x50, 0x4b, 5, 6, ...u16(0), ...u16(0), ...u16(n), ...u16(n), ...u32(central.length), ...u32(body.length), ...u16(0)]);
}

describe("XLSX, data-descriptor zips", () => {
  const files = (sheet: string): Record<string, Uint8Array> => ({
    "[Content_Types].xml": strToU8("<Types/>"),
    "xl/workbook.xml": strToU8(`<workbook ${NS} xmlns:r="x"><sheets><sheet name="a" r:id="rId1"/></sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
    "xl/sharedStrings.xml": strToU8("<sst><si><t>Name</t></si><si><t>Anna</t></si></sst>"),
    "xl/worksheets/sheet1.xml": strToU8(`<worksheet ${NS}><sheetData>${sheet}</sheetData></worksheet>`),
  });
  const ok = '<row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="2"><c r="A2" t="s"><v>1</v></c></row>';
  for (const sig of [true, false]) {
    for (const method of [8, 0] as const) {
      it(`reads sig=${sig} method=${method}`, () => {
        expect(codec.read(ddZip(files(ok), { sig, method }))).toEqual({ ok: true, rows: [["Name"], ["Anna"]] });
      });
    }
  }
  it("reports too_large for an honest over-budget deflated entry", () => {
    const bytes = ddZip(files("<row/>".repeat(4_000_000)), { sig: true, method: 8 });
    expect(codec.read(bytes)).toEqual({ ok: false, error: "too_large" });
  });
});

describe("XLSX, sizes", () => {
  const rows = (count: number, row: (r: number) => string) => Array.from({ length: count }, (_, i) => row(i + 1)).join("");
  const measure = (bytes: Uint8Array) => {
    const heap = process.memoryUsage().heapUsed;
    const t0 = performance.now();
    const result = codec.read(bytes);
    return { result, ms: performance.now() - t0, heapMb: (process.memoryUsage().heapUsed - heap) / 1e6 };
  };

  it("rejects 100,000 wide sparse rows quickly and with bounded memory", () => {
    const bytes = zipSync({ ...workbookParts(), "xl/worksheets/blatt.xml": strToU8(sheetXml(rows(100_000, (r) => `<row r="${r}"><c r="ALL${r}"><v>1</v></c></row>`))) }, { level: 9 });
    const { result, ms, heapMb } = measure(bytes);
    expect(result).toEqual({ ok: false, error: "too_large" });
    expect(ms).toBeLessThan(1000);
    expect(heapMb).toBeLessThan(200);
  });
  it("stops after one row more than the importer accepts, so it reports too many rows", () => {
    const bytes = workbook({ sheet: rows(100_000, (r) => `<row r="${r}"><c r="A${r}"><v>${r}</v></c></row>`) });
    const { result, ms } = measure(bytes);
    expect(ms).toBeLessThan(1000);
    expect(result.ok && result.rows.length).toBe(1002);
  });
  it("does not pad formatting-only cells at the last column", () => {
    const bytes = workbook({ sheet: rows(100_000, (r) => `<row r="${r}"><c r="IV${r}" s="1"/></row>`) });
    const { result, ms, heapMb } = measure(bytes);
    expect(result).toEqual({ ok: true, rows: [] });
    expect(ms).toBeLessThan(1000);
    expect(heapMb).toBeLessThan(200);
  });
  it("reads a real list among thousands of formatted empty rows and cells", () => {
    const filled = '<row r="1"><c r="A1" t="inlineStr"><is><t>Name</t></is></c></row>' + rows(3, (r) => `<row r="${r + 1}"><c r="A${r + 1}" t="inlineStr"><is><t>P${r}</t></is></c><c r="Z${r + 1}" s="2"/></row>`);
    const formatted = rows(5_000, (r) => `<row r="${r + 4}" s="3"><c r="A${r + 4}" s="1"/><c r="XFD${r + 4}" s="1"/></row>`) + '<row r="150000" s="1"/>';
    expect(codec.read(workbook({ sheet: filled + formatted }))).toEqual({ ok: true, rows: [["Name"], ["P1"], ["P2"], ["P3"]] });
  });
  it("rejects a value beyond the 256th column", () => {
    expect(codec.read(workbook({ sheet: '<row r="1"><c r="IW1"><v>1</v></c></row>' }))).toEqual({ ok: false, error: "too_large" });
    expect(codec.read(workbook({ sheet: '<row r="1"><c r="IV1"><v>1</v></c></row>' })).ok).toBe(true);
  });
  it("rejects a value beyond row 100,000", () => {
    expect(codec.read(workbook({ sheet: '<row r="100001"><c r="A100001"><v>1</v></c></row>' }))).toEqual({ ok: false, error: "too_large" });
  });
});

describe("control characters", () => {
  it("are removed from CSV and XLSX cells, except tabs and line breaks", () => {
    expect(codec.read(text('Name\n"A\u0000n\u0007na\tB\nC"\n'))).toEqual({ ok: true, rows: [["Name"], ["Anna\tB\nC"]] });
    const bytes = workbook({ sheet: '<row r="1"><c r="A1" t="inlineStr"><is><t>B&#1;en</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>&#2;</t></is></c></row>' });
    expect(codec.read(bytes)).toEqual({ ok: true, rows: [["Ben"]] });
  });
});
