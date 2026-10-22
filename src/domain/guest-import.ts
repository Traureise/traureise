import { isValidEmail, normalizeEmail } from "./email";
import { ALLERGIES_MAX, NAME_MAX, PERSONAL_LINE_MAX, type Household, type RsvpEvent } from "./guests";

/** Importing a guest list from a spreadsheet: reading the table, checking rows, and planning what to write. */

export const IMPORT_MAX_BYTES = 1_000_000;
export const IMPORT_MAX_ROWS = 1000;
export const HOUSEHOLD_MAX_PEOPLE = 30;
/** Longer cells are cut: still longer than any field allows, so the row shows "too long" and can be skipped. */
export const IMPORT_CELL_MAX = 2000;
/** At most this many ignored column names are reported. */
export const IMPORT_IGNORED_COLUMNS_MAX = 200;

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
export type DuplicateMatch =
  /** `claimedBy`: the line of another row that already overwrites this person. */
  | { kind: "existing"; guestId: string; householdName: string; name: string; email: string | null; claimedBy?: number }
  | { kind: "row"; line: number };
export type Duplicate = { line: number; by: "name" | "email"; matches: DuplicateMatch[] };
export type ImportWarning =
  | { code: "ignored_columns"; columns: string[] }
  | { code: "conflicting_values"; household: string; field: "personalLine" | "events" }
  | { code: "ambiguous_household"; household: string }
  /** The household asked for no more emails, so the file's addresses for it are left out. */
  | { code: "unsubscribed_household"; household: string };
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
  /** Duplicate lines still waiting for a (valid) decision. */
  undecided: number[];
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

