import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AppFooter } from "@/components/app/app-footer";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/session";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ konto?: string }> }) {
  const { konto } = await searchParams;
  const t = await getTranslations("landing");
  const user = await getCurrentUser();
  return (
    <div className="flex min-h-dvh flex-col">
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-10 px-6 py-16">
      <Logo />
        {konto === "geloescht" && (
          <p role="status" className="rounded-lg border border-border bg-secondary p-3 text-sm">
            {t("accountDeleted")}
          </p>
        )}
      <h1 className="font-heading text-5xl leading-[1.05] font-medium tracking-tight sm:text-7xl">{t("title")}</h1>
      <p className="max-w-xl text-lg text-muted-foreground">{t("lead")}</p>
      <div>
        <Button asChild size="lg">
          <Link href={user ? "/dashboard" : "/login"}>{user ? t("dashboard") : t("cta")}</Link>
        </Button>
      </div>
    </main>
      <AppFooter />
    </div>
  );
}
