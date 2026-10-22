"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronDown, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { saveHouseholdAction } from "@/app/actions/guests";
import { FieldError } from "@/components/forms/field-error";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { FieldErrors } from "@/domain/result";

type Person = { key: string; id: string | null; name: string; isChild: boolean; email: string };
export type HouseholdDraft = {
  id: string;
  name: string;
  invitedEventIds: string[] | null;
  personalLine: string;
  /** The household asked for no more emails (which cleared every address). */
  unsubscribed: boolean;
  people: { id: string; name: string; isChild: boolean; email: string | null }[];
};

let counter = 0;
const newPerson = (): Person => ({ key: `new-${++counter}`, id: null, name: "", isChild: false, email: "" });

/**
 * Adds a household, or edits one (`household` set): name, people, and the events it is invited to. Opened from
 * the name field's menu or a household's menu.
 */
export function HouseholdDialog({
  weddingId,
  events,
  household,
  open,
  onOpenChange,
  initialName = "",
  onSaved,
}: {
  weddingId: string;
  events: { id: string; name: string }[];
  household?: HouseholdDraft;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A new household's name, typed before the dialog opened. */
  initialName?: string;
  onSaved?: () => void;
}) {
  const t = useTranslations("guests.household");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const setOpen = onOpenChange;
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [name, setName] = useState(household?.name ?? initialName);
  const [people, setPeople] = useState<Person[]>(household ? household.people.map((p) => ({ ...p, email: p.email ?? "", key: p.id })) : [newPerson()]);
  const [invited, setInvited] = useState<string[]>(household?.invitedEventIds ?? events.map((e) => e.id));
  const [personalLine, setPersonalLine] = useState(household?.personalLine ?? "");
  const idPrefix = household ? `household-${household.id}` : "household-new";

  function reset() {
    setErrors({});
    if (!household) {
      setName("");
      setPersonalLine("");
      setPeople([newPerson()]);
      setInvited(events.map((e) => e.id));
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    start(async () => {
      const allInvited = events.every((e) => invited.includes(e.id));
      const result = await saveHouseholdAction(weddingId, household?.id ?? null, {
        name,
        invitedEventIds: allInvited ? null : invited,
        personalLine,
        people: people.map(({ id, name, isChild, email }) => ({ id, name, isChild, email })),
      });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        if (result.error) toast.error(tErrors(result.error));
        return;
      }
      toast.success(t("saved"));
      onSaved?.();
      setOpen(false);
      reset();
      router.refresh();
    });
  }

  const update = (key: string, patch: Partial<Person>) => setPeople((list) => list.map((p) => (p.key === key ? { ...p, ...patch } : p)));

  return (
    <Dialog open={open} onOpenChange={(next) => (setOpen(next), next || reset())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl font-medium">{household ? t("editTitle") : t("addTitle")}</DialogTitle>
          <DialogDescription>{t("lead")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5" aria-label={household ? t("editTitle") : t("addTitle")}>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-name`}>{t("name")}</Label>
            <Input id={`${idPrefix}-name`} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("namePlaceholder")} />
            <FieldError code={errors.name} />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t("people")}</legend>
            <ul className="space-y-2">
              {people.map((p, i) => (
                <li key={p.key} className="space-y-1" data-testid="household-person">
                  <div className="flex items-center gap-2">
                    <Input aria-label={t("personName", { n: i + 1 })} value={p.name} onChange={(e) => update(p.key, { name: e.target.value })} />
                    <label className="flex items-center gap-1.5 text-sm whitespace-nowrap">
                      <input type="checkbox" checked={p.isChild} onChange={(e) => update(p.key, { isChild: e.target.checked })} className="size-4 accent-primary" />
                      {t("child")}
                    </label>
                    <Button type="button" variant="ghost" size="icon" aria-label={t("removePerson", { n: i + 1 })} onClick={() => setPeople((list) => list.filter((x) => x.key !== p.key))}>
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                  <Input type="email" aria-label={t("personEmail", { n: i + 1 })} placeholder={t("personEmailPlaceholder")} value={p.email} onChange={(e) => update(p.key, { email: e.target.value })} />
                  <FieldError code={errors[`people.${i}.email`]} />
                </li>
              ))}
            </ul>
            <Button type="button" variant="outline" size="sm" onClick={() => setPeople((list) => [...list, newPerson()])}>
              <Plus aria-hidden />
              {t("addPerson")}
            </Button>
            <FieldError code={errors.people} />
            <p className="text-xs text-muted-foreground">{household?.unsubscribed ? t("emailUnsubscribed") : t("emailHint")}</p>
          </fieldset>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-personal-line`}>{t("personalLine")}</Label>
            <Input id={`${idPrefix}-personal-line`} value={personalLine} onChange={(e) => setPersonalLine(e.target.value)} placeholder={t("personalLinePlaceholder")} />
            <FieldError code={errors.personalLine} />
          </div>
          {events.length > 0 && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{t("invitedTo")}</legend>
              {events.map((e) => (
                <label key={e.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={invited.includes(e.id)}
                    onChange={(ev) => setInvited((list) => (ev.target.checked ? [...list, e.id] : list.filter((id) => id !== e.id)))}
                  />
                  {e.name}
                </label>
              ))}
            </fieldset>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The quick way for one person: a household named after them, with only them in it. */
/**
 * Adding guests from one field: Enter (or "Person hinzufügen") adds a household of one with that name; the
 * menu opens the household form with the name filled in, for families and couples.
 */
export function AddGuests({ weddingId, events }: { weddingId: string; events: { id: string; name: string }[] }) {
  const t = useTranslations("guests.household");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const [household, setHousehold] = useState(false);

  function addPerson() {
    if (!name.trim()) return;
    start(async () => {
      const result = await saveHouseholdAction(weddingId, null, { name, people: [{ name, isChild: false }] });
      if (!result.ok) {
        setError(result.fieldErrors?.name ?? result.fieldErrors?.["people.0.name"] ?? result.error ?? "unknown");
        return;
      }
      toast.success(t("quickAdded", { name: name.trim() }));
      setName("");
      setError(undefined);
      router.refresh();
    });
  }

  // The dialog sits outside the form: React events bubble through portals, so its submit would add a person too.
  return (
    <>
      <form onSubmit={(e) => (e.preventDefault(), addPerson())} className="flex min-w-0 flex-1 flex-wrap items-start gap-2" aria-label={t("addGuests")}>
        <div className="min-w-0 flex-1 space-y-1">
          <Label htmlFor="add-guests-name" className="sr-only">
            {t("quickLabel")}
          </Label>
          <Input id="add-guests-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("quickPlaceholder")} className="h-9 min-w-48" autoComplete="off" />
          {error && <p className="text-sm text-destructive">{tErrors(error)}</p>}
        </div>
        <div className="flex">
          <Button type="submit" disabled={pending || !name.trim()} className="rounded-r-none">
            <Plus aria-hidden />
            {t("quickAdd")}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" className="rounded-l-none border-l border-primary-foreground/25 px-2" aria-label={t("moreAdd")}>
                <ChevronDown aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuItem onSelect={() => setHousehold(true)} className="items-start">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
                  <Users aria-hidden />
                </span>
                <span className="space-y-0.5">
                  <span className="block font-medium">{t("addHousehold")}</span>
                  <span className="block text-xs text-muted-foreground">{t("addHouseholdHint")}</span>
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </form>
      {household && <HouseholdDialog weddingId={weddingId} events={events} initialName={name.trim()} open={household} onOpenChange={setHousehold} onSaved={() => setName("")} />}
    </>
  );
}
