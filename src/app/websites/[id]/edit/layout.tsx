import { getTranslations } from "next-intl/server";
import { ExternalLink } from "lucide-react";
import { WeddingSite } from "@/components/site/wedding-site";
import { loadEditorView } from "@/lib/editor";

export default async function EditorLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const view = await loadEditorView(id);
  const t = await getTranslations("editor");
  return (
    <div className="grid min-h-dvh lg:h-dvh lg:grid-cols-[420px_1fr]">
      <aside className="border-border bg-card lg:overflow-y-auto lg:border-r">{children}</aside>
      <section aria-label={t("preview")} className="flex min-h-[70vh] flex-col bg-muted lg:min-h-0">
        <div className="flex items-center justify-between gap-3 border-b border-border bg-background px-4 py-2 text-sm">
          <span className="text-muted-foreground">{t("preview")}</span>
          <a href={`/${view.website.slug}`} target="_blank" className="inline-flex items-center gap-1.5 text-primary hover:underline">
            {t("openPublic")}
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </div>
        <div className="relative flex-1 overflow-y-auto">
          <WeddingSite view={view} now={new Date()} mode="preview" />
        </div>
      </section>
    </div>
  );
}
