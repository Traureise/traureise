"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { PencilLine, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteEventAction, saveEventAction } from "@/app/actions/schedule";
import type { WeddingEvent } from "@/application/ports";
import { EVENT_FIELDS } from "@/components/editor/block-fields";
import { FieldForm } from "@/components/editor/field-form";
import type { Coordinates } from "@/components/editor/location-picker";
import { Button } from "@/components/ui/button";

/** The Ablauf: the wedding's events, chronological; add, edit and delete. */
export function EventList({ weddingId, events, near }: { weddingId: string; events: WeddingEvent[]; near: Coordinates | null }) {
  const t = useTranslations("schedule");
  const tErrors = useTranslations("errors");
  const tTypes = useTranslations("sections.eventTypes");
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [busy, start] = useTransition();

  function remove(event: WeddingEvent) {
    if (!window.confirm(t("deleteConfirm"))) return;
    start(async () => {
      const result = await deleteEventAction(weddingId, event.id);
      if (!result.ok) toast.error(tErrors(result.error ?? "unknown"));
      else toast.success(t("deleted"));
    });
  }

  const days = groupByDay(events);

  return (
    <div className="space-y-8">
      {events.length === 0 && editing !== "new" && <p className="rounded-2xl border border-dashed border-border px-6 py-10 text-muted-foreground">{t("empty")}</p>}
      <div className="space-y-8" data-testid="event-list">
        {days.map(({ day, events: dayEvents }) => (
          <section key={day} aria-labelledby={`day-${day}`} className="space-y-3">
            <h2 id={`day-${day}`} className="font-heading text-xl font-medium">
              {format(new Date(`${day}T12:00:00`), "EEEE, d. MMMM yyyy", { locale: de })}
            </h2>
            <ol className="relative space-y-1 border-l border-border pl-6">
              {dayEvents.map((event) =>
                editing === event.id ? (
                  <li key={event.id} className="py-2">
                    <FieldForm
                      weddingId={weddingId}
                      fields={EVENT_FIELDS}
                      initial={event.data}
                      idPrefix={event.id}
                      label={t("editEvent")}
                      onSubmit={(data) => saveEventAction(weddingId, event.id, data)}
                      onDone={() => setEditing(null)}
                      near={near}
                    />
                  </li>
                ) : (
                  <li key={event.id} className="group relative grid grid-cols-[4.5rem_1fr_auto] items-start gap-x-4 rounded-xl py-3 pr-2 hover:bg-card" data-testid="event">
                    <span className="absolute top-[1.35rem] -left-[1.8rem] size-2.5 rounded-full border-2 border-background bg-primary" aria-hidden />
                    <span className="font-heading text-2xl leading-none font-medium tabular-nums">{event.data.startTime}</span>
                    <div className="min-w-0 space-y-0.5">
                      <p className="font-medium" data-testid="event-headline">
                        {event.data.name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {[tTypes(event.data.eventType) !== event.data.name && tTypes(event.data.eventType), event.data.endTime && t("until", { time: event.data.endTime }), event.data.venueName].filter(Boolean).join(", ")}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon-sm" variant="ghost" aria-label={`${t("edit")}: ${event.data.name}`} onClick={() => setEditing(event.id)}>
                        <PencilLine aria-hidden />
                      </Button>
                      <Button size="icon-sm" variant="ghost" className="text-destructive" aria-label={`${t("delete")}: ${event.data.name}`} disabled={busy} onClick={() => remove(event)}>
                        <Trash2 aria-hidden />
                      </Button>
                    </div>
                  </li>
                ),
              )}
            </ol>
          </section>
        ))}
      </div>
      {editing === "new" ? (
        <FieldForm
          weddingId={weddingId}
          fields={EVENT_FIELDS}
          initial={{}}
          idPrefix="new-event"
          label={t("newEvent")}
          onSubmit={(data) => saveEventAction(weddingId, null, data)}
          onDone={() => setEditing(null)}
          near={near}
        />
      ) : (
        <Button variant="outline" className="w-full" onClick={() => setEditing("new")}>
          <Plus aria-hidden />
          {t("add")}
        </Button>
      )}
    </div>
  );
}

/** Events by their start day, keeping the chronological order. */
function groupByDay(events: WeddingEvent[]) {
  const days: { day: string; events: WeddingEvent[] }[] = [];
  for (const event of events) {
    const last = days.at(-1);
    if (last && last.day === event.data.startDate) last.events.push(event);
    else days.push({ day: event.data.startDate, events: [event] });
  }
  return days;
}
