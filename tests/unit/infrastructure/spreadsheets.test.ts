import { strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { FflateSpreadsheets } from "@/infrastructure/spreadsheets";

const codec = new FflateSpreadsheets();
const text = (s: string) => new TextEncoder().encode(s);
const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';

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
});
