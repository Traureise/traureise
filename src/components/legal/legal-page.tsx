import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageShell } from "@/components/app/app-footer";
import { Logo } from "@/components/brand/logo";
import { container } from "@/composition/container";
import type { LegalPage } from "@/infrastructure/legal/files";
import { renderLegalMarkdown } from "@/infrastructure/legal/markdown";

export async function legalMetadata(page: LegalPage): Promise<Metadata> {
  return { title: (await getTranslations("legal"))(page) };
}

/** One of the operator's Markdown files, or 404 when this instance has none. */
export async function LegalPageView({ page }: { page: LegalPage }) {
  const markdown = await container().legalPages.read(page);
  if (markdown === null) notFound();
  return (
    <PageShell width="max-w-2xl" header={<div className="mx-auto w-full max-w-2xl px-4 pt-8 sm:px-6"><Logo /></div>}>
      {/* Rendered with raw HTML escaped and only safe links kept (renderLegalMarkdown). */}
      <article className="legal-content" data-testid="legal-content" dangerouslySetInnerHTML={{ __html: renderLegalMarkdown(markdown) }} />
    </PageShell>
  );
}
