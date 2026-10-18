import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AppFooter } from "@/components/app/app-footer";
import { Logo } from "@/components/brand/logo";
import { requireUser } from "@/lib/session";
import { ProfileForm } from "./profile-form";

export default async function WelcomePage() {
  const user = await requireUser();
  if (user.firstName) redirect("/dashboard");
  const t = await getTranslations("auth");
  return (
    <div className="flex min-h-dvh flex-col">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-10 px-6 py-12">
      <Logo />
      <div className="space-y-3">
        <h1 className="font-heading text-4xl font-medium tracking-tight">{t("welcomeTitle")}</h1>
        <p className="text-muted-foreground">{t("welcomeLead")}</p>
      </div>
      <ProfileForm />
    </main>
      <AppFooter />
    </div>
  );
}
