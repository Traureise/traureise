import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Download } from "lucide-react";
import { DeleteAccountForm } from "@/components/account/delete-account-form";
import { AppHeader } from "@/components/app/app-header";
import { PageShell } from "@/components/app/app-footer";
import { Button } from "@/components/ui/button";
import { container } from "@/composition/container";
import { requireProfile } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("account"))("title") };
}

function Panel({ title, children, testId, tone }: { title: string; children: React.ReactNode; testId: string; tone?: "danger" }) {
  return (
    <section
      data-testid={testId}
      className={`space-y-4 rounded-2xl border p-6 ${tone === "danger" ? "border-destructive/40 bg-destructive/[0.03]" : "border-border bg-card"}`}
    >
      <h2 className="font-heading text-2xl font-medium">{title}</h2>
      {children}
    </section>
  );
}

export default async function AccountPage() {
  const user = await requireProfile();
  const t = await getTranslations("account");
  const tPricing = await getTranslations("pricing.tiers");
  const format = await getFormatter();
  const c = container();
  const purchases = await c.listPurchases.execute(user.id);
  const date = (d: Date) => format.dateTime(d, { dateStyle: "long" });
  // validUntil is the exclusive end (midnight UTC after the last day), so show the last day itself.
  const lastDay = (d: Date) => format.dateTime(new Date(d.getTime() - 1), { dateStyle: "long", timeZone: "UTC" });

  return (
    <PageShell width="max-w-3xl" header={<AppHeader email={user.email} />}>
      <div className="space-y-8">
        <h1 className="font-heading text-5xl font-medium tracking-tight">{t("title")}</h1>

        <Panel title={t("profile")} testId="account-profile">
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="text-muted-foreground">{t("email")}</dt>
            <dd>{user.email}</dd>
            <dt className="text-muted-foreground">{t("firstName")}</dt>
            <dd>{user.firstName}</dd>
          </dl>
        </Panel>

        {c.billingEnabled && (
          <Panel title={t("purchases.title")} testId="account-purchases">
            {purchases.length === 0 ? (
              <p className="text-muted-foreground">{t("purchases.empty")}</p>
            ) : (
              <ul className="space-y-2">
                {purchases.map((p) => (
                  <li key={`${p.weddingId}-${p.tier}-${p.purchasedAt.toISOString()}`} className="text-sm" data-testid="purchase">
                    <span className="font-medium">{t("purchases.item", { tier: tPricing(`${p.tier}.name`), website: p.weddingTitle })}</span>
                    {" · "}
                    {t("purchases.purchasedAt", { date: date(p.purchasedAt) })}
                    {" · "}
                    {p.active ? t("purchases.validUntil", { date: lastDay(p.validUntil) }) : t("purchases.inactive")}
                  </li>
                ))}
              </ul>
            )}
            <Link href="/preise" className="text-sm text-primary underline-offset-4 hover:underline">
              {t("purchases.pricing")}
            </Link>
          </Panel>
        )}

        <Panel title={t("export.title")} testId="account-export">
          <p className="text-muted-foreground">{t("export.body")}</p>
          <Button asChild variant="secondary">
            <a href="/konto/export" download>
              <Download aria-hidden />
              {t("export.button")}
            </a>
          </Button>
        </Panel>

        <Panel title={t("delete.title")} testId="account-delete" tone="danger">
          <p className="text-muted-foreground">{t("delete.body")}</p>
          <DeleteAccountForm />
        </Panel>
      </div>
    </PageShell>
  );
}