const cut = (s: string) => (s.length > IMPORT_CELL_MAX ? s.slice(0, IMPORT_CELL_MAX) : s);

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
    if (ignoredColumns.length < IMPORT_IGNORED_COLUMNS_MAX) ignoredColumns.push(cut(cell.trim()));
  });
  if (![...fields.values()].includes("name")) return { ok: false, error: "no_name_column" };

  const rows: ImportRow[] = [];
  body.forEach((cells, index) => {
    if (cells.every((c) => c.trim() === "")) return;
    const row: ImportRow = { line: index + 2, name: "", household: "", child: "", email: "", allergies: "", personalLine: "", events: {} };
    for (const [column, field] of fields) row[field] = cut((cells[column] ?? "").trim());
    for (const [column, eventId] of eventColumns) row.events[eventId] = cut((cells[column] ?? "").trim());
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
    if (skipped) continue;
    const found = validate(row, events);
    if (found.length > 0) {
      problems.push(...found);
      openProblems = true;
      continue;
    }
    candidates.push({ row, target: resolveTarget(row, existing), email: normalizeEmail(row.email) });
  }

  // 4: duplicates, in file order. Indexes of existing guests and of earlier rows avoid rescanning everything.
  const guests = existing.flatMap((h) => h.people.map((g) => ({ household: h, guest: g })));
  type Known = { order: number; household: Household; guest: Household["people"][number] };
  const byName = new Map<string, Known[]>();
  const byEmail = new Map<string, Known[]>();
  const push = <T>(map: Map<string, T[]>, k: string, value: T) => {
    const list = map.get(k);
    if (list) list.push(value);
    else map.set(k, [value]);
  };
  guests.forEach(({ household, guest }, order) => {
    const known = { order, household, guest };
    push(byName, key(guest.name), known);
    if (guest.email) push(byEmail, normalizeEmail(guest.email), known);
  });
  type Earlier = { order: number; candidate: Candidate };
  const rowsByName = new Map<string, Earlier[]>();
  const rowsByEmail = new Map<string, Earlier[]>();

  const toAdd: Candidate[] = [];
  const toOverwrite: { candidate: Candidate; guestId: string }[] = [];
  const claimed = new Map<string, number>();
  const undecided: number[] = [];
  const existingMatches: { line: number; matches: Extract<DuplicateMatch, { kind: "existing" }>[] }[] = [];
  candidates.forEach((c, order) => {
    const name = key(c.row.name);
    const sameName = byName.get(name) ?? [];
    const sameEmail = c.email === "" ? [] : (byEmail.get(c.email) ?? []).filter((k) => !(c.target.kind === "existing" && c.target.household.id === k.household.id));
    const known = [...new Map([...sameName, ...sameEmail].map((k) => [k.order, k])).values()].sort((a, b) => a.order - b.order);
    const earlierName = rowsByName.get(name) ?? [];
    const earlierEmail = c.email === "" ? [] : (rowsByEmail.get(c.email) ?? []).filter((e) => !sameTarget(c.target, e.candidate.target));
    const earlier = [...new Map([...earlierName, ...earlierEmail].map((e) => [e.order, e])).values()].sort((a, b) => a.order - b.order);

    push(rowsByName, name, { order, candidate: c });
    if (c.email !== "") push(rowsByEmail, c.email, { order, candidate: c });

    if (known.length === 0 && earlier.length === 0) return void toAdd.push(c);
    const mine = known.map((k) => ({ kind: "existing" as const, guestId: k.guest.id, householdName: k.household.name, name: k.guest.name, email: k.guest.email }));
    existingMatches.push({ line: c.row.line, matches: mine });
    const matches: DuplicateMatch[] = [...mine, ...earlier.map((e): DuplicateMatch => ({ kind: "row", line: e.candidate.row.line }))];
    const matchedByName = sameName.length > 0 || earlierName.length > 0;
    duplicates.push({ line: c.row.line, by: matchedByName ? "name" : "email", matches });
    const decision = decisions[c.row.line];
    if (decision?.action === "add") return void toAdd.push(c);
    // A person can be overwritten by one row only; a second claim counts as undecided.
    if (decision?.action === "overwrite" && !claimed.has(decision.guestId) && known.some((k) => k.guest.id === decision.guestId)) {
      claimed.set(decision.guestId, c.row.line);
      return void toOverwrite.push({ candidate: c, guestId: decision.guestId });
    }
    undecided.push(c.row.line);
  });
  // Every other row sees who already overwrites a person, wherever that row is in the file.
  for (const { line, matches } of existingMatches) {
    for (const m of matches) {
      const by = claimed.get(m.guestId);
      if (by !== undefined && by !== line) Object.assign(m, { claimedBy: by });
    }
  }

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
      const target = first.target.household;
      const people = group.map((c) => person(c.row));
      join.push({ householdId: target.id, householdName: target.name, people: target.unsubscribedAt ? people.map((p) => withoutEmail(p, target)) : people });
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
    const { guest: old, household } = guests.find((g) => g.guest.id === guestId)!;
    const fromFile = person(candidate.row);
    const p = household.unsubscribedAt && fromFile.email !== old.email ? withoutEmail(fromFile, household) : fromFile;
    return {
      guestId,
      // A difference only in case or spaces keeps the name as the couple wrote it before.
      name: key(old.name) === key(p.name) ? old.name : p.name,
      isChild: candidate.row.child.trim() === "" ? old.isChild : p.isChild,
      email: p.email ?? old.email,
      allergies: p.allergies || old.allergies,
    };
  });

  return {
    problems,
    duplicates,
    create,
    join,
    overwrite,
    warnings,
    undecided,
    ready: !openProblems && undecided.length === 0 && (create.length > 0 || join.length > 0 || overwrite.length > 0),
  };

  /** A household that unsubscribed gets no address from a file; the couple can add one in the household dialog. */
  function withoutEmail(p: PlannedPerson, household: Household): PlannedPerson {
    if (p.email === null) return p;
    if (!warnings.some((w) => w.code === "unsubscribed_household" && w.household === household.name)) warnings.push({ code: "unsubscribed_household", household: household.name });
    return { ...p, email: null };
  }
}

/**
 * Drops decisions a new plan no longer offers: overwriting a person the row no longer matches,
 * and "add" or "overwrite" for a row that is no longer a duplicate. Skips stay. Planning ignores
 * these decisions anyway, so the plan stays the same; without them the import is not refused.
 */
export function pruneDecisions(decisions: Readonly<Record<number, ImportDecision>>, plan: ImportPlan): Record<number, ImportDecision> {
  const duplicates = new Map(plan.duplicates.map((d) => [d.line, d]));
  const out: Record<number, ImportDecision> = {};
  for (const [line, decision] of Object.entries(decisions)) {
    const dup = duplicates.get(Number(line));
    if (decision.action === "skip") out[Number(line)] = decision;
    else if (!dup) continue;
    else if (decision.action === "add" || dup.matches.some((m) => m.kind === "existing" && m.guestId === decision.guestId)) out[Number(line)] = decision;
  }
  return out;
}

