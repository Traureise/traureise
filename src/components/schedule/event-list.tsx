"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { PencilLine, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteEventAction, saveEventAction } from "@/app/actions/schedule";
import type { WeddingEvent } from "@/application/ports";
import { EVENT_FIELDS, eventLine } from "@/components/editor/block-fields";
import { FieldForm } from "@/components/editor/field-form";
import { Button } from "@/components/ui/button";

/** The Ablauf: the wedding's events, chronological; add, edit and delete. */
export function EventList({ weddingId, events }: { weddingId: string; events: WeddingEvent[] }) {
  const t = useTranslations("schedule");
  const tErrors = useTranslations("errors");
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

  return (
    <div className="space-y-3">
      {events.length === 0 && editing !== "new" && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
      <ol className="space-y-3" data-testid="event-list">
        {events.map((event) =>
          editing === event.id ? (
            <li key={event.id}>
              <FieldForm
                weddingId={weddingId}
                fields={EVENT_FIELDS}
                initial={event.data}
                idPrefix={event.id}
                label={t("editEvent")}
                onSubmit={(data) => saveEventAction(weddingId, event.id, data)}
                onDone={() => setEditing(null)}
              />
            </li>
          ) : (
            <li key={event.id} className="flex items-center gap-2 rounded-xl border border-border bg-background p-3" data-testid="event">
              <span className="min-w-0 flex-1 truncate font-medium" data-testid="event-headline">
                {eventLine(event)}
              </span>
              <Button size="icon-sm" variant="ghost" aria-label={`${t("edit")}: ${event.data.name}`} onClick={() => setEditing(event.id)}>
                <PencilLine aria-hidden />
              </Button>
              <Button size="icon-sm" variant="ghost" className="text-destructive" aria-label={`${t("delete")}: ${event.data.name}`} disabled={busy} onClick={() => remove(event)}>
                <Trash2 aria-hidden />
              </Button>
            </li>
          ),
        )}
      </ol>
      {editing === "new" ? (
        <FieldForm
          weddingId={weddingId}
          fields={EVENT_FIELDS}
          initial={{}}
          idPrefix="new-event"
          label={t("newEvent")}
          onSubmit={(data) => saveEventAction(weddingId, null, data)}
          onDone={() => setEditing(null)}
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
