import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { itemsOf } from "@/application/views";
import { DesignPicker } from "@/components/editor/design-picker";
import { HomeForm } from "@/components/editor/home-form";
import { Panel } from "@/components/editor/panel";
import { SectionEditor } from "@/components/editor/section-editor";
import { ThemePicker } from "@/components/editor/theme-picker";
import { WeddingDetailsButton } from "@/components/weddings/wedding-details-dialog";
import { container } from "@/composition/container";
import { FONT_PAIRINGS } from "@/domain/fonts";
import { isCollectionKind, isSectionKind } from "@/domain/sections";
import { localize } from "@/domain/theme";
import { themeAssetUrl } from "@/lib/format";
import { loadEditorView } from "@/lib/editor";

export default async function EditorSectionPage({ params }: { params: Promise<{ id: string; websiteId: string; section: string }> }) {
  const { id: weddingId, websiteId: id, section } = await params;
  const view = await loadEditorView(weddingId, id);
  const t = await getTranslations("editor");
  const tTitles = await getTranslations("sections.titles");
  const locale = await getLocale();
  const c = container();
  const back = { backHref: `/hochzeiten/${weddingId}/website/${id}`, backLabel: t("backToOverview") };

  if (section === "home") {
    return (
      <Panel {...back} title={t("home.title")}>
        <HomeForm
          website={view.website}
          appUrl={c.appUrl}
          details={<WeddingDetailsButton wedding={view.wedding} appUrl={c.appUrl} timeZones={Intl.supportedValuesOf("timeZone")} variant="link" />}
        />
      </Panel>
    );
  }

  if (section === "theme") {
    const themes = c.themes.list().map((theme) => ({
      id: theme.id,
      name: localize(theme.name, locale),
      category: localize(theme.category, locale),
      preview: themeAssetUrl(theme.id, theme.assets.preview),
    }));
    return (
      <Panel {...back} title={t("theme.title")}>
        <ThemePicker websiteId={id} current={view.website.themeId} themes={themes} />
      </Panel>
    );
  }

  if (section === "design") {
    const { theme, palette, fonts } = view.design;
    return (
      <Panel {...back} title={t("design.title")}>
        <DesignPicker
          websiteId={id}
          palettes={theme.palettes.map((p) => ({ id: p.id, name: localize(p.name, locale), colors: [p.colors.background, p.colors.primary, p.colors.accent, p.colors.text] }))}
          fonts={FONT_PAIRINGS}
          paletteId={palette.id}
          fontPairingId={fonts.id}
          defaultFontPairingId={theme.fonts.defaultPairing}
        />
      </Panel>
    );
  }

  if (!isSectionKind(section)) notFound();
  const current = view.sections.find((s) => s.kind === section)!;
  return (
    <Panel {...back} title={current.title ?? tTitles(section)}>
      <SectionEditor
        websiteId={id}
        weddingId={weddingId}
        section={current}
        // The schedule lists every event of the wedding; this version shows those not hidden.
        items={section === "schedule" ? view.events : isCollectionKind(section) ? itemsOf(view, section) : []}
        hiddenEventIds={view.website.hiddenEventIds}
      />
    </Panel>
  );
}
