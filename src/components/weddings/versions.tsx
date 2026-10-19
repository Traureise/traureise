"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, ChevronDown, Layers, Lock, PencilLine, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { addVersionAction, deleteVersionAction, renameVersionAction } from "@/app/actions/weddings";
import { FieldError } from "@/components/forms/field-error";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FieldErrors } from "@/domain/result";
import { LABEL_MAX, type VersionItem } from "@/domain/weddings";
import { versionHref } from "@/lib/routes";
import { cn } from "@/lib/utils";

type Version = { id: string; label: string };

/**
 * An item's versions as chips ("Familie", "Freunde"), then "+ Version". `current` marks the version being
 * edited. Without the package for extra versions, "+ Version" leads to the prices.
 */
export function VersionChips({
  weddingId,
  item,
  versions,
  current,
  canAdd,
}: {
  weddingId: string;
  item: VersionItem;
  versions: Version[];
  current?: string;
  canAdd: boolean;
}) {
  const t = useTranslations("weddings.versions");
  return (
    <ul className="flex flex-wrap items-center gap-1.5" aria-label={t("label")} data-testid="version-chips">
      {versions.map((v) => (
        <li key={v.id}>
          <Link
            href={versionHref(weddingId, item, v.id)}
            aria-current={v.id === current ? "page" : undefined}
            className={cn(
              "inline-block max-w-48 truncate rounded-full border px-2.5 py-0.5 text-xs",
              v.id === current ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-primary hover:border-primary/40",
            )}
          >
            {v.label}
          </Link>
        </li>
      ))}
      <li>
        {canAdd ? (
          <AddVersionButton weddingId={weddingId} item={item} versions={versions} />
        ) : (
          <Link href="/preise" className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-0.5 text-xs text-muted-foreground" title={t("locked")} data-testid="add-version-locked">
            <Lock className="size-3" aria-hidden />
            {t("add")}
          </Link>
        )}
      </li>
    </ul>
  );
}

/** "+ Version" as a chip that opens the dialog. */
function AddVersionButton({ weddingId, item, versions }: { weddingId: string; item: VersionItem; versions: Version[] }) {
  const t = useTranslations("weddings.versions");
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-0.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary">
        {t("add")}
      </button>
      <AddVersionDialog weddingId={weddingId} item={item} versions={versions} open={open} onOpenChange={setOpen} />
    </>
  );
}

/** A name and which version to copy; then opens the new version. */
function AddVersionDialog({ weddingId, item, versions, open, onOpenChange }: { weddingId: string; item: VersionItem; versions: Version[]; open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations("weddings.versions");
  const tItems = useTranslations("weddings.items");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [copyFrom, setCopyFrom] = useState(versions[0]?.id ?? "");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, start] = useTransition();
  const lead = item === "engagement" ? t("addLeadEngagement") : item === "website" ? t("addLeadWebsite") : t("addLead");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    start(async () => {
      const result = await addVersionAction(weddingId, item, { label, copyFrom: copyFrom || null });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        if (result.error) toast.error(tErrors(result.error));
        return;
      }
      toast.success(t("created"));
      onOpenChange(false);
      router.push(versionHref(weddingId, item, result.data.id));
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl font-medium">{t("addTitle", { item: tItems(item) })}</DialogTitle>
          <DialogDescription>{lead}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="min-w-0 space-y-5" aria-label={t("addTitle", { item: tItems(item) })}>
          <div className="space-y-2">
            <Label htmlFor={`version-${item}-label`}>{t("name")}</Label>
            <Input id={`version-${item}-label`} value={label} maxLength={LABEL_MAX} placeholder={t("namePlaceholder")} onChange={(e) => setLabel(e.target.value)} />
            <FieldError code={errors.label} />
          </div>
          {versions.length > 1 && (
            <div className="space-y-2">
              <Label htmlFor={`version-${item}-copy`}>{t("copyFrom")}</Label>
              <select id={`version-${item}-copy`} value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm">
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * In an editor: one button naming the version being edited. Its menu switches versions, adds one (or leads to
 * the prices without the package), renames this one and deletes it (never the last one).
 */
export function VersionMenu({
  weddingId,
  item,
  versions,
  current,
  canAdd,
}: {
  weddingId: string;
  item: VersionItem;
  versions: Version[];
  current: Version;
  canAdd: boolean;
}) {
  const t = useTranslations("weddings.versions");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const [dialog, setDialog] = useState<"add" | "rename" | "delete" | null>(null);
  const [label, setLabel] = useState(current.label);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, start] = useTransition();
  const onOpenChange = (open: boolean) => !open && setDialog(null);

  function rename(event: React.FormEvent) {
    event.preventDefault();
    start(async () => {
      const result = await renameVersionAction(weddingId, item, current.id, label);
      if (!result.ok) return setErrors(result.fieldErrors ?? {});
      toast.success(t("renamed"));
      setDialog(null);
      router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="max-w-full" aria-label={t("menu", { label: current.label })} data-testid="version-menu">
            <Layers aria-hidden />
            <span className="truncate">{current.label}</span>
            <ChevronDown aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-56">
          <DropdownMenuLabel className="text-xs text-muted-foreground">{t("label")}</DropdownMenuLabel>
          {versions.map((v) => (
            <DropdownMenuItem key={v.id} asChild>
              <Link href={versionHref(weddingId, item, v.id)} aria-current={v.id === current.id ? "page" : undefined}>
                <Check className={cn(v.id === current.id ? "opacity-100" : "opacity-0")} aria-hidden />
                <span className="truncate">{v.label}</span>
              </Link>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          {canAdd ? (
            <DropdownMenuItem onSelect={() => setDialog("add")}>
              <Plus aria-hidden />
              {t("addItem")}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem asChild>
              <Link href="/preise" title={t("locked")} data-testid="add-version-locked">
                <Lock aria-hidden />
                {t("addItem")}
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => setDialog("rename")}>
            <PencilLine aria-hidden />
            {t("rename")}
          </DropdownMenuItem>
          {versions.length > 1 && (
            <DropdownMenuItem variant="destructive" onSelect={() => setDialog("delete")}>
              <Trash2 aria-hidden />
              {t("delete")}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <AddVersionDialog weddingId={weddingId} item={item} versions={versions} open={dialog === "add"} onOpenChange={onOpenChange} />
      <Dialog open={dialog === "rename"} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-2xl font-medium">{t("renameTitle")}</DialogTitle>
            <DialogDescription className="sr-only">{current.label}</DialogDescription>
          </DialogHeader>
          <form onSubmit={rename} className="min-w-0 space-y-5" aria-label={t("renameTitle")}>
            <div className="space-y-2">
              <Label htmlFor={`rename-${current.id}`}>{t("name")}</Label>
              <Input id={`rename-${current.id}`} value={label} maxLength={LABEL_MAX} onChange={(e) => setLabel(e.target.value)} />
              <FieldError code={errors.label} />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setDialog(null)}>
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={pending}>
                {t("save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={dialog === "delete"} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle", { label: current.label })}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const result = await deleteVersionAction(weddingId, item, current.id);
                  if (!result.ok) return void toast.error(tErrors(result.error ?? Object.values(result.fieldErrors ?? {})[0] ?? "unknown"));
                  toast.success(t("deleted"));
                  router.push(`/hochzeiten/${weddingId}`);
                })
              }
            >
              {t("deleteConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
