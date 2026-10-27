import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Download, Package, Trash2, UserRound } from "lucide-react";
import { DeleteAccountForm } from "@/components/account/delete-account-form";
import { AppHeader } from "@/components/app/app-header";
import { SettingsSection } from "@/components/app/settings-section";
import { PageShell } from "@/components/app/app-footer";
import { Button } from "@/components/ui/button";
import { container } from "@/composition/container";
import { requireProfile } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("account"))("title") };
}

export default async function AccountPage() {
  const user = await requireProfile();
  const t = await getTranslations("account");
  const tPricing = await getTranslations("pricing.tiers");
  const format = await getFormatter();
  const c = container();
  const purchases = await c.listPurchases.execute(user.id);
  // Weddings shared with others where the user is the last admin: the account can't go until someone else is admin.
  const blocking = await c.weddingsBlockingDeletion.execute(user.id);
  const date = (d: Date) => format.dateTime(d, { dateStyle: "long" });
  // validUntil is the exclusive end (midnight UTC after the last day), so show the last day itself.
  const lastDay = (d: Date) => format.dateTime(new Date(d.getTime() - 1), { dateStyle: "long", timeZone: "UTC" });

  return (
    <PageShell width="max-w-4xl" header={<AppHeader email={user.email} />}>
      <div className="space-y-8">
        <h1 className="font-heading text-5xl font-medium tracking-tight">{t("title")}</h1>
        <div className="rounded-3xl border border-border bg-card px-6 sm:px-10">
          <SettingsSection icon={<UserRound />} title={t("profile")} description={t("profileLead")} testId="account-profile">
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
              <dt className="text-muted-foreground">{t("email")}</dt>
              <dd className="break-all">{user.email}</dd>
              <dt className="text-muted-foreground">{t("firstName")}</dt>
              <dd>{user.firstName}</dd>
            </dl>
          </SettingsSection>

          {c.billingEnabled && (
            <SettingsSection icon={<Package />} title={t("purchases.title")} description={t("purchases.lead")} testId="account-purchases">
              {purchases.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("purchases.empty")}</p>
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {purchases.map((p) => (
                    <li key={`${p.weddingId}-${p.tier}-${p.purchasedAt.toISOString()}`} className="space-y-0.5 py-2 first:pt-0" data-testid="purchase">
                      <p className="font-medium">{t("purchases.item", { tier: tPricing(`${p.tier}.name`), website: p.weddingTitle })}</p>
                      <p className="text-muted-foreground">{t("purchases.purchasedAt", { date: date(p.purchasedAt) })}</p>
                      {p.purchasedBy && <p className="text-muted-foreground">{t("purchases.purchasedBy", { name: p.purchasedBy.name })}</p>}
                      <p className="text-muted-foreground">{p.active ? t("purchases.validUntil", { date: lastDay(p.validUntil) }) : t("purchases.inactive")}</p>
                    </li>
                  ))}
                </ul>
              )}
              <Link href="/preise" className="inline-block text-sm text-primary underline-offset-4 hover:underline">
                {t("purchases.pricing")}
              </Link>
            </SettingsSection>
          )}

          <SettingsSection icon={<Download />} title={t("export.title")} description={t("export.lead")} testId="account-export">
            <p className="text-sm">{t("export.body")}</p>
            <Button asChild variant="secondary">
              <a href="/konto/export" download>
                <Download aria-hidden />
                {t("export.button")}
              </a>
            </Button>
          </SettingsSection>

          <SettingsSection icon={<Trash2 />} title={t("delete.title")} description={t("delete.lead")} testId="account-delete" tone="danger">
            <div className="space-y-4 rounded-2xl border border-destructive/30 bg-destructive/[0.03] p-5">
              <p className="text-sm">{t("delete.body")}</p>
              {blocking.length > 0 ? (
                <div className="space-y-2 text-sm" data-testid="account-delete-blocked">
                  <p className="font-medium">{t("delete.blocked")}</p>
                  <ul className="list-disc space-y-1 pl-5">
                    {blocking.map((w) => (
                      <li key={w.id}>
                        <Link href={`/hochzeiten/${w.id}/hochzeit#wedding-members`} className="text-primary underline-offset-4 hover:underline">
                          {w.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <DeleteAccountForm />
              )}
            </div>
          </SettingsSection>
        </div>
      </div>
    </PageShell>
  );
}
