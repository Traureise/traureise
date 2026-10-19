import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * On every page of a wedding: the way back to the list of weddings and to the wedding's home.
 * `trail` are the pages in between (e.g. the guest list above its settings), `current` is this page.
 */
export async function WeddingNav({ wedding, trail = [], current, className }: { wedding: { id: string; title: string }; trail?: { href: string; label: string }[]; current?: string; className?: string }) {
  const t = await getTranslations();
  const links = [{ href: "/hochzeiten", label: t("auth.weddings") }, { href: `/hochzeiten/${wedding.id}`, label: wedding.title }, ...trail];
  return (
    <nav aria-label={t("weddings.breadcrumb")} className={cn("text-sm", className)} data-testid="wedding-nav">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-1">
        {links.map((link, i) => (
          <li key={link.href} className="flex min-w-0 items-center gap-1">
            {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
            <Link href={link.href} className="truncate text-primary underline-offset-4 hover:underline">
              {link.label}
            </Link>
          </li>
        ))}
        {current && (
          <li className="flex min-w-0 items-center gap-1">
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span aria-current="page" className="truncate text-muted-foreground">
              {current}
            </span>
          </li>
        )}
      </ol>
    </nav>
  );
}
