import { isValidEmail, normalizeEmail } from "./email";
import { ALLERGIES_MAX, NAME_MAX, PERSONAL_LINE_MAX, type Household, type RsvpEvent } from "./guests";

/** Importing a guest list from a spreadsheet: reading the table, checking rows, and planning what to write. */

export const IMPORT_MAX_BYTES = 1_000_000;
export const IMPORT_MAX_ROWS = 1000;
export const HOUSEHOLD_MAX_PEOPLE = 30;

/** Header labels in the couple's language; the template uses them and the reader matches them. */
export type ImportHeaders = { name: string; household: string; child: string; email: string; allergies: string; personalLine: string };
/** One person row as the couple sees and edits it. `line` is the spreadsheet row number (header = 1). */
export type ImportRow = { line: number; name: string; household: string; child: string; email: string; allergies: string; personalLine: string; events: Record<string, string> };
export type ImportDecision = { action: "skip" } | { action: "add" } | { action: "overwrite"; guestId: string };
export type RowProblem = {
  line: number;
  field: keyof Omit<ImportRow, "line" | "events"> | "events" | "household";
  code: "required" | "too_long" | "invalid_email" | "invalid_yes_no" | "household_full";
};
export type DuplicateMatch = { kind: "existing"; guestId: string; householdName: string; name: string; email: string | null } | { kind: "row"; line: number };
export type Duplicate = { line: number; by: "name" | "email"; matches: DuplicateMatch[] };
export type ImportWarning =
  | { code: "ignored_columns"; columns: string[] }
  | { code: "conflicting_values"; household: string; field: "personalLine" | "events" }
  | { code: "ambiguous_household"; household: string };
export type PlannedPerson = { name: string; isChild: boolean; email: string | null; allergies: string };
export type ImportPlan = {
  problems: RowProblem[];
  duplicates: Duplicate[];
  /** New households and rows joining existing ones, in file order. */
  create: { name: string; invitedEventIds: string[] | null; personalLine: string; people: PlannedPerson[] }[];
  join: { householdId: string; householdName: string; people: PlannedPerson[] }[];
  /** Overwrites keep the person's household and answers; empty cells keep the old value. */
  overwrite: { guestId: string; name: string; isChild: boolean; email: string | null; allergies: string }[];
  warnings: ImportWarning[];
  /** True when every problem row is skipped and every duplicate decided. */
  ready: boolean;
};

/** Matching is case- and whitespace-insensitive. */
const key = (s: string) => s.trim().replace(/\s+/g, " ").toLocaleLowerCase("de");

const YES = new Set(["ja", "j", "x", "1", "yes", "y", "true", "wahr"]);
const NO = new Set(["nein", "n", "0", "no", "false", "falsch", ""]);
/** true, false, or null for a value that is neither. */
function yesNo(value: string): boolean | null {
  const k = key(value);
  if (YES.has(k)) return true;
  if (NO.has(k)) return false;
  return null;
}

type Column = "name" | "household" | "child" | "email" | "allergies" | "personalLine";
const COLUMNS: Column[] = ["name", "household", "child", "email", "allergies", "personalLine"];

export function readImportTable(
  table: string[][],
  headers: ImportHeaders,
  events: readonly RsvpEvent[],
): { ok: true; rows: ImportRow[]; ignoredColumns: string[] } | { ok: false; error: "empty" | "no_name_column" | "too_many_rows" } {
  const [head, ...body] = table;
  if (!head || body.length === 0) return { ok: false, error: "empty" };

  const fields = new Map<number, Column>();
  const eventColumns = new Map<number, string>();
  const ignoredColumns: string[] = [];
  head.forEach((cell, index) => {
    const k = key(cell);
    if (k === "") return;
    const field = COLUMNS.find((c) => key(headers[c]) === k && ![...fields.values()].includes(c));
    if (field) return void fields.set(index, field);
    const event = events.find((e) => key(e.name) === k && ![...eventColumns.values()].includes(e.id));
    if (event) return void eventColumns.set(index, event.id);
    ignoredColumns.push(cell.trim());
  });
  if (![...fields.values()].includes("name")) return { ok: false, error: "no_name_column" };

  const rows: ImportRow[] = [];
  body.forEach((cells, index) => {
    if (cells.every((c) => c.trim() === "")) return;
    const row: ImportRow = { line: index + 2, name: "", household: "", child: "", email: "", allergies: "", personalLine: "", events: {} };
    for (const [column, field] of fields) row[field] = (cells[column] ?? "").trim();
    for (const [column, eventId] of eventColumns) row.events[eventId] = (cells[column] ?? "").trim();
    rows.push(row);
  });
  if (rows.length === 0) return { ok: false, error: "empty" };
  if (rows.length > IMPORT_MAX_ROWS) return { ok: false, error: "too_many_rows" };
  return { ok: true, rows, ignoredColumns };
}

