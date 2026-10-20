"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { assignVersionAction } from "@/app/actions/weddings";
import type { AssignableItem } from "@/domain/weddings";

/** Which version of each item a household gets; only items with more than one version are offered. */
export function VersionSelects({
  weddingId,
  household,
  choices,
}: {
  weddingId: string;
  household: { id: string; name: string; versions: Record<AssignableItem, string | null> };
  choices: { item: AssignableItem; versions: { id: string; label: string }[] }[];
}) {
  const t = useTranslations("guests.versions");
  const tItems = useTranslations("weddings.items");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const [pending, start] = useTransition();
  if (choices.length === 0) return null;
  return (
    <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm" data-testid="household-versions" disabled={pending}>
      <legend className="sr-only">{t("label")}</legend>
      {choices.map(({ item, versions }) => (
        <label key={item} className="flex items-center gap-2">
          <span className="text-muted-foreground">{t("choose", { item: tItems(item) })}</span>
          <select
            value={household.versions[item] ?? versions[0]!.id}
            onChange={(e) =>
              start(async () => {
                const result = await assignVersionAction(weddingId, household.id, item, e.target.value);
                if (result.ok) toast.success(t("saved", { household: household.name }));
                else toast.error(tErrors(result.error ?? "unknown"));
                router.refresh();
              })
            }
            className="h-8 rounded-lg border border-input bg-card px-2"
          >
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
      ))}
    </fieldset>
  );
}
