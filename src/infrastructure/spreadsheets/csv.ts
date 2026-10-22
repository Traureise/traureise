/** Decodes as UTF-8, falls back to Windows-1252 (older German Excel exports). Strips the BOM. */
function decode(bytes: Uint8Array): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder("windows-1252").decode(bytes);
  }
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** ";" (German Excel) unless the header line has more commas. */
function delimiterOf(text: string): string {
  const end = text.search(/[\r\n]/);
  const first = end === -1 ? text : text.slice(0, end);
  const commas = first.split(",").length - 1;
  const semicolons = first.split(";").length - 1;
  return commas > semicolons ? "," : ";";
}

/** RFC 4180 state machine: quoted cells may hold delimiters, quotes ("") and line breaks. */
export function parseCsv(bytes: Uint8Array): string[][] {
  const text = decode(bytes);
  const delimiter = delimiterOf(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let started = false; // anything seen on the current line
  const endCell = () => {
    row.push(cell);
    cell = "";
  };
  const endRow = () => {
    endCell();
    rows.push(row);
    row = [];
    started = false;
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"' && cell === "") {
      quoted = true;
      started = true;
    } else if (c === delimiter) {
      endCell();
      started = true;
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      endRow();
    } else {
      cell += c;
      started = true;
    }
  }
  if (started || cell !== "") endRow();
  return rows;
}
