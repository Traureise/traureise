"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, ChevronRight, Plus } from "lucide-react";
import { toast } from "sonner";
import { moveSectionAction } from "@/app/actions/editor";
import type { Section } from "@/application/ports";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AddSectionDialog } from "./add-section-dialog";

/** A version's sections in site order: open, move, add. */
export function SectionList({ websiteId, base, sections }: { websiteId: string; base: string; sections: Section[] }) {
  const t = useTranslations("editor");
  const tErrors = useTranslations("errors");
  const [busy, start] = useTransition();
  const [adding, setAdding] = useState(false);

  function move(sectionId: string, direction: "up" | "down") {
    start(async () => {
      const result = await moveSectionAction(websiteId, sectionId, direction);
      if (!result.ok) toast.error(tErrors(result.error ?? "unknown"));
    });
  }

  return (
    <div className="space-y-2">
      <ul className="space-y-2" data-testid="section-nav">
        {sections.map((s, index) => (
          <li key={s.id} className="flex items-center gap-1 rounded-xl border border-border bg-background pr-2 transition-colors hover:border-primary/40" data-testid="section-row">
            <Link href={`${base}/${s.id}`} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3">
              <span className={cn("flex-1 truncate font-medium", !s.visible && "text-muted-foreground")}>{s.title}</span>
              <span className={cn("text-xs", s.visible ? "text-accent-foreground" : "text-muted-foreground")}>{s.visible ? t("nav.visible") : t("nav.hidden")}</span>
              <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
            </Link>
            <Button size="icon-sm" variant="ghost" aria-label={`${t("section.moveUp")}: ${s.title}`} disabled={busy || index === 0} onClick={() => move(s.id, "up")}>
              <ArrowUp aria-hidden />
            </Button>
            <Button size="icon-sm" variant="ghost" aria-label={`${t("section.moveDown")}: ${s.title}`} disabled={busy || index === sections.length - 1} onClick={() => move(s.id, "down")}>
              <ArrowDown aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
      <Button variant="outline" className="w-full" onClick={() => setAdding(true)}>
        <Plus aria-hidden />
        {t("sections.add")}
      </Button>
      <AddSectionDialog websiteId={websiteId} base={base} open={adding} onOpenChange={setAdding} />
    </div>
  );
}
