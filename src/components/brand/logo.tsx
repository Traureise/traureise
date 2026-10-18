import Link from "next/link";
import { getTranslations } from "next-intl/server";

/** Two linked rings that also read as a route between two points. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 28" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="2.4">
      <circle cx="14" cy="14" r="9.5" />
      <circle cx="26" cy="14" r="9.5" />
    </svg>
  );
}

export async function Logo({ href = "/" }: { href?: string }) {
  const t = await getTranslations("app");
  return (
    <Link href={href} className="inline-flex items-center gap-2 text-primary">
      <LogoMark className="h-6 w-auto" />
      <span className="font-heading text-xl font-semibold tracking-tight text-foreground">{t("name")}</span>
    </Link>
  );
}