export function templateTable(headers: ImportHeaders, events: readonly RsvpEvent[]): string[][] {
  return [[headers.name, headers.household, headers.child, headers.email, headers.allergies, headers.personalLine, ...events.map((e) => e.name)]];
}

// ---- planning ----

function validate(row: ImportRow, events: readonly RsvpEvent[]): RowProblem[] {
  const problems: RowProblem[] = [];
  const add = (field: RowProblem["field"], code: RowProblem["code"]) => problems.push({ line: row.line, field, code });
  const name = row.name.trim();
  if (name === "") add("name", "required");
  else if (name.length > NAME_MAX) add("name", "too_long");
  if (row.household.trim().length > NAME_MAX) add("household", "too_long");
  if (yesNo(row.child) === null) add("child", "invalid_yes_no");
  const email = normalizeEmail(row.email);
  if (email !== "" && !isValidEmail(email)) add("email", "invalid_email");
  if (row.allergies.trim().length > ALLERGIES_MAX) add("allergies", "too_long");
  if (row.personalLine.trim().length > PERSONAL_LINE_MAX) add("personalLine", "too_long");
  if (events.some((e) => yesNo(row.events[e.id] ?? "") === null)) add("events", "invalid_yes_no");
  return problems;
}

/** Where a row's person ends up: an existing household, or a new one (identified by its key). */
type Target = { kind: "existing"; household: Household } | { kind: "new"; key: string; ambiguous: boolean };
type Candidate = { row: ImportRow; target: Target; email: string };
const sameTarget = (a: Target, b: Target) => (a.kind === "existing" ? b.kind === "existing" && a.household.id === b.household.id : b.kind === "new" && a.key === b.key);

function resolveTarget(row: ImportRow, existing: readonly Household[]): Target {
  const hk = key(row.household);
  // A row without a household forms its own, named after the person, and never joins one.
  if (hk === "") return { kind: "new", key: `#line:${row.line}`, ambiguous: false };
  const matches = existing.filter((h) => key(h.name) === hk);
  if (matches.length === 1) return { kind: "existing", household: matches[0]! };
  return { kind: "new", key: hk, ambiguous: matches.length > 1 };
}

const person = (row: ImportRow): PlannedPerson => ({ name: row.name.trim(), isChild: yesNo(row.child) === true, email: normalizeEmail(row.email) || null, allergies: row.allergies.trim() });

