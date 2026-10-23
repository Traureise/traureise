import { describe, expect, it } from "vitest";
import type { Guest, Household, RsvpEvent } from "@/domain/guests";
import { planImport, pruneDecisions, readImportTable, templateTable, type ImportDecision, type ImportHeaders, type ImportRow } from "@/domain/guest-import";

const headers: ImportHeaders = { name: "Name", household: "Haushalt", child: "Kind", email: "E-Mail", allergies: "Allergien", personalLine: "Persönliche Zeile", unnamedColumn: "Spalte" };
const events: RsvpEvent[] = [
  { id: "e1", name: "Standesamt", startDate: "2027-06-01", startTime: "10:00" },
  { id: "e2", name: "Feier", startDate: "2027-06-01", startTime: "18:00" },
];

const row = (line: number, over: Partial<ImportRow> = {}): ImportRow => ({ line, name: `Person ${line}`, household: "", child: "", email: "", allergies: "", personalLine: "", events: {}, ...over });
const guest = (id: string, name: string, over: Partial<Guest> = {}): Guest => ({
  id, name, isChild: false, attending: null, eventIds: [], mealOptionId: null, allergies: "", pollAnswers: {}, fromRequest: false, email: null, ...over,
});
const household = (id: string, name: string, people: Guest[]): Household => ({
  id, name, invitedEventIds: null, message: "", pollAnswers: {}, respondedAt: null, answeredBy: null, createdAt: new Date(0), personalLine: "", unsubscribedAt: null, people, requests: [],
});
const plan = (rows: ImportRow[], existing: Household[] = [], decisions: Record<number, ImportDecision> = {}) =>
  planImport({ rows, decisions, existing, events, ignoredColumns: [] });

describe("readImportTable", () => {
  it("maps headers ignoring case and whitespace and lists unknown columns", () => {
    const result = readImportTable([[" name ", "HAUSHALT", "Tisch", "Standesamt"], ["Anna", "Müller", "5", "ja"]], headers, events);
    expect(result).toEqual({ ok: true, ignoredColumns: ["Tisch"], rows: [{ line: 2, name: "Anna", household: "Müller", child: "", email: "", allergies: "", personalLine: "", events: { e1: "ja" } }] });
  });
  it("lists columns without a header by their letter when they hold data, in column order", () => {
    const result = readImportTable([["Name", "", "Tisch", ""], ["Anna", "0171", "5", ""], ["Ben", "", "", "", "Notiz"]], headers, events);
    expect(result.ok && result.ignoredColumns).toEqual(["Spalte B", "Tisch", "Spalte E"]);
  });
  it("names columns past Z with two letters", () => {
    const head = ["Name", ...Array.from({ length: 26 }, () => "")];
    const result = readImportTable([head, ["Anna", ...Array.from({ length: 25 }, () => ""), "x"]], headers, events);
    expect(result.ok && result.ignoredColumns).toEqual(["Spalte AA"]);
  });
  it("needs a name column", () => {
    expect(readImportTable([["Haushalt"], ["Müller"]], headers, events)).toEqual({ ok: false, error: "no_name_column" });
  });
  it("treats an empty table and a header-only table as empty", () => {
    expect(readImportTable([], headers, events)).toEqual({ ok: false, error: "empty" });
    expect(readImportTable([["Name"]], headers, events)).toEqual({ ok: false, error: "empty" });
  });
  it("refuses more than 1000 rows", () => {
    const rows = Array.from({ length: 1001 }, (_, i) => [`P${i}`]);
    expect(readImportTable([["Name"], ...rows], headers, events)).toEqual({ ok: false, error: "too_many_rows" });
    expect(readImportTable([["Name"], ...rows.slice(0, 1000)], headers, events).ok).toBe(true);
  });
  it("drops empty rows and counts lines from 2", () => {
    const result = readImportTable([["Name"], ["Anna"], ["  "], [""], ["Ben"]], headers, events);
    expect(result.ok && result.rows.map((r) => [r.line, r.name])).toEqual([[2, "Anna"], [5, "Ben"]]);
  });
  it("tolerates short rows", () => {
    const result = readImportTable([["Name", "Haushalt"], ["Anna"]], headers, events);
    expect(result.ok && result.rows[0]?.household).toBe("");
  });
});

