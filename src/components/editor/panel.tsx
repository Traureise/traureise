import Link from "next/link";
import { ChevronLeft } from "lucide-react";

/** Left-panel frame: back link, heading, content. */
export function Panel({ backHref, backLabel, title, children }: { backHref: string; backLabel: string; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-6 p-6">
      <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
        <ChevronLeft className="size-4" aria-hidden />
        {backLabel}
      </Link>
      <h1 className="font-heading text-3xl font-medium tracking-tight">{title}</h1>
      {children}
    </div>
  );
}