export function planImport(input: {
  rows: readonly ImportRow[];
  decisions: Readonly<Record<number, ImportDecision>>;
  existing: readonly Household[];
  events: readonly RsvpEvent[];
  ignoredColumns: readonly string[];
}): ImportPlan {
  const { existing, events, decisions } = input;
  const problems: RowProblem[] = [];
  const duplicates: Duplicate[] = [];
  const warnings: ImportWarning[] = [];
  if (input.ignoredColumns.length > 0) warnings.push({ code: "ignored_columns", columns: [...input.ignoredColumns] });

  // 1-3: validate; skipped rows are gone; rows with problems are not checked further.
  const candidates: Candidate[] = [];
  let openProblems = false;
  for (const row of input.rows) {
    const skipped = decisions[row.line]?.action === "skip";
    const found = validate(row, events);
    if (skipped) continue;
    if (found.length > 0) {
      problems.push(...found);
      openProblems = true;
      continue;
    }
    candidates.push({ row, target: resolveTarget(row, existing), email: normalizeEmail(row.email) });
  }

  // 4: duplicates, in file order.
  const guests = existing.flatMap((h) => h.people.map((g) => ({ household: h, guest: g })));
  const toAdd: Candidate[] = [];
  const toOverwrite: { candidate: Candidate; guestId: string }[] = [];
  let undecided = false;
  candidates.forEach((c, index) => {
    const name = key(c.row.name);
    const matches: DuplicateMatch[] = [];
    let byName = false;
    for (const { household, guest } of guests) {
      const nameMatch = key(guest.name) === name;
      const emailMatch = c.email !== "" && guest.email !== null && normalizeEmail(guest.email) === c.email && !(c.target.kind === "existing" && c.target.household.id === household.id);
      if (!nameMatch && !emailMatch) continue;
      byName ||= nameMatch;
      matches.push({ kind: "existing", guestId: guest.id, householdName: household.name, name: guest.name, email: guest.email });
    }
    for (const earlier of candidates.slice(0, index)) {
      const nameMatch = key(earlier.row.name) === name;
      const emailMatch = c.email !== "" && earlier.email === c.email && !sameTarget(c.target, earlier.target);
      if (!nameMatch && !emailMatch) continue;
      byName ||= nameMatch;
      matches.push({ kind: "row", line: earlier.row.line });
    }
    if (matches.length === 0) return void toAdd.push(c);

    duplicates.push({ line: c.row.line, by: byName ? "name" : "email", matches });
    const decision = decisions[c.row.line];
    if (decision?.action === "skip") return;
    if (decision?.action === "add") return void toAdd.push(c);
    if (decision?.action === "overwrite" && matches.some((m) => m.kind === "existing" && m.guestId === decision.guestId)) {
      return void toOverwrite.push({ candidate: c, guestId: decision.guestId });
    }
    undecided = true;
  });

  // 5: the household cap, counting the people already in a household being joined.
  const added = new Map<string, number>();
  const accepted: Candidate[] = [];
  for (const c of toAdd) {
    const id = c.target.kind === "existing" ? `h:${c.target.household.id}` : `n:${c.target.key}`;
    const count = added.get(id) ?? (c.target.kind === "existing" ? c.target.household.people.length : 0);
    if (count >= HOUSEHOLD_MAX_PEOPLE) {
      problems.push({ line: c.row.line, field: "household", code: "household_full" });
      openProblems = true;
      continue;
    }
    added.set(id, count + 1);
    accepted.push(c);
  }
  problems.sort((a, b) => a.line - b.line);

  // Assemble the plan from the accepted rows.
  const create: ImportPlan["create"] = [];
  const join: ImportPlan["join"] = [];
  const groups = new Map<string, Candidate[]>();
  for (const c of accepted) {
    const id = c.target.kind === "existing" ? `h:${c.target.household.id}` : `n:${c.target.key}`;
    const group = groups.get(id);
    if (group) group.push(c);
    else groups.set(id, [c]);
  }
  for (const group of groups.values()) {
    const first = group[0]!;
    if (first.target.kind === "existing") {
      join.push({ householdId: first.target.household.id, householdName: first.target.household.name, people: group.map((c) => person(c.row)) });
      continue;
    }
    const name = first.row.household.trim() || first.row.name.trim();
    const personalLines = group.map((c) => c.row.personalLine.trim()).filter(Boolean);
    if (personalLines.some((l) => l !== personalLines[0])) warnings.push({ code: "conflicting_values", household: name, field: "personalLine" });

    const invited: string[] = [];
    let anyEventCell = false;
    let eventsConflict = false;
    for (const event of events) {
      const values = group.flatMap((c) => (c.row.events[event.id]?.trim() ? [yesNo(c.row.events[event.id]!)] : []));
      if (values.length === 0) continue;
      anyEventCell = true;
      if (values.some((v) => v !== values[0])) eventsConflict = true;
      if (values[0]) invited.push(event.id);
    }
    if (eventsConflict) warnings.push({ code: "conflicting_values", household: name, field: "events" });
    if (first.target.ambiguous) warnings.push({ code: "ambiguous_household", household: first.row.household.trim() });
    create.push({ name, invitedEventIds: anyEventCell ? invited : null, personalLine: personalLines[0] ?? "", people: group.map((c) => person(c.row)) });
  }

  const overwrite: ImportPlan["overwrite"] = toOverwrite.map(({ candidate, guestId }) => {
    const old = guests.find((g) => g.guest.id === guestId)!.guest;
    const p = person(candidate.row);
    return {
      guestId,
      name: p.name,
      isChild: candidate.row.child.trim() === "" ? old.isChild : p.isChild,
      email: p.email ?? old.email,
      allergies: p.allergies || old.allergies,
    };
  });

  return { problems, duplicates, create, join, overwrite, warnings, ready: !openProblems && !undecided };
}

