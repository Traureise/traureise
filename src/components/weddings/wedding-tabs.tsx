"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type WeddingTab = { href: string; label: string; icon: React.ReactNode; testId: string; exact?: boolean };

/** A wedding's tabs: Vorbereitung, Hochzeit, Gästeliste, Ablauf. A tab stays current on its subpages. Icons from `sm`, so all four fit on a phone. */
export function WeddingTabs({ label, tabs }: { label: string; tabs: WeddingTab[] }) {
  const pathname = usePathname();
  const current = (tab: WeddingTab) => (tab.exact ? pathname === tab.href : pathname === tab.href || pathname.startsWith(`${tab.href}/`));
  return (
    <nav aria-label={label} className="-mx-1 flex gap-1 overflow-x-auto border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-testid="wedding-tabs">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={current(tab) ? "page" : undefined}
          data-testid={tab.testId}
          className={cn(
            "-mb-px flex items-center gap-2 border-b-2 px-2 py-3 text-sm whitespace-nowrap transition-colors sm:px-3 [&_svg]:hidden [&_svg]:size-4 sm:[&_svg]:block",
            current(tab) ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.icon}
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
