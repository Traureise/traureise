"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, PencilLine, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteItemAction, moveItemAction, setEventShownAction, updateSectionAction } from "@/app/actions/editor";
import type { Item, Section } from "@/application/ports";
import { FieldError } from "@/components/forms/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { CollectionKind } from "@/domain/sections";
import { itemHeadline } from "./item-fields";
import { ItemForm } from "./item-form";
import { useSave } from "./use-save";

/**
 * One section of a website version. The schedule's events belong to the wedding: all versions share them and
 * each version only chooses which it shows (`hiddenEventIds`).
 */
export function SectionEditor({ websiteId, weddingId, section, items, hiddenEventIds = [] }: { websiteId: string; weddingId: string; section: Section; items: Item[]; hiddenEventIds?: string[] }) {
  const t = useTranslations("editor");
  const tTitles = useTranslations("sections.titles");
  const tErrors = useTranslations("errors");
  const { pending, errors, save } = useSave();
  const [visible, setVisible] = useState(section.visible);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [busy, start] = useTransition();
  const defaultTitle = tTitles(section.kind);

  function toggle(next: boolean) {
    setVisible(next);
    save(() => updateSectionAction(websiteId, section.kind, { visible: next }));
  }

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success?: string) {
    start(async () => {
      const result = await action();
      if (!result.ok) toast.error(tErrors(result.error ?? "unknown"));
      else if (success) toast.success(success);
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-4">
        <div>
          <Label htmlFor="section-visible">{t("section.visibility")}</Label>
          <p className="text-sm text-muted-foreground">{visible ? t("section.shown") : t("section.hidden")}</p>
        </div>
        <Switch id="section-visible" checked={visible} onCheckedChange={toggle} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          save(() =>
            updateSectionAction(websiteId, section.kind, {
              title: String(form.get("title") ?? ""),
              ...(section.kind === "our-story" ? { body: String(form.get("body") ?? "") } : {}),
            }),
          );
        }}
        className="space-y-4"
      >
        <div className="space-y-2">
          <Label htmlFor="section-title">{t("section.titleLabel")}</Label>
          <Input id="section-title" name="title" defaultValue={section.title ?? ""} placeholder={defaultTitle} aria-describedby="section-title-hint" />
          <p id="section-title-hint" className="text-xs text-muted-foreground">
            {t("section.titleHint", { default: defaultTitle })}
          </p>
          <FieldError code={errors.title} />
        </div>
        {section.kind === "our-story" && (
          <div className="space-y-2">
            <Label htmlFor="section-body">{t("section.storyLabel")}</Label>
            <Textarea id="section-body" name="body" rows={12} defaultValue={section.body} />
            <FieldError code={errors.body} />
          </div>
        )}
        <Button type="submit" variant={section.kind === "our-story" ? "default" : "secondary"} disabled={pending} className="w-full">
          {pending ? t("saving") : t("save")}
        </Button>
      </form>

      {section.kind === "schedule" && <p className="rounded-lg bg-secondary/40 p-3 text-sm text-muted-foreground">{t("section.sharedSchedule")}</p>}
      {section.kind !== "our-story" && (
        <div className="space-y-3">
          {items.length === 0 && editing !== "new" && <p className="text-sm text-muted-foreground">{t("section.empty")}</p>}
          <ol className="space-y-3" data-testid="item-list">
            {items.map((item, index) =>
              editing === item.id ? (
                <li key={item.id}>
                  <ItemForm websiteId={websiteId} weddingId={weddingId} kind={section.kind as CollectionKind} itemId={item.id} initial={item.data} onDone={() => setEditing(null)} />
                </li>
              ) : (
                <li key={item.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background p-3" data-testid="item">
                  <span className="min-w-0 flex-1 truncate font-medium">{itemHeadline(section.kind as CollectionKind, item.data)}</span>
                  {section.kind === "schedule" && (
                    <label className="flex basis-full items-center gap-2 text-sm text-muted-foreground sm:order-last">
                      <Switch
                        checked={!hiddenEventIds.includes(item.id)}
                        disabled={busy}
                        onCheckedChange={(shown) => run(() => setEventShownAction(websiteId, item.id, shown))}
                        aria-label={`${t("section.showOnVersion")}: ${itemHeadline("schedule", item.data)}`}
                      />
                      {t("section.showOnVersion")}
                    </label>
                  )}
                  <Button size="icon-sm" variant="ghost" aria-label={t("section.moveUp")} disabled={busy || index === 0} onClick={() => run(() => moveItemAction(websiteId, item.id, "up"))}>
                    <ArrowUp aria-hidden />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t("section.moveDown")}
                    disabled={busy || index === items.length - 1}
                    onClick={() => run(() => moveItemAction(websiteId, item.id, "down"))}
                  >
                    <ArrowDown aria-hidden />
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label={t("section.edit")} onClick={() => setEditing(item.id)}>
                    <PencilLine aria-hidden />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="text-destructive"
                    aria-label={t("section.delete")}
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm(t("section.deleteConfirm"))) run(() => deleteItemAction(websiteId, item.id), t("section.deleted"));
                    }}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </li>
              ),
            )}
          </ol>
          {editing === "new" ? (
            <ItemForm websiteId={websiteId} weddingId={weddingId} kind={section.kind as CollectionKind} itemId={null} initial={{}} onDone={() => setEditing(null)} />
          ) : (
            <Button variant="outline" className="w-full" onClick={() => setEditing("new")}>
              <Plus aria-hidden />
              {t("section.add")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
