import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { CalendarClock, ChevronRight, House, Palette, Type, Users } from "lucide-react";
import { Panel } from "@/components/editor/panel";
import { PublishControl } from "@/components/editor/publish-control";
import { SectionList } from "@/components/editor/section-list";
import { VersionMenu } from "@/components/weddings/versions";
import { dateFromIso } from "@/lib/format";
import { loadEditorView } from "@/lib/editor";

type Props = { params: Promise<{ id: string; websiteId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, websiteId } = await params;
  return { title: (await loadEditorView(id, websiteId)).website.title };
}

function NavRow({ href, icon, label, status }: { href: string; icon?: React.ReactNode; label: string; status?: string }) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 transition-colors hover:border-primary/40 hover:bg-secondary/40"
      >
        {icon}
        <span className="flex-1 font-medium">{label}</span>
        {status && <span className="text-xs text-accent-foreground">{status}</span>}
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
      <div data-testid="versions">
        <VersionMenu weddingId={id} item="website" versions={view.versions} current={{ id: websiteId, label: website.label }} canAdd={view.canAddVersion} />
      </div>
      <PublishControl websiteId={websiteId} published={website.published} online={view.online} />
      <nav aria-label={t("nav.label")} className="space-y-6">
        <ul className="space-y-2">
          <NavRow href={`${base}/theme`} icon={<Palette className="size-4 text-muted-foreground" aria-hidden />} label={t("nav.theme")} />
          <NavRow href={`${base}/design`} icon={<Type className="size-4 text-muted-foreground" aria-hidden />} label={t("nav.design")} />
          <NavRow href={`${base}/home`} icon={<House className="size-4 text-muted-foreground" aria-hidden />} label={t("nav.home")} />
        </ul>
        <ul className="space-y-2">
          <NavRow href={`/hochzeiten/${id}/ablauf`} icon={<CalendarClock className="size-4 text-muted-foreground" aria-hidden />} label={t("nav.schedule")} status={t("nav.scheduleHint")} />
          <NavRow href={`/hochzeiten/${id}/gaeste`} icon={<Users className="size-4 text-muted-foreground" aria-hidden />} label={t("nav.guests")} status={t("nav.guestsHint")} />
        </ul>
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">{t("nav.sections")}</h2>
          <SectionList websiteId={websiteId} base={base} sections={sections.map(({ id, position, title, visible, suggestedType }) => ({ id, position, title, visible, suggestedType }))} />
        </div>
      </nav>
    </Panel>
  );
}