describe("planImport households", () => {
  it("groups by household and gives empty households their own", () => {
    const p = plan([row(2, { name: "A", household: "Müller" }), row(3, { name: "B", household: "Müller" }), row(4, { name: "C" })]);
    expect(p.create.map((h) => [h.name, h.people.map((x) => x.name)])).toEqual([["Müller", ["A", "B"]], ["C", ["C"]]]);
    expect(p.ready).toBe(true);
  });
  it("groups households ignoring case and whitespace", () => {
    const p = plan([row(2, { household: "Müller" }), row(3, { household: "  müller " })]);
    expect(p.create).toHaveLength(1);
  });
  it("invites to all events when every event cell is empty, else to the marked ones", () => {
    expect(plan([row(2)]).create[0]?.invitedEventIds).toBeNull();
    expect(plan([row(2, { events: { e1: "", e2: "" } })]).create[0]?.invitedEventIds).toBeNull();
    expect(plan([row(2, { events: { e1: "ja" } })]).create[0]?.invitedEventIds).toEqual(["e1"]);
    expect(plan([row(2, { events: { e1: "nein", e2: "x" } })]).create[0]?.invitedEventIds).toEqual(["e2"]);
  });
  it("takes the first personal line and warns about conflicts", () => {
    const p = plan([row(2, { household: "Müller", personalLine: "Danke" }), row(3, { household: "Müller", personalLine: "Merci" })]);
    expect(p.create[0]?.personalLine).toBe("Danke");
    expect(p.warnings).toContainEqual({ code: "conflicting_values", household: "Müller", field: "personalLine" });
  });
  it("warns about conflicting event cells", () => {
    const p = plan([row(2, { household: "M", events: { e1: "ja" } }), row(3, { household: "M", events: { e1: "nein" } })]);
    expect(p.warnings).toContainEqual({ code: "conflicting_values", household: "M", field: "events" });
  });
  it("joins an existing household without using its events or personal line", () => {
    const p = plan([row(2, { name: "Neu", household: " müller ", personalLine: "X", events: { e1: "ja" } })], [household("h1", "Müller", [guest("g1", "Alt")])]);
    expect(p.create).toEqual([]);
    expect(p.join).toEqual([{ householdId: "h1", householdName: "Müller", people: [{ name: "Neu", isChild: false, email: null, allergies: "" }] }]);
    expect(p.warnings).toEqual([]);
  });
  it("creates a new household and warns when two existing ones share the name", () => {
    const p = plan([row(2, { household: "Müller" })], [household("h1", "Müller", [guest("g1", "A")]), household("h2", "müller", [guest("g2", "B")])]);
    expect(p.join).toEqual([]);
    expect(p.create).toHaveLength(1);
    expect(p.warnings).toContainEqual({ code: "ambiguous_household", household: "Müller" });
  });
  it("reports ignored columns", () => {
    const p = planImport({ rows: [row(2)], decisions: {}, existing: [], events, ignoredColumns: ["Tisch"] });
    expect(p.warnings).toContainEqual({ code: "ignored_columns", columns: ["Tisch"] });
  });
  it("reads yes/no values and normalises emails", () => {
    const p = plan([row(2, { child: "Ja", email: " Anna@Example.COM ", allergies: "Nüsse" })]);
    expect(p.create[0]?.people[0]).toEqual({ name: "Person 2", isChild: true, email: "anna@example.com", allergies: "Nüsse" });
  });
});

