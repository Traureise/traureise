import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { ChevronRight, House, Palette, Type, Users } from "lucide-react";
import { Panel } from "@/components/editor/panel";
import { PublishControl } from "@/components/editor/publish-control";
import { VersionActions, VersionChips } from "@/components/weddings/versions";
import { dateFromIso } from "@/lib/format";
import { loadEditorView } from "@/lib/editor";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ id: string; websiteId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, websiteId } = await params;
  return { title: (await loadEditorView(id, websiteId)).website.title };
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
  const { id, websiteId } = await params;
  const view = await loadEditorView(id, websiteId);
  const { website, sections } = view;
  const t = await getTranslations("editor");
  const tTitles = await getTranslations("sections.titles");
  const tVersions = await getTranslations("weddings.versions");
  const format = await getFormatter();
  const base = `/hochzeiten/${id}/website/${websiteId}`;

  return (
    <Panel backHref={`/hochzeiten/${id}`} backLabel={t("back")} title={website.title}>
      <div className="-mt-3 space-y-1 text-sm">
        <p className="text-muted-foreground">
          {website.weddingDate ? format.dateTime(dateFromIso(website.weddingDate), { dateStyle: "long", timeZone: "UTC" }) : t("dateOpen")}
        </p>
        <p className="break-all text-muted-foreground">{view.publicUrl}</p>
      </div>
      <PublishControl websiteId={websiteId} published={website.published} online={view.online} />
      <div className="space-y-2" data-testid="versions">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">{tVersions("label")}</p>
          <VersionActions weddingId={id} item="website" version={{ id: websiteId, label: website.label }} deletable={view.versions.length > 1} />
        </div>
        <VersionChips weddingId={id} item="website" versions={view.versions} current={websiteId} canAdd={view.canAddVersion} />
      </div>
      <nav aria-label={t("nav.label")} className="space-y-6">
        <ul className="space-y-2">
          <NavRow href={`${base}/theme`} icon={<Palette className="size-4 text-muted-foreground" aria-hidden />} label={t("nav.theme")} />
          <NavRow href={`${base}/design`} icon={<Type className="size-4 text-muted-foreground" aria-hidden />} label={t("nav.design")} />
          <NavRow href={`${base}/home`} icon={<House className="size-4 text-muted-foreground" aria-hidden />} label={t("nav.home")} />
        </ul>
        <ul className="space-y-2">
          <NavRow href={`/hochzeiten/${id}/gaeste`} icon={<Users className="size-4 text-muted-foreground" aria-hidden />} label={t("nav.guests")} status={t("nav.guestsHint")} />
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
