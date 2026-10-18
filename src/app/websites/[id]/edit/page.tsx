import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { ChevronRight, House, Palette, Type } from "lucide-react";
import { Panel } from "@/components/editor/panel";
import { container } from "@/composition/container";
import { dateFromIso } from "@/lib/format";
import { loadEditorView } from "@/lib/editor";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: (await loadEditorView((await params).id)).website.title };
}

function NavRow({ href, icon, label, status, hidden }: { href: string; icon?: React.ReactNode; label: string; status?: string; hidden?: boolean }) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 transition-colors hover:border-primary/40 hover:bg-secondary/40"
      >
        {icon}
        <span className={cn("flex-1 font-medium", hidden && "text-muted-foreground")}>{label}</span>
        {status && <span className={cn("text-xs", hidden ? "text-muted-foreground" : "text-accent-foreground")}>{status}</span>}
        <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
      </Link>
    </li>
  );
}

export default async function EditorOverview({ params }: Props) {
  const { id } = await params;
  const { website, sections } = await loadEditorView(id);
  const t = await getTranslations("editor");
  const tTitles = await getTranslations("sections.titles");
  const format = await getFormatter();
  const base = `/websites/${id}/edit`;
  const publicUrl = `${container().appUrl}/${website.slug}`;

  return (
    <Panel backHref="/dashboard" backLabel={t("back")} title={website.title}>
      <div className="-mt-3 space-y-1 text-sm">
        <p className="text-muted-foreground">
          {website.weddingDate ? format.dateTime(dateFromIso(website.weddingDate), { dateStyle: "long", timeZone: "UTC" }) : t("home.dateOpen")}
        </p>
        <a href={publicUrl} target="_blank" className="break-all text-primary hover:underline">
          {publicUrl}
        </a>
      </div>
      <nav aria-label={t("nav.label")} className="space-y-6">
        <ul className="space-y-2">
          <NavRow href={`${base}/theme`} icon={<Palette className="size-4 text-muted-foreground" aria-hidden />} label={t("nav.theme")} />
          <NavRow href={`${base}/design`} icon={<Type className="size-4 text-muted-foreground" aria-hidden />} label={t("nav.design")} />
          <NavRow href={`${base}/home`} icon={<House className="size-4 text-muted-foreground" aria-hidden />} label={t("nav.home")} />
        </ul>
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">{t("nav.sections")}</h2>
          <ul className="space-y-2" data-testid="section-nav">
            {sections.map((s) => (
              <NavRow
                key={s.kind}
                href={`${base}/${s.kind}`}
                label={s.title ?? tTitles(s.kind)}
                status={s.visible ? t("nav.visible") : t("nav.hidden")}
                hidden={!s.visible}
              />
            ))}
          </ul>
        </div>
      </nav>
    </Panel>
  );
}
