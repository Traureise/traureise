"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronDown, Download, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/** PNG and PDF downloads; without the card's package it leads to the prices. */
export function ExportMenu({ exportUrl, active }: { exportUrl: string; active: boolean }) {
  const t = useTranslations("cardEditor");
  if (!active) {
    return (
      <Button asChild variant="outline" size="sm">
        <Link href="/preise">
          <Lock aria-hidden />
          {t("export")}
        </Link>
      </Button>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Download aria-hidden />
          {t("export")}
          <ChevronDown aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {(["a6", "a5", "png"] as const).map((format) => (
          <DropdownMenuItem key={format} asChild>
            <a href={`${exportUrl}?format=${format}`} download>
              {t(`formats.${format}`)}
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
