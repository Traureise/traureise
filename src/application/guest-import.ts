import { z } from "zod";
import {
  IMPORT_MAX_BYTES,
  IMPORT_MAX_ROWS,
  planImport,
  readImportTable,
  templateTable,
  type ImportDecision,
  type ImportHeaders,
  type ImportPlan,
  type ImportRow,
} from "@/domain/guest-import";
import type { Deps } from "./deps";
import { ValidationError } from "./errors";
import { loadGuestContext } from "./guest-context";
import { loadOwnedWedding } from "./owned";

export type ImportReview = { rows: ImportRow[]; ignoredColumns: string[]; plan: ImportPlan };

const text = z.string().max(2000);
const rowsSchema = z
  .array(
    z.object({
      line: z.number().int().positive(),
      name: text,
      household: text,
      child: text,
      email: text,
      allergies: text,
      personalLine: text,
      events: z.record(text, text).refine((e) => Object.keys(e).length <= 200),
    }),
  )
  .max(IMPORT_MAX_ROWS);
const decisionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("skip") }),
  z.object({ action: z.literal("add") }),
  z.object({ action: z.literal("overwrite"), guestId: text }),
]);
const decisionsSchema = z.record(z.string().regex(/^[1-9][0-9]{0,8}$/), decisionSchema);
const ignoredSchema = z.array(text).max(200);

function parseReview(input: { rows: unknown; decisions: unknown; ignoredColumns?: unknown }) {
  const rows = rowsSchema.safeParse(input.rows);
  const decisions = decisionsSchema.safeParse(input.decisions);
  const ignored = ignoredSchema.safeParse(input.ignoredColumns ?? []);
  if (!rows.success) throw new ValidationError({ rows: "invalid" });
  if (!decisions.success) throw new ValidationError({ decisions: "invalid" });
  if (!ignored.success) throw new ValidationError({ ignoredColumns: "invalid" });
  return {
    rows: rows.data satisfies ImportRow[],
    decisions: Object.fromEntries(Object.entries(decisions.data).map(([line, d]) => [Number(line), d satisfies ImportDecision])) as Record<number, ImportDecision>,
    ignoredColumns: ignored.data,
  };
}

async function plan(deps: Deps, userId: string, weddingId: string, parsed: ReturnType<typeof parseReview>): Promise<ImportPlan> {
  const wedding = await loadOwnedWedding(deps, userId, weddingId);
  const { events } = await loadGuestContext(deps, wedding);
  const existing = await deps.guests.listHouseholds(weddingId);
  return planImport({ ...parsed, existing, events });
}

export class DownloadGuestTemplate {
  constructor(private deps: Deps) {}

  async execute(userId: string, weddingId: string, headers: ImportHeaders): Promise<{ filename: string; bytes: Uint8Array }> {
    const wedding = await loadOwnedWedding(this.deps, userId, weddingId);
    const { events } = await loadGuestContext(this.deps, wedding);
    return { filename: "gaeste-vorlage.xlsx", bytes: this.deps.spreadsheets.writeXlsx(templateTable(headers, events)) };
  }
}

export class PreviewGuestImport {
  constructor(private deps: Deps) {}

  async execute(userId: string, weddingId: string, file: { bytes: Uint8Array; size: number }, headers: ImportHeaders): Promise<ImportReview> {
    const wedding = await loadOwnedWedding(this.deps, userId, weddingId);
    if (file.bytes.byteLength === 0) throw new ValidationError({ file: "empty" });
    if (file.bytes.byteLength > IMPORT_MAX_BYTES) throw new ValidationError({ file: "too_large" });
    const sheet = this.deps.spreadsheets.read(file.bytes);
    if (!sheet.ok) throw new ValidationError({ file: sheet.error });
    const { events } = await loadGuestContext(this.deps, wedding);
    const table = readImportTable(sheet.rows, headers, events);
    if (!table.ok) throw new ValidationError({ file: table.error });
    const existing = await this.deps.guests.listHouseholds(weddingId);
    return { rows: table.rows, ignoredColumns: table.ignoredColumns, plan: planImport({ rows: table.rows, decisions: {}, existing, events, ignoredColumns: table.ignoredColumns }) };
  }
}

/** Re-plans the couple's edited rows and decisions against the current guest list. */
export class PlanGuestImport {
  constructor(private deps: Deps) {}

  async execute(userId: string, weddingId: string, input: { rows: unknown; decisions: unknown; ignoredColumns: unknown }): Promise<ImportPlan> {
    return plan(this.deps, userId, weddingId, parseReview(input));
  }
}

export class ImportGuests {
  constructor(private deps: Deps) {}

  async execute(userId: string, weddingId: string, input: { rows: unknown; decisions: unknown }): Promise<{ households: number; people: number; overwritten: number }> {
    const parsed = parseReview(input);
    const result = await plan(this.deps, userId, weddingId, parsed);
    // The guest list may have changed since the couple reviewed it; nothing is written then.
    const honored = new Set(result.overwrite.map((o) => o.guestId));
    const lost = Object.values(parsed.decisions).some((d) => d.action === "overwrite" && !honored.has(d.guestId));
    if (!result.ready || lost) throw new ValidationError({ _: "review_outdated" });
    const { guests, guestLinks } = this.deps;
    await guests.importGuests(weddingId, result, (id) => guestLinks.hash(guestLinks.tokenFor(id)));
    return {
      households: result.create.length,
      people: result.create.reduce((n, h) => n + h.people.length, 0) + result.join.reduce((n, h) => n + h.people.length, 0),
      overwritten: result.overwrite.length,
    };
  }
}
