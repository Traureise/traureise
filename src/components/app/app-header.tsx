import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { CircleUser, Heart, LogOut } from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export async function AppHeader({ email }: { email: string }) {
  const t = await getTranslations("auth");
  return (
    <header className="border-b border-border/70 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-2 px-4 sm:px-6">
        <Logo href="/dashboard" />
        {/* On phones the account and logout buttons show only their icons, so the row fits. */}
        <div className="flex min-w-0 items-center gap-0.5 text-sm sm:gap-3">
          <span className="hidden text-muted-foreground md:inline">{email}</span>
          <Button asChild variant="ghost" size="sm">
            <Link href="/hochzeiten">
              <Heart aria-hidden />
              {t("weddings")}
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/konto" aria-label={t("account")}>
              <CircleUser aria-hidden />
              <span className="hidden sm:inline">{t("account")}</span>
            </Link>
          </Button>
          <form action={logoutAction}>
            <Button type="submit" variant="ghost" size="sm" aria-label={t("logout")}>
              <LogOut aria-hidden />
              <span className="hidden sm:inline">{t("logout")}</span>
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
