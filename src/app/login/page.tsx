import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { logoutAction } from "@/app/actions/auth";
import { AppFooter } from "@/components/app/app-footer";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/session";
import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("auth"))("loginTitle") };
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const messages: Record<string, string> = { link: "linkInvalid", einladung: "invitationInvalid", "einladung-konto": "invitationOtherAccount" };
  const message = error && Object.hasOwn(messages, error) ? messages[error] : undefined;
  // An invitation for another address arrives logged in: show why it failed and offer to log out instead.
  const loggedIn = Boolean(await getCurrentUser());
  if (loggedIn && error !== "einladung-konto") redirect("/dashboard");
  const t = await getTranslations("auth");
  return (
    <div className="flex min-h-dvh flex-col">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-10 px-6 py-12">
      <Logo />
      <div className="space-y-3">
        <h1 className="font-heading text-4xl font-medium tracking-tight">{t("loginTitle")}</h1>
        <p className="text-muted-foreground">{t("loginLead")}</p>
      </div>
      {message && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {t(message)}
        </p>
      )}
      {loggedIn ? (
        <form action={logoutAction}>
          <Button type="submit">{t("logout")}</Button>
        </form>
      ) : (
        <LoginForm />
      )}
    </main>
      <AppFooter />
    </div>
  );
}
