import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Check } from "lucide-react";
import { startCheckoutAction } from "@/app/actions/billing";
import { AppHeader } from "@/components/app/app-header";
import { PageShell } from "@/components/app/app-footer";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { container } from "@/composition/container";
import type { PaidTier } from "@/domain/billing";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("pricing"))("title") };
}

export default async function PricingPage({ searchParams }: { searchParams: Promise<{ fehler?: string }> }) {
  const c = container();
  const rows = c.getPricing.execute();
  // Self-hosted instances have no prices at all.
  if (!rows) notFound();
  const { fehler } = await searchParams;
  const t = await getTranslations("pricing");
  const user = await getCurrentUser();
  const plans = user ? await c.listWeddingPlans.execute(user.id) : [];
  // Packages are bought by a wedding's admins: an editor-only account has weddings but nothing to buy for.
  const editorOnly = plans.length === 0 && !!user && (await c.listWeddings.execute(user.id)).length > 0;
  // The operator's terms apply to a purchase: said where people buy, not only in the footer.
  const terms = c.legalLinks.find((l) => l.page === "terms")?.href;
  const privacy = c.legalLinks.find((l) => l.page === "privacy")?.href;

  return (
    <PageShell header={user ? <AppHeader email={user.email} /> : <div className="mx-auto w-full max-w-5xl px-4 pt-8 sm:px-6"><Logo /></div>}>
      <div className="space-y-3">
        <h1 className="font-heading text-5xl font-medium tracking-tight">{t("title")}</h1>
        <p className="max-w-2xl text-lg text-muted-foreground">{t("lead")}</p>
      </div>
      {fehler && (
        <p role="alert" className="mt-6 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {t("checkoutFailed")}
        </p>
      )}

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map((row) => {
          const buyable = row.tier !== "website" ? plans.filter((p) => p.sellable.includes(row.tier as PaidTier)) : [];
          return (
            <article key={row.tier} data-testid={`tier-${row.tier}`} className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-6">
              <div>
                <h2 className="font-heading text-2xl font-medium">{t(`tiers.${row.tier}.name`)}</h2>
                <p className="mt-2 text-3xl font-semibold tracking-tight" data-testid="tier-price">
                  {row.priceCents === 0 ? t("free") : t("price", { price: row.priceCents / 100 })}
                </p>
                {row.priceCents > 0 && <p className="text-sm text-muted-foreground">{t("once")}</p>}
              </div>
              <ul className="flex-1 space-y-2 text-sm">
                {(t.raw(`tiers.${row.tier}.features`) as string[]).map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                    {feature}
                  </li>
                ))}
              </ul>
              {row.status === "included" && <p className="text-sm font-medium text-muted-foreground">{t("included")}</p>}
              {row.status === "comingSoon" && (
                <p className="text-sm font-medium text-muted-foreground" data-testid="coming-soon">
                  {t("comingSoon")}
                </p>
              )}
              {row.status === "available" &&
                (!user ? (
                  <Button asChild>
                    <Link href="/login">{t("loginToBuy")}</Link>
                  </Button>
                ) : plans.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{editorOnly ? t("onlyAdmins") : t("createWebsiteFirst")}</p>
                ) : buyable.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("owned")}</p>
                ) : (
                  <form action={startCheckoutAction} className="space-y-2">
                    <input type="hidden" name="tier" value={row.tier} />
                    <label className="block space-y-1 text-sm">
                      <span>{t("websiteLabel")}</span>
                      <select name="weddingId" className="block h-10 w-full rounded-md border border-input bg-background px-2">
                        {buyable.map((plan) => {
                          // What this wedding pays: an upgrade is reduced by what it already paid.
                          const price = plan.prices[row.tier as PaidTier] ?? { dueCents: row.priceCents, creditCents: 0 };
                          return (
                            <option key={plan.weddingId} value={plan.weddingId}>
                              {price.creditCents > 0
                                ? t("planOptionCredit", { title: plan.title, price: price.dueCents / 100, credit: price.creditCents / 100 })
                                : t("planOption", { title: plan.title, price: price.dueCents / 100 })}
                            </option>
                          );
                        })}
                      </select>
                    </label>
                    <Button type="submit" className="w-full">
                      {t("buy")}
                    </Button>
                  </form>
                ))}
            </article>
          );
        })}
      </div>
      <p className="mt-8 max-w-2xl text-sm text-muted-foreground">{t("note")}</p>
      {terms && (
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground" data-testid="pricing-terms">
          {t.rich("terms", {
            terms: (chunks) => (
              <a href={terms} className="text-primary underline underline-offset-2">
                {chunks}
              </a>
            ),
            privacy: (chunks) =>
              privacy ? (
                <a href={privacy} className="text-primary underline underline-offset-2">
                  {chunks}
                </a>
              ) : (
                chunks
              ),
          })}
        </p>
      )}
    </PageShell>
  );
}
