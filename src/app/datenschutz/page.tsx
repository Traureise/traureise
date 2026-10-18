import { LegalPageView, legalMetadata } from "@/components/legal/legal-page";

export const dynamic = "force-dynamic";

export const generateMetadata = () => legalMetadata("privacy");

export default function PrivacyPage() {
  return <LegalPageView page="privacy" />;
}
