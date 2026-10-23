"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { importGuestsAction, planGuestImportAction, previewGuestImportAction } from "@/app/actions/guests";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IMPORT_MAX_BYTES, pruneDecisions, type Duplicate, type ImportDecision, type ImportPlan, type ImportRow, type ImportWarning, type RowProblem } from "@/domain/guest-import";

type Review = { rows: ImportRow[]; decisions: Record<number, ImportDecision>; ignoredColumns: string[]; plan: ImportPlan };
type EventRef = { id: string; name: string };
type TextField = "name" | "household" | "child" | "email" | "allergies" | "personalLine";
const TEXT_FIELDS: TextField[] = ["name", "household", "child", "email", "allergies", "personalLine"];
const selectClass = "h-9 w-full rounded-lg border border-input bg-card px-3 text-sm";

/** Editing a row can change what it matches, so its old decision no longer applies. */
const without = (decisions: Record<number, ImportDecision>, line: number) => Object.fromEntries(Object.entries(decisions).filter(([l]) => Number(l) !== line)) as Record<number, ImportDecision>;

/** Upload a spreadsheet, review the rows with problems and duplicates, and import. Nothing is saved before the last step. */
export function GuestImport({ weddingId, events }: { weddingId: string; events: EventRef[] }) {
  const t = useTranslations("guests.import");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [review, setReview] = useState<Review | null>(null);
  const [fileError, setFileError] = useState<string>();
  const [outdated, setOutdated] = useState(false);
  /** The last re-plan failed, so the plan on screen may be wrong: importing waits for a successful one. */
  const [stale, setStale] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function upload(file: File) {
    const reset = () => {
      if (fileInput.current) fileInput.current.value = "";
      setEditing(null);
      setOutdated(false);
      setStale(false);
    };
    if (file.size > IMPORT_MAX_BYTES) {
      reset();
      setReview(null);
      setFileError(t("fileErrors.too_large"));
      return;
    }
    const form = new FormData();
    form.set("file", file);
    start(async () => {
      let result: Awaited<ReturnType<typeof previewGuestImportAction>>;
      try {
        result = await previewGuestImportAction(weddingId, form);
      } catch {
        reset();
        toast.error(tErrors("unknown"));
        return;
      }
      reset();
      if (!result.ok) {
        const code = result.fieldErrors?.file;
        setReview(null);
        setFileError(code && t.has(`fileErrors.${code}`) ? t(`fileErrors.${code}`) : tErrors(result.error ?? "unknown"));
        return;
      }
      setFileError(undefined);
      setReview({ ...result.data, decisions: {} });
    });
  }

  /**
   * Plans against the current guest list; the server's plan replaces ours, and decisions it no
   * longer offers are dropped (otherwise they would refuse every import). False when it failed.
   */
  async function replan(current: Review, next: { rows: ImportRow[]; decisions: Record<number, ImportDecision> }): Promise<boolean> {
    let result: Awaited<ReturnType<typeof planGuestImportAction>>;
    try {
      result = await planGuestImportAction(weddingId, { ...next, ignoredColumns: current.ignoredColumns });
    } catch {
      result = { ok: false, error: "unknown" };
    }
    if (!result.ok) {
      setStale(true);
      toast.error(tErrors(result.error ?? "unknown"));
      return false;
    }
    setStale(false);
    setReview({ ...current, rows: next.rows, decisions: pruneDecisions(next.decisions, result.data), plan: result.data });
    return true;
  }

  /** Re-plans after an edit or a decision. */
  function change(next: { rows: ImportRow[]; decisions: Record<number, ImportDecision> }, onDone?: () => void) {
    if (!review) return;
    start(async () => {
      if (!(await replan(review, next))) return;
      setOutdated(false);
      onDone?.();
    });
  }

  function submit() {
    if (!review) return;
    start(async () => {
      let result: Awaited<ReturnType<typeof importGuestsAction>>;
      try {
        result = await importGuestsAction(weddingId, { rows: review.rows, decisions: review.decisions });
      } catch {
        toast.error(tErrors("unknown"));
        return;
      }
      if (result.ok) {
        toast.success(t("done", result.data));
        router.push(`/hochzeiten/${weddingId}/gaeste`);
        return;
      }
      if (result.fieldErrors?._ === "review_outdated") {
        setOutdated(true);
        toast.error(t("outdated"));
        await replan(review, { rows: review.rows, decisions: review.decisions });
        return;
      }
      toast.error(tErrors(result.error ?? "unknown"));
    });
  }

  const decide = (decisions: Record<number, ImportDecision>) => review && change({ rows: review.rows, decisions });
  const decideOne = (line: number, decision: ImportDecision) => review && decide({ ...review.decisions, [line]: decision });
  const undo = (line: number) => {
    if (!review) return;
    decide(without(review.decisions, line));
  };
  const decideAll = (lines: number[], decision: ImportDecision) => review && decide({ ...review.decisions, ...Object.fromEntries(lines.map((l) => [l, decision])) });

  const problemLines = review ? [...new Set(review.plan.problems.map((p) => p.line))] : [];
  const skippedLines = review ? review.rows.filter((r) => review.decisions[r.line]?.action === "skip").map((r) => r.line) : [];
  const rowOf = (line: number) => review?.rows.find((r) => r.line === line);

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Label htmlFor="import-file">{t("file")}</Label>
        <Input
          id="import-file"
          ref={fileInput}
          type="file"
          accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          disabled={pending}
          aria-describedby="import-file-hint"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload(file);
          }}
        />
        <p id="import-file-hint" className="text-sm text-muted-foreground">
          {t("fileHint")}
        </p>
        {pending && !review && (
          <p role="status" className="text-sm text-muted-foreground">
            {t("reading")}
          </p>
        )}
        {fileError && (
          <p role="alert" className="text-sm text-destructive">
            {fileError}
          </p>
        )}
      </div>

      {review && (
        <div className="space-y-10">
          {(outdated || stale) && (
            <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm" data-testid="import-outdated">
              {stale ? t("stale") : t("outdated")}
            </p>
          )}

          {problemLines.length > 0 && (
            <section aria-labelledby="import-problems" className="space-y-3" data-testid="import-problems">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 id="import-problems" className="font-heading text-2xl font-medium">
                    {t("problems.title", { count: problemLines.length })}
                  </h3>
                  <p className="text-sm text-muted-foreground">{t("problems.lead")}</p>
                </div>
                <Button type="button" variant="outline" disabled={pending} onClick={() => decideAll(problemLines, { action: "skip" })}>
                  {t("skipAll")}
                </Button>
              </div>
              <ul className="space-y-3">
                {problemLines.map((line) => {
                  const row = rowOf(line)!;
                  return (
                    <li key={line} className="space-y-3 rounded-2xl border border-border bg-card p-4" data-testid="import-problem">
                      <RowSummary row={row} events={events} />
                      <ul className="space-y-1 text-sm text-destructive">
                        {review.plan.problems
                          .filter((p) => p.line === line)
                          .map((p, i) => (
                            <li key={i}>
                              <ProblemText problem={p} />
                            </li>
                          ))}
                      </ul>
                      {editing === line ? (
                        <RowEditor
                          row={row}
                          events={events}
                          busy={pending}
                          onCancel={() => setEditing(null)}
                          onSave={(next) => {
                            change({ rows: review.rows.map((r) => (r.line === line ? next : r)), decisions: without(review.decisions, line) }, () => setEditing(null));
                          }}
                        />
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" size="sm" disabled={pending} aria-label={t("rowAction", { action: t("edit"), line })} onClick={() => setEditing(line)}>
                            {t("edit")}
                          </Button>
                          <Button type="button" size="sm" variant="outline" disabled={pending} aria-label={t("rowAction", { action: t("skip"), line })} onClick={() => decideOne(line, { action: "skip" })}>
                            {t("skip")}
                          </Button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {review.plan.duplicates.length > 0 && (
            <section aria-labelledby="import-duplicates" className="space-y-3" data-testid="import-duplicates">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 id="import-duplicates" className="font-heading text-2xl font-medium">
                    {t("duplicates.title", { count: review.plan.duplicates.length })}
                  </h3>
                  <p className="text-sm text-muted-foreground">{t("duplicates.lead")}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" disabled={pending} onClick={() => decideAll(review.plan.duplicates.map((d) => d.line), { action: "skip" })}>
                    {t("skipAll")}
                  </Button>
                  <Button type="button" variant="outline" disabled={pending} onClick={() => decideAll(review.plan.duplicates.map((d) => d.line), { action: "add" })}>
                    {t("addAllAnyway")}
                  </Button>
                </div>
              </div>
              <ul className="space-y-3">
                {review.plan.duplicates.map((dup) => (
                  <DuplicateItem
                    key={dup.line}
                    dup={dup}
                    row={rowOf(dup.line)!}
                    events={events}
                    decision={review.decisions[dup.line]}
                    undecided={review.plan.undecided.includes(dup.line)}
                    busy={pending}
                    editing={editing === dup.line}
                    onEdit={() => setEditing(dup.line)}
                    onCancel={() => setEditing(null)}
                    onDecide={(d) => decideOne(dup.line, d)}
                    onSave={(next) => {
                      change({ rows: review.rows.map((r) => (r.line === dup.line ? next : r)), decisions: without(review.decisions, dup.line) }, () => setEditing(null));
                    }}
                  />
                ))}
              </ul>
            </section>
          )}

          {skippedLines.length > 0 && (
            <section aria-labelledby="import-skipped" className="space-y-3">
              <h3 id="import-skipped" className="font-heading text-2xl font-medium">
                {t("skipped.title", { count: skippedLines.length })}
              </h3>
              <ul className="space-y-2">
                {skippedLines.map((line) => (
                  <li key={line} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-border px-4 py-2 text-sm text-muted-foreground" data-testid="import-skipped">
                    <span>{t("skipped.row", { line, name: rowOf(line)?.name || t("unset") })}</span>
                    <Button type="button" size="sm" variant="ghost" disabled={pending} aria-label={t("rowAction", { action: t("skipped.undo"), line })} onClick={() => undo(line)}>
                      {t("skipped.undo")}
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <PlanSection plan={review.plan} />

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" disabled={!review.plan.ready || stale || pending} aria-describedby="import-waiting" onClick={submit}>
              {pending ? t("importing") : t("submit")}
            </Button>
            {stale && (
              <Button type="button" variant="outline" disabled={pending} onClick={() => change({ rows: review.rows, decisions: review.decisions })}>
                {t("recheck")}
              </Button>
            )}
            <p id="import-waiting" className="text-sm text-muted-foreground" data-testid="import-waiting">
              {review.plan.undecided.length > 0 && t("undecided", { count: review.plan.undecided.length, lines: review.plan.undecided.join(", ") })}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function RowSummary({ row, events }: { row: ImportRow; events: EventRef[] }) {
  const t = useTranslations("guests.import");
  const parts = [
    ...TEXT_FIELDS.filter((f) => f !== "name" && row[f] !== "").map((f) => `${t(`fields.${f}`)}: ${row[f]}`),
    ...events.filter((e) => (row.events[e.id] ?? "") !== "").map((e) => `${e.name}: ${row.events[e.id]}`),
  ];
  return (
    <div className="min-w-0 space-y-0.5">
      <p className="font-medium">
        <span className="text-muted-foreground">{t("line", { line: row.line })}</span> · {row.name || t("unset")}
      </p>
      {parts.length > 0 && <p className="text-sm break-words text-muted-foreground">{parts.join(" · ")}</p>}
    </div>
  );
}

function ProblemText({ problem }: { problem: RowProblem }) {
  const t = useTranslations("guests.import");
  const tErrors = useTranslations("errors");
  return <>{t("problem", { field: t(`fields.${problem.field}`), message: tErrors(problem.code) })}</>;
}

function DuplicateItem({
  dup,
  row,
  events,
  decision,
  undecided,
  busy,
  editing,
  onEdit,
  onCancel,
  onDecide,
  onSave,
}: {
  dup: Duplicate;
  row: ImportRow;
  events: EventRef[];
  decision: ImportDecision | undefined;
  undecided: boolean;
  busy: boolean;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onDecide: (decision: ImportDecision) => void;
  onSave: (row: ImportRow) => void;
}) {
  const t = useTranslations("guests.import");
  const line = row.line;
  const existing = dup.matches.flatMap((m) => (m.kind === "existing" ? [m] : []));
  return (
    <li className="space-y-3 rounded-2xl border border-border bg-card p-4" data-testid="import-duplicate">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <RowSummary row={row} events={events} />
        <Badge variant="outline">{t(dup.by === "name" ? "duplicates.byName" : "duplicates.byEmail")}</Badge>
      </div>
      <ul className="space-y-1 rounded-xl bg-secondary/40 p-3 text-sm">
        {dup.matches.map((m, i) => (
          <li key={i}>
            {m.kind === "existing"
              ? m.email
                ? t("duplicates.existingEmail", { name: m.name, household: m.householdName, email: m.email })
                : t("duplicates.existing", { name: m.name, household: m.householdName })
              : t("duplicates.row", { line: m.line })}
            {m.kind === "existing" && m.claimedBy !== undefined && <> · {t("duplicates.claimed", { line: m.claimedBy })}</>}
          </li>
        ))}
      </ul>
      {decision?.action === "add" && <p className="text-sm text-muted-foreground">{t("added")}</p>}
      {decision?.action === "overwrite" && !undecided && <p className="text-sm text-muted-foreground">{t("overwritten", { name: existing.find((m) => m.guestId === decision.guestId)?.name ?? "" })}</p>}
      {undecided && (
        <p className="text-sm font-medium text-destructive" data-testid="import-needs-decision">
          {t("needsDecision")}
        </p>
      )}
      {editing ? (
        <RowEditor row={row} events={events} busy={busy} onCancel={onCancel} onSave={onSave} />
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" disabled={busy} aria-label={t("rowAction", { action: t("skip"), line })} onClick={() => onDecide({ action: "skip" })}>
              {t("skip")}
            </Button>
            <Button type="button" size="sm" variant={decision?.action === "add" ? "default" : "outline"} aria-pressed={decision?.action === "add"} disabled={busy} aria-label={t("rowAction", { action: t("addAnyway"), line })} onClick={() => onDecide({ action: "add" })}>
              {t("addAnyway")}
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={busy} aria-label={t("rowAction", { action: t("edit"), line })} onClick={onEdit}>
              {t("edit")}
            </Button>
            {existing.map((m) => {
              const pressed = !undecided && decision?.action === "overwrite" && decision.guestId === m.guestId;
              return (
                <Button
                  key={m.guestId}
                  type="button"
                  size="sm"
                  variant={pressed ? "default" : "outline"}
                  aria-pressed={pressed}
                  disabled={busy || m.claimedBy !== undefined}
                  aria-label={t("rowAction", { action: t("overwrite", { name: m.name, household: m.householdName }), line })}
                  onClick={() => onDecide({ action: "overwrite", guestId: m.guestId })}
                >
                  {t("overwrite", { name: m.name, household: m.householdName })}
                </Button>
              );
            })}
          </div>
          {existing.length > 0 && <p className="text-xs text-muted-foreground">{t("overwriteHint")}</p>}
        </div>
      )}
    </li>
  );
}

/** Every field of a row, for fixing a typo or a wrong value in place. */
function RowEditor({ row, events, busy, onSave, onCancel }: { row: ImportRow; events: EventRef[]; busy: boolean; onSave: (row: ImportRow) => void; onCancel: () => void }) {
  const t = useTranslations("guests.import");
  const [draft, setDraft] = useState(row);
  const id = `import-edit-${row.line}`;
  return (
    <form
      aria-label={t("editTitle", { line: row.line })}
      className="space-y-4 rounded-xl border border-border p-4"
      onSubmit={(e) => (e.preventDefault(), onSave(draft))}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {TEXT_FIELDS.map((field) => (
          <div key={field} className="space-y-1">
            <Label htmlFor={`${id}-${field}`}>{t(`fields.${field}`)}</Label>
            {field === "child" ? (
              <YesNoSelect id={`${id}-${field}`} value={draft.child} onChange={(child) => setDraft({ ...draft, child })} />
            ) : (
              <Input id={`${id}-${field}`} value={draft[field]} onChange={(e) => setDraft({ ...draft, [field]: e.target.value })} />
            )}
          </div>
        ))}
        {events.map((event) => (
          <div key={event.id} className="space-y-1">
            <Label htmlFor={`${id}-event-${event.id}`}>{t("inviteLabel", { event: event.name })}</Label>
            <YesNoSelect id={`${id}-event-${event.id}`} value={draft.events[event.id] ?? ""} onChange={(value) => setDraft({ ...draft, events: { ...draft.events, [event.id]: value } })} />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {t("apply")}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}

/** A yes/no choice; a value from the file that is neither stays selectable, so the couple sees what was there. */
function YesNoSelect({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  const t = useTranslations("guests.import");
  const known = ["", t("yes"), t("no")];
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={selectClass}>
      {[...known, ...(known.includes(value) ? [] : [value])].map((v) => (
        <option key={v} value={v}>
          {v === "" ? t("unset") : v}
        </option>
      ))}
    </select>
  );
}

function PlanSection({ plan }: { plan: ImportPlan }) {
  const t = useTranslations("guests.import");
  const people = (list: { name: string }[]) => t("plan.people", { count: list.length, names: list.map((p) => p.name).join(", ") });
  const empty = plan.create.length + plan.join.length + plan.overwrite.length === 0;
  return (
    <section aria-labelledby="import-plan" className="space-y-3" data-testid="import-plan">
      <h3 id="import-plan" className="font-heading text-2xl font-medium">
        {t("plan.title")}
      </h3>
      {plan.warnings.length > 0 && (
        <ul className="space-y-1 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm" data-testid="import-warnings">
          {plan.warnings.map((w, i) => (
            <li key={i}>
              <WarningText warning={w} />
            </li>
          ))}
        </ul>
      )}
      {empty ? (
        <p className="text-sm text-muted-foreground">{t("plan.none")}</p>
      ) : (
        <ul className="space-y-2">
          {plan.create.map((h, i) => (
            <li key={`c${i}`} className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm" data-testid="import-new">
              <Badge variant="secondary">{t("plan.new")}</Badge>
              <span className="font-medium">{h.name}</span>
              <span className="text-muted-foreground">{people(h.people)}</span>
            </li>
          ))}
          {plan.join.map((h) => (
            <li key={h.householdId} className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm" data-testid="import-join">
              <Badge variant="outline">{t("plan.join")}</Badge>
              <span className="font-medium">{h.householdName}</span>
              <span className="text-muted-foreground">{people(h.people)}</span>
            </li>
          ))}
          {plan.overwrite.map((o) => (
            <li key={o.guestId} className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm" data-testid="import-overwrite">
              <Badge variant="outline">{t("plan.overwrite")}</Badge>
              <span className="font-medium">{t("plan.overwriteLine", { name: o.name })}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function WarningText({ warning: w }: { warning: ImportWarning }) {
  const t = useTranslations("guests.import");
  switch (w.code) {
    case "ignored_columns":
      return <>{t("warnings.ignored_columns", { columns: w.columns.join(", ") })}</>;
    case "conflicting_values":
      return <>{t("warnings.conflicting_values", { household: w.household, field: t(w.field === "events" ? "warnings.fieldEvents" : "warnings.fieldPersonalLine") })}</>;
    case "ambiguous_household":
      return <>{t("warnings.ambiguous_household", { household: w.household })}</>;
    case "unsubscribed_household":
      return <>{t("warnings.unsubscribed_household", { household: w.household })}</>;
  }
}
