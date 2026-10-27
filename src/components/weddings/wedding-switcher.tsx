"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronDown, List, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Role } from "@/domain/members";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/** At the top of a wedding's home: the account's other weddings (shared ones marked "Editor"), "Neue Hochzeit" and the list of all. */
export function WeddingSwitcher({ current, role, others }: { current: string; role: Role; others: { id: string; title: string; role: Role }[] }) {
  const t = useTranslations("weddings");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" aria-label={t("switcher")} className="max-w-full">
          <span className="truncate">{current}</span>
          {role === "editor" && <Badge variant="secondary">{t("members.roles.editor")}</Badge>}
          <ChevronDown aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {others.map((w) => (
          <DropdownMenuItem key={w.id} asChild>
            <Link href={`/hochzeiten/${w.id}`}>
              <span className="truncate">{w.title}</span>
              {w.role === "editor" && (
                <Badge variant="secondary" className="ml-auto">
                  {t("members.roles.editor")}
                </Badge>
              )}
            </Link>
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
