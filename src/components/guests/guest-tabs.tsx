"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function GuestTabs({ label, tabs }: { label: string; tabs: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="-mx-1 flex gap-1 overflow-x-auto border-b border-border">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={pathname === tab.href ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 px-3 py-3 text-sm whitespace-nowrap transition-colors",
            pathname === tab.href ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