describe("planImport problems", () => {
  it("flags missing names, bad emails, bad yes/no values and long values", () => {
    const p = plan([
      row(2, { name: "" }),
      row(3, { email: "nope" }),
      row(4, { child: "vielleicht" }),
      row(5, { name: "x".repeat(121) }),
      row(6, { events: { e1: "eventuell" } }),
      row(7, { allergies: "x".repeat(501) }),
      row(8, { personalLine: "x".repeat(301) }),
    ]);
    expect(p.problems).toEqual([
      { line: 2, field: "name", code: "required" },
      { line: 3, field: "email", code: "invalid_email" },
      { line: 4, field: "child", code: "invalid_yes_no" },
      { line: 5, field: "name", code: "too_long" },
      { line: 6, field: "events", code: "invalid_yes_no" },
      { line: 7, field: "allergies", code: "too_long" },
      { line: 8, field: "personalLine", code: "too_long" },
    ]);
    expect(p.create).toEqual([]);
    expect(p.ready).toBe(false);
  });
  it("caps a household at 30 people", () => {
    const rows = Array.from({ length: 31 }, (_, i) => row(i + 2, { household: "Groß" }));
    const p = plan(rows);
    expect(p.problems).toEqual([{ line: 32, field: "household", code: "household_full" }]);
    expect(p.create[0]?.people).toHaveLength(30);
  });
  it("counts the people of an existing household", () => {
    const existing = [household("h1", "Müller", [guest("g1", "A"), guest("g2", "B")])];
    const rows = Array.from({ length: 29 }, (_, i) => row(i + 2, { household: "Müller" }));
    const p = plan(rows, existing);
    expect(p.problems).toEqual([{ line: 30, field: "household", code: "household_full" }]);
    expect(p.join[0]?.people).toHaveLength(28);
  });
  it("leaves out a skipped problem row, and the plan can be ready", () => {
    const p = plan([row(2, { name: "" }), row(3)], [], { 2: { action: "skip" } });
    expect(p.problems).toEqual([]);
    expect(p.create).toHaveLength(1);
    expect(p.ready).toBe(true);
  });
  it("does not count an overwrite toward the cap", () => {
    const existing = [household("h1", "M", [guest("g1", "Anna", { })])];
    const rows = [row(2, { name: "Anna", household: "M" }), ...Array.from({ length: 29 }, (_, i) => row(i + 3, { household: "M" }))];
    const p = plan(rows, existing, { 2: { action: "overwrite", guestId: "g1" } });
    expect(p.problems).toEqual([]);
    expect(p.join[0]?.people).toHaveLength(29);
  });
});

