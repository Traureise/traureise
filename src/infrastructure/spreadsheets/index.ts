import type { SheetRead, SpreadsheetCodec } from "@/application/ports";
import { parseCsv } from "./csv";
import { readXlsx, TooLargeError, writeXlsx } from "./xlsx";

const isZip = (b: Uint8Array) => b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;

/** Cells trimmed, trailing empty rows dropped. */
function tidy(rows: string[][]): string[][] {
  const out = rows.map((row) => row.map((c) => c.trim()));
  while (out.length > 0 && out[out.length - 1]!.every((c) => c === "")) out.pop();
  return out;
}

/** Parses untrusted uploads: never throws, malformed input is "unreadable". */
export class FflateSpreadsheets implements SpreadsheetCodec {
  read(bytes: Uint8Array): SheetRead {
    try {
      return { ok: true, rows: tidy(isZip(bytes) ? readXlsx(bytes) : parseCsv(bytes)) };
    } catch (error) {
      return { ok: false, error: error instanceof TooLargeError ? "too_large" : "unreadable" };
    }
  }

  writeXlsx(rows: string[][]): Uint8Array {
    return writeXlsx(rows);
  }
}
