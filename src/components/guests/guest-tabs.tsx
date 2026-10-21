"use client";

import { usePathname } from "next/navigation";
import { Segmented } from "./card-picker";

/** The guest list's own pages (Übersicht, Einstellungen, Vorschau), quieter than the wedding's tabs above them. */
export function GuestTabs({ label, tabs }: { label: string; tabs: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return <Segmented label={label} testId="guest-tabs" items={tabs.map((tab) => ({ key: tab.href, label: tab.label, href: tab.href, current: pathname === tab.href }))} />;
}
