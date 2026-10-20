import { createTranslator } from "next-intl";
import type { SiteTexts } from "@/application/ports";
import { SECTION_TEMPLATES, type SectionTemplate } from "@/domain/sections";
import messages from "../../messages/de.json";

/** Section titles written into new websites and sections (they are the couple's to change afterwards). */
export function createSiteTexts(locale = "de"): SiteTexts {
  const t = createTranslator({ locale, messages, namespace: "sections" });
  return {
    sectionTitles: Object.fromEntries(SECTION_TEMPLATES.map((k) => [k, t(`titles.${k}`)])) as Record<SectionTemplate, string>,
    newSectionTitle: t("newTitle"),
  };
}
