"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronDown, List, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/** At the top of a wedding's home: the account's other weddings, "Neue Hochzeit" and the list of all. */
export function WeddingSwitcher({ current, others }: { current: string; others: { id: string; title: string }[] }) {
  const t = useTranslations("weddings");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" aria-label={t("switcher")} className="max-w-full">
          <span className="truncate">{current}</span>
          <ChevronDown aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {others.map((w) => (
          <DropdownMenuItem key={w.id} asChild>
            <Link href={`/hochzeiten/${w.id}`}>{w.title}</Link>
          </DropdownMenuItem>
        ))}
        {others.length > 0 && <DropdownMenuSeparator />}
        <DropdownMenuItem asChild>
          <Link href="/hochzeiten/neu">
            <Plus aria-hidden />
            {t("new")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/hochzeiten">
            <List aria-hidden />
            {t("all")}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
