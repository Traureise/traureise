import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AppFooter } from "@/components/app/app-footer";
import { Logo } from "@/components/brand/logo";
import { getCurrentUser } from "@/lib/session";
import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("auth"))("loginTitle") };
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getCurrentUser()) redirect("/dashboard");
  const { error } = await searchParams;
  const t = await getTranslations("auth");
  return (
    <div className="flex min-h-dvh flex-col">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-10 px-6 py-12">
      <Logo />
      <div className="space-y-3">
        <h1 className="font-heading text-4xl font-medium tracking-tight">{t("loginTitle")}</h1>
        <p className="text-muted-foreground">{t("loginLead")}</p>
      </div>
      {error === "link" && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {t("linkInvalid")}
        </p>
      )}
      <LoginForm />
    </main>
      <AppFooter />
    </div>
  );
}
