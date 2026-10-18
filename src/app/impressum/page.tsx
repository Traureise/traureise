import { LegalPageView, legalMetadata } from "@/components/legal/legal-page";

export const dynamic = "force-dynamic";

export const generateMetadata = () => legalMetadata("imprint");

export default function ImprintPage() {
  return <LegalPageView page="imprint" />;
}