describe("planImport duplicates", () => {
  const anna = household("h1", "Meier", [guest("g1", "Anna Meier", { email: "anna@example.com", allergies: "Nüsse", isChild: true })]);

  it("matches existing guests by name ignoring case and whitespace", () => {
    const p = plan([row(2, { name: "anna  meier" })], [anna]);
    expect(p.duplicates).toEqual([{ line: 2, by: "name", matches: [{ kind: "existing", guestId: "g1", householdName: "Meier", name: "Anna Meier", email: "anna@example.com" }] }]);
    expect(p.create).toEqual([]);
    expect(p.ready).toBe(false);
  });
  it("matches existing guests by email", () => {
    const p = plan([row(2, { name: "Someone", email: "ANNA@example.com" })], [anna]);
    expect(p.duplicates[0]).toMatchObject({ line: 2, by: "email" });
  });
  it("matches rows with the same email in different households", () => {
    const p = plan([row(2, { household: "A", email: "x@example.com" }), row(3, { household: "B", email: "x@example.com" })]);
    expect(p.duplicates).toEqual([{ line: 3, by: "email", matches: [{ kind: "row", line: 2 }] }]);
  });
  it("matches rows with the same name", () => {
    const p = plan([row(2, { name: "Ben", household: "A" }), row(3, { name: " ben ", household: "A" })]);
    expect(p.duplicates).toEqual([{ line: 3, by: "name", matches: [{ kind: "row", line: 2 }] }]);
  });
  it("allows a shared email within the same household", () => {
    const p = plan([row(2, { household: "A", email: "x@example.com" }), row(3, { household: "A", email: "x@example.com" })]);
    expect(p.duplicates).toEqual([]);
    expect(p.create[0]?.people).toHaveLength(2);
  });
  it("allows a shared email with a member of the household being joined", () => {
    const p = plan([row(2, { name: "Partner", household: "Meier", email: "anna@example.com" })], [anna]);
    expect(p.duplicates).toEqual([]);
    expect(p.join[0]?.people).toHaveLength(1);
  });
  it("still flags a shared email with someone in another household", () => {
    expect(plan([row(2, { name: "Partner", household: "Other", email: "anna@example.com" })], [anna]).duplicates).toHaveLength(1);
    expect(plan([row(2, { name: "Partner", email: "anna@example.com" })], [anna]).duplicates).toHaveLength(1);
  });
  it("still flags a same name inside the same household", () => {
    expect(plan([row(2, { name: "Anna Meier", household: "Meier" })], [anna]).duplicates).toHaveLength(1);
  });
  it("does not check problem rows for duplicates", () => {
    const p = plan([row(2, { name: "Anna Meier", email: "nope" })], [anna]);
    expect(p.duplicates).toEqual([]);
    expect(p.problems).toHaveLength(1);
  });
  it("matches only earlier rows that are not skipped", () => {
    const rows = [row(2, { name: "Ben", household: "A" }), row(3, { name: "Ben", household: "B" })];
    expect(plan(rows, [], { 2: { action: "skip" } }).duplicates).toEqual([]);
  });
  it("needs a decision; add imports, skip drops", () => {
    const rows = [row(2, { name: "Anna Meier" })];
    const add = plan(rows, [anna], { 2: { action: "add" } });
    expect(add.ready).toBe(true);
    expect(add.create[0]?.people[0]?.name).toBe("Anna Meier");
    const skip = plan([...rows, row(3, { name: "Other" })], [anna], { 2: { action: "skip" } });
    expect(skip.ready).toBe(true);
    expect(skip.create).toHaveLength(1);
    expect(skip.overwrite).toEqual([]);
  });
  it("overwrites, keeping old values for empty cells", () => {
    const p = plan([row(2, { name: "Anna Meier", email: "new@example.com" })], [anna], { 2: { action: "overwrite", guestId: "g1" } });
    expect(p.ready).toBe(true);
    expect(p.create).toEqual([]);
    expect(p.overwrite).toEqual([{ guestId: "g1", name: "Anna Meier", isChild: true, email: "new@example.com", allergies: "Nüsse" }]);
    const q = plan([row(2, { name: "Anna Meier", child: "nein", allergies: "Gluten" })], [anna], { 2: { action: "overwrite", guestId: "g1" } });
    expect(q.overwrite[0]).toEqual({ guestId: "g1", name: "Anna Meier", isChild: false, email: "anna@example.com", allergies: "Gluten" });
  });
  it("counts an overwrite with an unknown guest as undecided", () => {
    const p = plan([row(2, { name: "Anna Meier" })], [anna], { 2: { action: "overwrite", guestId: "nope" } });
    expect(p.ready).toBe(false);
    expect(p.overwrite).toEqual([]);
  });
  it("cannot overwrite a duplicate that only matches another row", () => {
    const rows = [row(2, { name: "Ben", household: "A" }), row(3, { name: "Ben", household: "B" })];
    expect(plan(rows, [], { 3: { action: "overwrite", guestId: "g1" } }).ready).toBe(false);
    expect(plan(rows, [], { 3: { action: "add" } }).ready).toBe(true);
  });
});

describe("templateTable", () => {
  it("has the headers followed by the event names", () => {
    expect(templateTable(headers, events)).toEqual([["Name", "Haushalt", "Kind", "E-Mail", "Allergien", "Persönliche Zeile", "Standesamt", "Feier"]]);
  });
});

