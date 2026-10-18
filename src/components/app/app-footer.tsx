import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { container } from "@/composition/container";

export async function AppFooter() {
  const t = await getTranslations("footer");
  const links = [
    { href: "/impressum", label: t("imprint") },
    { href: "/datenschutz", label: t("privacy") },
    ...(container().billingEnabled ? [{ href: "/preise", label: t("pricing") }] : []),
  ];
  return (
    <footer className="border-t border-border/70" data-testid="app-footer">
      <nav aria-label={t("label")} className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 text-sm text-muted-foreground sm:px-6">
        {links.map((link) => (
          <Link key={link.href} href={link.href} className="hover:text-foreground">
            {link.label}
          </Link>
        ))}
        <a href={container().sourceCodeUrl} className="hover:text-foreground sm:ml-auto">
          {t("license")}
        </a>
      </nav>
    </footer>
  );
}

/** Pages with a header, a main column and the footer pinned below. */
export function PageShell({ header, children, width = "max-w-5xl" }: { header?: React.ReactNode; children: React.ReactNode; width?: string }) {
  return (
    <div className="flex min-h-dvh flex-col">
      {header}
      <main className={`mx-auto w-full flex-1 px-4 py-10 sm:px-6 ${width}`}>{children}</main>
      <AppFooter />
    </div>
  );
}
