import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LEGAL_HREFS } from "@/components/app/app-footer";
import { siteStyle } from "@/components/site/site-style";
import { container } from "@/composition/container";
import type { ResolvedDesign } from "@/domain/theme";

/** The guest form's frame: the website's theme and the same discreet legal footer as the wedding website. */
export async function GuestSite({ design, children }: { design: ResolvedDesign; children: React.ReactNode }) {
  const t = await getTranslations("site");
  const legal = await container().legalPages.available();
  return (
    <div className="site flex min-h-dvh flex-col" style={siteStyle(design)} data-theme={design.theme.id} data-testid="guest-site">
      <main className="flex-1">{children}</main>
      <footer className="site-muted flex flex-wrap justify-center gap-x-4 gap-y-1 px-6 py-12 text-center text-xs" data-testid="site-footer">
        <span>{t("madeWith")}</span>
        {legal.map((page) => (
          <Link key={page} href={LEGAL_HREFS[page]} className="underline-offset-4 hover:underline">
            {t(page)}
          </Link>
        ))}
      </footer>
    </div>
  );
}