describe("planImport edge cases", () => {
  const anna = household("h1", "Meier", [guest("g1", "Anna Meier")]);

  it("lets only one row overwrite a guest; a second claim is undecided", () => {
    const rows = [row(2, { name: "Anna Meier", household: "A" }), row(3, { name: "anna meier", household: "B" })];
    const p = plan(rows, [anna], { 2: { action: "overwrite", guestId: "g1" }, 3: { action: "overwrite", guestId: "g1" } });
    expect(p.overwrite.map((o) => o.guestId)).toEqual(["g1"]);
    expect(p.ready).toBe(false);
    expect(plan(rows, [anna], { 2: { action: "overwrite", guestId: "g1" }, 3: { action: "add" } }).ready).toBe(true);
  });
  it("is not ready when nothing would be imported", () => {
    expect(plan([]).ready).toBe(false);
    expect(plan([row(2)], [], { 2: { action: "skip" } }).ready).toBe(false);
  });
  it("does not let a problem row be a duplicate target", () => {
    const p = plan([row(2, { name: "Ben", email: "nope" }), row(3, { name: "Ben" })]);
    expect(p.duplicates).toEqual([]);
    expect(p.problems).toHaveLength(1);
  });
  it("counts an add-decided duplicate toward the cap", () => {
    const people = [guest("g1", "Anna")];
    const existing = [household("h1", "M", people)];
    const rows = [row(2, { name: "Anna", household: "M" }), ...Array.from({ length: 29 }, (_, i) => row(i + 3, { household: "M" }))];
    const p = plan(rows, existing, { 2: { action: "add" } });
    expect(p.problems).toEqual([{ line: 31, field: "household", code: "household_full" }]);
    expect(p.join[0]?.people).toHaveLength(29);
  });
  it("reports household_full for a row that is also a duplicate", () => {
    const rows = [...Array.from({ length: 30 }, (_, i) => row(i + 2, { household: "Groß" })), row(32, { name: "Person 2", household: "Groß" })];
    const p = plan(rows, [], { 32: { action: "add" } });
    expect(p.duplicates.map((d) => d.line)).toEqual([32]);
    expect(p.problems).toEqual([{ line: 32, field: "household", code: "household_full" }]);
    expect(p.ready).toBe(false);
  });
  it("plans 1000 rows against 1000 existing guests quickly", () => {
    const existing = Array.from({ length: 100 }, (_, h) =>
      household(`h${h}`, `Haus ${h}`, Array.from({ length: 10 }, (_, i) => guest(`g${h}-${i}`, `Gast ${h}-${i}`, { email: `g${h}-${i}@example.com` }))),
    );
    const rows = Array.from({ length: 1000 }, (_, i) => row(i + 2, { name: `Neu ${i}`, household: `Neu ${i % 100}`, email: `neu${i}@example.com` }));
    const start = performance.now();
    const p = plan(rows, existing);
    expect(performance.now() - start).toBeLessThan(1000);
    expect(p.duplicates).toEqual([]);
  });
});

describe("long cells", () => {
  it("cuts cells and ignored column names to 2000 characters, so the row is too long and can be skipped", () => {
    const long = "x".repeat(5000);
    const result = readImportTable([["Name", "Allergien", long], ["Anna", long, "y"]], headers, events);
    expect(result.ok && result.rows[0]?.allergies.length).toBe(2000);
    expect(result.ok && result.ignoredColumns[0]?.length).toBe(2000);
    if (!result.ok) return;
    expect(plan(result.rows).problems).toEqual([{ line: 2, field: "allergies", code: "too_long" }]);
    expect(plan(result.rows, [], { 2: { action: "skip" } }).problems).toEqual([]);
  });
  it("reports at most 200 ignored columns", () => {
    const head = ["Name", ...Array.from({ length: 300 }, (_, i) => `Spalte ${i}`)];
    const result = readImportTable([head, ["Anna"]], headers, events);
    expect(result.ok && result.ignoredColumns).toHaveLength(200);
  });
});

describe("unsubscribed households", () => {
  const meier = { ...household("h1", "Meier", [guest("g1", "Anna Meier")]), unsubscribedAt: new Date(0) };

  it("leaves out the file's addresses for people joining it, with a warning", () => {
    const p = plan([row(2, { name: "Ben", household: "Meier", email: "ben@example.com" }), row(3, { name: "Cleo", household: "Meier", email: "cleo@example.com" })], [meier]);
    expect(p.join[0]?.people.map((x) => x.email)).toEqual([null, null]);
    expect(p.warnings).toEqual([{ code: "unsubscribed_household", household: "Meier" }]);
  });
  it("keeps the missing address when overwriting someone in it", () => {
    const p = plan([row(2, { name: "Anna Meier", email: "anna@example.com" })], [meier], { 2: { action: "overwrite", guestId: "g1" } });
    expect(p.overwrite[0]?.email).toBeNull();
    expect(p.warnings).toEqual([{ code: "unsubscribed_household", household: "Meier" }]);
  });
  it("does not warn without an address in the file, nor for other households", () => {
    const other = household("h2", "Schulz", []);
    const p = plan([row(2, { name: "Ben", household: "Meier" }), row(3, { name: "Cleo", household: "Schulz", email: "cleo@example.com" })], [meier, other]);
    expect(p.warnings).toEqual([]);
    expect(p.join.find((j) => j.householdId === "h2")?.people[0]?.email).toBe("cleo@example.com");
  });
});

