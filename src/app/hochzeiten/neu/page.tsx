import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChevronLeft } from "lucide-react";
import { AppHeader } from "@/components/app/app-header";
import { PageShell } from "@/components/app/app-footer";
import { NewWeddingForm } from "@/components/weddings/new-wedding-form";
import { container } from "@/composition/container";
import { requireProfile } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("weddings.form"))("title") };
}

/** The first step after the first login, and "Neue Hochzeit" later. */
export default async function NewWeddingPage() {
  const user = await requireProfile();
  const t = await getTranslations("weddings");
  const recent = await container().getRecentWedding.execute(user.id);
  return (
    <PageShell header={<AppHeader email={user.email} />}>
      <div className="mx-auto max-w-lg space-y-8">
        {recent && (
          <Link href="/hochzeiten" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
            <ChevronLeft className="size-4" aria-hidden />
            {t("all")}
          </Link>
        )}
        <div className="space-y-3">
          <h1 className="font-heading text-5xl font-medium tracking-tight">{t("form.title")}</h1>
          <p className="text-muted-foreground">{t("form.lead")}</p>
        </div>
        <NewWeddingForm />
      </div>
    </PageShell>
  );
}
