"use client";

import Link from "next/link";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/** What the list is about: the response link, or one of the cards (its sending status and buttons). */
export function CardPicker({ label, options }: { label: string; options: { key: string; label: string; href: string; current: boolean }[] }) {
  const current = options.find((o) => o.current) ?? options[0]!;
  return (
    <div className="flex items-center gap-2 text-sm" data-testid="card-picker">
      <span className="text-muted-foreground">{label}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" aria-label={`${label}: ${current.label}`}>
            {current.label}
            <ChevronDown aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          {options.map((o) => (
            <DropdownMenuItem key={o.key} asChild>
              <Link href={o.href} aria-current={o.current ? "page" : undefined}>
                <Check className={o.current ? "opacity-100" : "opacity-0"} aria-hidden />
                {o.label}
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** A row of links that filters the list; the current one is set off like a pressed key. */
export function Segmented({ label, items, testId }: { label: string; items: { key: string; label: string; count?: number; ariaLabel?: string; href: string; current: boolean }[]; testId?: string }) {
  return (
    <nav aria-label={label} data-testid={testId} className="max-w-full overflow-x-auto">
      <ul className="inline-flex rounded-full bg-muted p-1 text-sm">
        {items.map((i) => (
          <li key={i.key}>
            <Link
              href={i.href}
              aria-label={i.ariaLabel}
              aria-current={i.current ? "page" : undefined}
              className={
                i.current
                  ? "flex items-center gap-1.5 rounded-full bg-card px-3 py-1 font-medium whitespace-nowrap text-primary shadow-xs"
                  : "flex items-center gap-1.5 rounded-full px-3 py-1 whitespace-nowrap text-muted-foreground hover:text-foreground"
              }
            >
              {i.label}
              {i.count !== undefined && <span className="text-xs tabular-nums opacity-70">{i.count}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