describe("overwriting names", () => {
  it("keeps the existing name when only case or spaces differ, and takes a new spelling otherwise", () => {
    const existing = [household("h1", "Meier", [guest("g1", "Anna Meier")])];
    expect(plan([row(2, { name: "anna  MEIER" })], existing, { 2: { action: "overwrite", guestId: "g1" } }).overwrite[0]?.name).toBe("Anna Meier");
    const renamed = plan([row(2, { name: "Anna Meier", email: "anna@example.com" })], [household("h1", "Meier", [guest("g1", "Anna Maier", { email: "anna@example.com" })])], { 2: { action: "overwrite", guestId: "g1" } });
    expect(renamed.overwrite[0]?.name).toBe("Anna Meier");
  });
});

describe("undecided rows", () => {
  const existing = [household("h1", "Meier", [guest("g1", "Anna Meier")])];
  const rows = [row(2, { name: "Anna Meier", household: "A" }), row(3, { name: "anna meier", household: "B" })];

  it("lists duplicates without a valid decision", () => {
    expect(plan(rows, existing).undecided).toEqual([2, 3]);
    expect(plan(rows, existing, { 2: { action: "add" } }).undecided).toEqual([3]);
  });
  it("marks a person another row already overwrites, for the other rows only", () => {
    const p = plan(rows, existing, { 3: { action: "overwrite", guestId: "g1" } });
    const match = (line: number) => p.duplicates.find((d) => d.line === line)?.matches.find((m) => m.kind === "existing");
    expect(match(2)).toMatchObject({ guestId: "g1", claimedBy: 3 });
    expect(match(3)).not.toHaveProperty("claimedBy");
    const both = plan(rows, existing, { 2: { action: "overwrite", guestId: "g1" }, 3: { action: "overwrite", guestId: "g1" } });
    expect(both.undecided).toEqual([3]);
    expect(both.duplicates.find((d) => d.line === 3)?.matches[0]).toMatchObject({ claimedBy: 2 });
  });
});

describe("pruneDecisions", () => {
  const anna = guest("g1", "Anna Meier");
  const rows = [row(2, { name: "Anna Meier" }), row(3, { name: "Ben" }), row(4, { name: "Cleo", email: "x" })];

  it("drops overwrites of people the row no longer matches and decisions of rows that are no longer duplicates, keeping skips", () => {
    const decisions: Record<number, ImportDecision> = { 2: { action: "overwrite", guestId: "g1" }, 3: { action: "add" }, 4: { action: "skip" } };
    // Anna was renamed after the review: row 2 is no longer a duplicate.
    const now = [household("h1", "Meier", [{ ...anna, name: "Anna Schmidt" }])];
    const p = plan(rows, now, decisions);
    const pruned = pruneDecisions(decisions, p);
    expect(pruned).toEqual({ 4: { action: "skip" } });
    expect(plan(rows, now, pruned)).toEqual(p);
    expect(p.ready).toBe(true);
  });
  it("keeps decisions the plan still offers", () => {
    const now = [household("h1", "Meier", [anna])];
    const decisions: Record<number, ImportDecision> = { 2: { action: "overwrite", guestId: "g1" }, 4: { action: "skip" } };
    expect(pruneDecisions(decisions, plan(rows, now, decisions))).toEqual(decisions);
    const gone: Record<number, ImportDecision> = { 2: { action: "overwrite", guestId: "g9" } };
    const p = plan(rows, now, gone);
    expect(pruneDecisions(gone, p)).toEqual({});
    expect(p.undecided).toEqual([2]);
  });
});
