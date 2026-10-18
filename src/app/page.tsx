import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/session";

export default async function HomePage() {
  const t = await getTranslations("landing");
  const user = await getCurrentUser();
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-10 px-6 py-16">
      <Logo />
      <h1 className="font-heading text-5xl leading-[1.05] font-medium tracking-tight sm:text-7xl">{t("title")}</h1>
      <p className="max-w-xl text-lg text-muted-foreground">{t("lead")}</p>
      <div>
        <Button asChild size="lg">
          <Link href={user ? "/dashboard" : "/login"}>{user ? t("dashboard") : t("cta")}</Link>
        </Button>
      </div>
    </main>
  );
}
