"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, PencilLine, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteBlockAction, deleteSectionAction, moveBlockAction, saveBlockAction, updateSectionAction } from "@/app/actions/editor";
import type { Block, Section, WeddingEvent } from "@/application/ports";
import { FieldError } from "@/components/forms/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { BLOCK_TYPES, type BlockType } from "@/domain/sections";
import { BLOCK_FIELDS, blockHeadline } from "./block-fields";
import { EventBlockForm } from "./event-block-form";
import { FieldForm } from "./field-form";
import { useSave } from "./use-save";

type Props = {
  websiteId: string;
  weddingId: string;
  section: Section;
  /** This section's blocks, in order. */
  blocks: Block[];
  /** The wedding's Ablauf, for event blocks. */
  events: WeddingEvent[];
};

/** One section of a website version: its title, visibility and blocks. */
export function SectionEditor({ websiteId, weddingId, section, blocks, events }: Props) {
  const t = useTranslations("editor");
  const tErrors = useTranslations("errors");
  const { pending, errors, save } = useSave();
  const [visible, setVisible] = useState(section.visible);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState<BlockType | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [busy, start] = useTransition();

  function toggle(next: boolean) {
    setVisible(next);
    save(() => updateSectionAction(websiteId, section.id, { visible: next }));
  }

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success?: string) {
    start(async () => {
      const result = await action();
      if (!result.ok) toast.error(tErrors(result.error ?? "unknown"));
      else if (success) toast.success(success);
    });
  }

  function blockForm(type: BlockType, block: Block | null) {
    const label = block ? t("blocks.editBlock") : t("blocks.newBlock");
    const idPrefix = block?.id ?? "new";
    const done = () => (block ? setEditing(null) : setAdding(null));
    if (type === "event") {
      return (
        <EventBlockForm
          weddingId={weddingId}
          events={events}
          initialEventId={block?.data.type === "event" ? block.data.eventId : null}
          idPrefix={idPrefix}
          label={label}
          onSubmit={(data) => saveBlockAction(websiteId, section.id, block?.id ?? null, data)}
          onDone={done}
        />
      );
    }
    return (
      <FieldForm
        weddingId={weddingId}
        fields={BLOCK_FIELDS[type]}
        initial={block?.data ?? {}}
        idPrefix={idPrefix}
        label={label}
        onSubmit={(data) => saveBlockAction(websiteId, section.id, block?.id ?? null, { ...data, type })}
        onDone={done}
      />
    );
  }

  const suggested = blocks.length === 0 && section.suggestedType;

  return (
    <div className="space-y-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save(() => updateSectionAction(websiteId, section.id, { title: String(new FormData(e.currentTarget).get("title") ?? "") }));
        }}
        className="space-y-2"
      >
        <Label htmlFor="section-title">{t("section.titleLabel")}</Label>
        <div className="flex gap-2">
          <Input id="section-title" name="title" defaultValue={section.title} aria-describedby="section-title-error" />
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? t("saving") : t("save")}
          </Button>
        </div>
        <FieldError id="section-title-error" code={errors.title} />
      </form>

      <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-4">
        <div>
          <Label htmlFor="section-visible">{t("section.visibility")}</Label>
          <p className="text-sm text-muted-foreground">{visible ? t("section.shown") : t("section.hidden")}</p>
        </div>
        <Switch id="section-visible" checked={visible} onCheckedChange={toggle} />
      </div>

      <div className="space-y-3">
        {blocks.length === 0 && !adding && <p className="text-sm text-muted-foreground">{t("section.empty")}</p>}
        <ol className="space-y-3" data-testid="block-list">
          {blocks.map((block, index) =>
            editing === block.id ? (
              <li key={block.id}>{blockForm(block.data.type, block)}</li>
            ) : (
              <li key={block.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background p-3" data-testid="block">
                <span className="text-[0.65rem] font-semibold tracking-widest text-muted-foreground uppercase">{t(`blocks.types.${block.data.type}`)}</span>
                <span className="min-w-0 flex-1 truncate font-medium" data-testid="block-headline">
                  {block.data.type === "event" && block.data.eventId === null ? t("blocks.allEvents") : blockHeadline(block.data, events)}
                </span>
                <Button size="icon-sm" variant="ghost" aria-label={t("section.moveUp")} disabled={busy || index === 0} onClick={() => run(() => moveBlockAction(websiteId, block.id, "up"))}>
                  <ArrowUp aria-hidden />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t("section.moveDown")}
                  disabled={busy || index === blocks.length - 1}
                  onClick={() => run(() => moveBlockAction(websiteId, block.id, "down"))}
                >
                  <ArrowDown aria-hidden />
                </Button>
                <Button size="icon-sm" variant="ghost" aria-label={t("section.edit")} onClick={() => setEditing(block.id)}>
                  <PencilLine aria-hidden />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="text-destructive"
                  aria-label={t("section.delete")}
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(t("section.deleteConfirm"))) run(() => deleteBlockAction(websiteId, block.id), t("section.deleted"));
                  }}
                >
                  <Trash2 aria-hidden />
                </Button>
              </li>
            ),
          )}
        </ol>

        {adding ? (
          blockForm(adding, null)
        ) : (
          <div className="space-y-3">
            {suggested && (
              <Button className="w-full" onClick={() => setAdding(suggested)}>
                <Plus aria-hidden />
                {t("blocks.addSuggested", { type: t(`blocks.types.${suggested}`) })}
              </Button>
            )}
            {choosing ? (
              <div className="flex flex-wrap gap-2" role="group" aria-label={t("blocks.addBlock")}>
                {BLOCK_TYPES.map((type) => (
                  <Button
                    key={type}
                    size="sm"
                    variant="outline"
                    className="rounded-full"
                    onClick={() => {
                      setChoosing(false);
                      setAdding(type);
                    }}
                  >
                    {t(`blocks.types.${type}`)}
                  </Button>
                ))}
              </div>
            ) : (
              <Button variant="outline" className="w-full" onClick={() => setChoosing(true)}>
                <Plus aria-hidden />
                {t("blocks.addBlock")}
              </Button>
            )}
          </div>
        )}
      </div>

      <Button
        variant="ghost"
        className="w-full text-destructive"
        disabled={busy}
        onClick={() => {
          if (window.confirm(t("sections.deleteConfirm"))) run(() => deleteSectionAction(weddingId, websiteId, section.id));
        }}
      >
        <Trash2 aria-hidden />
        {t("sections.delete")}
      </Button>
    </div>
  );
}
