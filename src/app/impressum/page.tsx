import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageShell } from "@/components/app/app-footer";
import { Logo } from "@/components/brand/logo";
import { LegalHeading, NotConfigured, OperatorAddress } from "@/components/legal/operator-block";
import { container } from "@/composition/container";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("legal.imprint"))("title") };
}

export default async function ImprintPage() {
  const t = await getTranslations("legal.imprint");
  const operator = container().operator;
  return (
    <PageShell width="max-w-2xl" header={<div className="mx-auto w-full max-w-2xl px-4 pt-8 sm:px-6"><Logo /></div>}>
      <h1 className="mb-6 font-heading text-4xl font-medium tracking-tight">{t("title")}</h1>
      {!operator ? (
        <NotConfigured />
      ) : (
        <div className="leading-relaxed">
          <p className="mb-3 text-muted-foreground">{t("intro")}</p>
          <OperatorAddress operator={operator} />

          <LegalHeading>{t("contact")}</LegalHeading>
          <p>
            <a href={`mailto:${operator.email}`} className="underline-offset-4 hover:underline">
              {t("email", { email: operator.email })}
            </a>
          </p>
          {operator.phone && <p>{t("phone", { phone: operator.phone })}</p>}

          {(operator.vatId || operator.vatNote) && (
            <>
              <LegalHeading>{t("vat")}</LegalHeading>
              {operator.vatId && <p>{t("vatId", { vatId: operator.vatId })}</p>}
              {operator.vatNote && <p>{operator.vatNote}</p>}
            </>
          )}

          <LegalHeading>{t("contentResponsible")}</LegalHeading>
          <p>{operator.contentResponsible}</p>

          {operator.disputeResolution && (
            <>
              <LegalHeading>{t("disputeResolution")}</LegalHeading>
              <p>{operator.disputeResolution}</p>
            </>
          )}

          <LegalHeading>{t("userContent")}</LegalHeading>
          <p>{t("userContentBody")}</p>
        </div>
      )}
    </PageShell>
  );
}
