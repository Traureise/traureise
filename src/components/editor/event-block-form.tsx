"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { saveEventAction } from "@/app/actions/schedule";
import type { WeddingEvent } from "@/application/ports";
import { FieldError } from "@/components/forms/field-error";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { EVENT_FIELDS, eventLine } from "./block-fields";
import { FieldForm } from "./field-form";
import { useSave } from "./use-save";

type Props = {
  weddingId: string;
  /** The wedding's Ablauf, chronological. */
  events: WeddingEvent[];
  /** null: "Alle Termine". */
  initialEventId: string | null;
  idPrefix: string;
  label: string;
  onSubmit: (data: { type: "event"; eventId: string | null }) => Promise<{ ok: true } | { ok: false; fieldErrors?: Record<string, string>; error?: string }>;
  onDone: () => void;
};

/**
 * An event block shows the whole Ablauf or one event of it, by reference. "+ Neuer Termin" adds an event to the
 * Ablauf and selects it; its form sits next to this one, never inside it (forms cannot nest).
 */
export function EventBlockForm({ weddingId, events, initialEventId, idPrefix, label, onSubmit, onDone }: Props) {
  const t = useTranslations("editor");
  const { pending, errors, save } = useSave();
  const [selected, setSelected] = useState(initialEventId ?? "");
  const [creating, setCreating] = useState(false);
  const id = `${idPrefix}-eventId`;

  if (creating) {
    return (
      <FieldForm
        weddingId={weddingId}
        fields={EVENT_FIELDS}
        initial={{}}
        idPrefix={`${idPrefix}-new-event`}
        label={t("blocks.newEvent")}
        onSubmit={async (data) => {
          const result = await saveEventAction(weddingId, null, data);
          if (result.ok) setSelected(result.data);
          return result;
        }}
        onDone={() => setCreating(false)}
      />
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save(() => onSubmit({ type: "event", eventId: selected || null }), onDone);
      }}
      className="space-y-4 rounded-xl border border-primary/30 bg-background p-4"
      aria-label={label}
    >
      <div className="space-y-2">
        <Label htmlFor={id}>{t("blocks.chooseEvent")}</Label>
        <select
          id={id}
          name="eventId"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          aria-describedby={`${id}-error`}
          className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
        >
          <option value="">{t("blocks.allEvents")}</option>
          {events.map((event) => (
            <option key={event.id} value={event.id}>
              {eventLine(event)}
            </option>
          ))}
        </select>
        <FieldError id={`${id}-error`} code={errors.eventId} />
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => setCreating(true)}>
        <Plus aria-hidden />
        {t("blocks.newEvent")}
      </Button>
      <p className="rounded-lg bg-secondary/40 p-3 text-sm text-muted-foreground">{t("blocks.eventShared")}</p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? t("saving") : t("save")}
        </Button>
      </div>
    </form>
  );
}
