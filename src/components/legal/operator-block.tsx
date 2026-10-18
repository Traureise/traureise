import { getTranslations } from "next-intl/server";
import type { OperatorDetails } from "@/domain/operator";

export async function NotConfigured() {
  const t = await getTranslations("legal");
  return (
    <p role="status" className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm" data-testid="legal-not-configured">
      {t("notConfigured")}
    </p>
  );
}

/** Name and postal address of the operator, as an address block. */
export function OperatorAddress({ operator }: { operator: OperatorDetails }) {
  return (
    <address className="not-italic" data-testid="operator-address">
      {operator.businessName && <span className="block">{operator.businessName}</span>}
      <span className="block">{operator.name}</span>
      {operator.addressLines.map((line) => (
        <span key={line} className="block">
          {line}
        </span>
      ))}
    </address>
  );
}

export function LegalHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-10 mb-3 font-heading text-2xl font-medium">{children}</h2>;
}
