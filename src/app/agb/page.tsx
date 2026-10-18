import { LegalPageView, legalMetadata } from "@/components/legal/legal-page";

export const dynamic = "force-dynamic";

export const generateMetadata = () => legalMetadata("terms");

export default function TermsPage() {
  return <LegalPageView page="terms" />;
}
