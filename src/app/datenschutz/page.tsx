import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageShell } from "@/components/app/app-footer";
import { Logo } from "@/components/brand/logo";
import { LegalHeading, NotConfigured, OperatorAddress } from "@/components/legal/operator-block";
import { container } from "@/composition/container";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("legal.privacy"))("title") };
}

export default async function PrivacyPage() {
  const t = await getTranslations("legal.privacy");
  const { operator, privacyPolicy } = container();
  return (
    <PageShell width="max-w-2xl" header={<div className="mx-auto w-full max-w-2xl px-4 pt-8 sm:px-6"><Logo /></div>}>
      <h1 className="mb-4 font-heading text-4xl font-medium tracking-tight">{t("title")}</h1>
      <p className="text-muted-foreground">{t("intro")}</p>
      {privacyPolicy.map((section) => (
        <section key={section.id} data-testid={`privacy-${section.id}`} className="leading-relaxed">
          <LegalHeading>{t(`sections.${section.id}.title`)}</LegalHeading>
          <p>{t(`sections.${section.id}.body`, section.params)}</p>
          {section.id === "controller" &&
            (operator ? (
              <div className="mt-3">
                <OperatorAddress operator={operator} />
                <a href={`mailto:${operator.email}`} className="underline-offset-4 hover:underline">
                  {operator.email}
                </a>
              </div>
            ) : (
              <div className="mt-3">
                <NotConfigured />
              </div>
            ))}
        </section>
      ))}
    </PageShell>
  );
}
