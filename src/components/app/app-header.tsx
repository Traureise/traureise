import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { CircleUser, LogOut } from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export async function AppHeader({ email }: { email: string }) {
  const t = await getTranslations("auth");
  return (
    <header className="border-b border-border/70 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo href="/dashboard" />
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden text-muted-foreground sm:inline">{email}</span>
          <Button asChild variant="ghost" size="sm">
            <Link href="/konto">
              <CircleUser aria-hidden />
              {t("account")}
            </Link>
          </Button>
          <form action={logoutAction}>
            <Button type="submit" variant="ghost" size="sm">
              <LogOut aria-hidden />
              {t("logout")}
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
