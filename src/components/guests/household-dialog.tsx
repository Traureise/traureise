"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { saveHouseholdAction } from "@/app/actions/guests";
import { FieldError } from "@/components/forms/field-error";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FieldErrors } from "@/domain/result";

type Person = { key: string; id: string | null; name: string; isChild: boolean };
export type HouseholdDraft = {
  id: string;
  name: string;
  invitedEventIds: string[] | null;
  email: string | null;
  personalLine: string;
  /** The household asked for no more emails (which cleared the address). */
  unsubscribed: boolean;
  people: { id: string; name: string; isChild: boolean }[];
};

let counter = 0;
const newPerson = (): Person => ({ key: `new-${++counter}`, id: null, name: "", isChild: false });

/** Adds a household, or edits one (`household` set): name, people, and the events it is invited to. */
export function HouseholdDialog({ websiteId, events, household }: { websiteId: string; events: { id: string; name: string }[]; household?: HouseholdDraft }) {
  const t = useTranslations("guests.household");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [name, setName] = useState(household?.name ?? "");
  const [people, setPeople] = useState<Person[]>(household ? household.people.map((p) => ({ ...p, key: p.id })) : [newPerson()]);
  const [invited, setInvited] = useState<string[]>(household?.invitedEventIds ?? events.map((e) => e.id));
  const [email, setEmail] = useState(household?.email ?? "");
  const [personalLine, setPersonalLine] = useState(household?.personalLine ?? "");
  const idPrefix = household ? `household-${household.id}` : "household-new";

  function reset() {
    setErrors({});
    if (!household) {
      setName("");
      setEmail("");
      setPersonalLine("");
      setPeople([newPerson()]);
      setInvited(events.map((e) => e.id));
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    start(async () => {
      const allInvited = events.every((e) => invited.includes(e.id));
      const result = await saveHouseholdAction(websiteId, household?.id ?? null, {
        name,
        invitedEventIds: allInvited ? null : invited,
        email,
        personalLine,
        people: people.map(({ id, name, isChild }) => ({ id, name, isChild })),
      });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        if (result.error) toast.error(tErrors(result.error));
        return;
      }
      toast.success(t("saved"));
      setOpen(false);
      reset();
      router.refresh();
    });
  }

  const update = (key: string, patch: Partial<Person>) => setPeople((list) => list.map((p) => (p.key === key ? { ...p, ...patch } : p)));

  return (
    <Dialog open={open} onOpenChange={(next) => (setOpen(next), next || reset())}>
      <DialogTrigger asChild>
        {household ? (
          <Button type="button" variant="ghost" size="sm">
            {t("edit")}
          </Button>
        ) : (
          <Button type="button">
            <Plus aria-hidden />
            {t("add")}
          </Button>
        )}
      </DialogTrigger>
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
                <li key={p.key} className="flex items-center gap-2" data-testid="household-person">
                  <Input aria-label={t("personName", { n: i + 1 })} value={p.name} onChange={(e) => update(p.key, { name: e.target.value })} />
                  <label className="flex items-center gap-1.5 text-sm whitespace-nowrap">
                    <input type="checkbox" checked={p.isChild} onChange={(e) => update(p.key, { isChild: e.target.checked })} className="size-4 accent-primary" />
                    {t("child")}
                  </label>
                  <Button type="button" variant="ghost" size="icon" aria-label={t("removePerson", { n: i + 1 })} onClick={() => setPeople((list) => list.filter((x) => x.key !== p.key))}>
                    <Trash2 aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
            <Button type="button" variant="outline" size="sm" onClick={() => setPeople((list) => [...list, newPerson()])}>
              <Plus aria-hidden />
              {t("addPerson")}
            </Button>
            <FieldError code={errors.people} />
          </fieldset>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-email`}>{t("email")}</Label>
            <Input id={`${idPrefix}-email`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-describedby={`${idPrefix}-email-hint`} />
            <p id={`${idPrefix}-email-hint`} className="text-xs text-muted-foreground">
              {household?.unsubscribed ? t("emailUnsubscribed") : t("emailHint")}
            </p>
            <FieldError code={errors.email} />
          </div>
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
