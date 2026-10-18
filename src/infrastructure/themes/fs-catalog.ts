import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { ThemeCatalog } from "@/application/ports";
import { parseThemeManifest, type ThemeManifest } from "@/domain/theme";

export const PREFERRED_DEFAULT_THEME = "salbei";

export type ThemeLoadResult = { themes: ThemeManifest[]; errors: { folder: string; error: string }[] };

/** Discovers themes/<id>/theme.json. Invalid packages are reported and skipped, never half-loaded. */
export function loadThemes(dir: string): ThemeLoadResult {
  const themes: ThemeManifest[] = [];
  const errors: ThemeLoadResult["errors"] = [];
  const folders = existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()) : [];
  for (const folder of folders.map((d) => d.name).sort()) {
    const manifestPath = path.join(dir, folder, "theme.json");
    try {
      const parsed = parseThemeManifest(JSON.parse(readFileSync(manifestPath, "utf8")), folder);
      if (!parsed.ok) throw new Error(JSON.stringify(parsed.fieldErrors));
      const assets = Object.values(parsed.value.assets).filter(Boolean) as string[];
      const missing = assets.filter((file) => !existsSync(path.join(dir, folder, file)));
      if (missing.length) throw new Error(`missing assets: ${missing.join(", ")}`);
      themes.push(parsed.value);
    } catch (error) {
      errors.push({ folder, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { themes, errors };
}

export class FsThemeCatalog implements ThemeCatalog {
  private themes: ThemeManifest[];

  constructor(readonly dir: string) {
    const { themes, errors } = loadThemes(dir);
    for (const e of errors) console.warn(`[themes] skipping "${e.folder}": ${e.error}`);
    if (themes.length === 0) throw new Error(`No valid themes found in ${dir}`);
    this.themes = themes;
  }

  list(): ThemeManifest[] {
    return this.themes;
  }

  get(id: string): ThemeManifest | undefined {
    return this.themes.find((t) => t.id === id);
  }

  defaultThemeId(): string {
    return this.get(PREFERRED_DEFAULT_THEME)?.id ?? this.themes[0]!.id;
  }

  /** Absolute path of a declared asset, or null (only files listed in the manifest are served). */
  assetPath(themeId: string, file: string): string | null {
    const theme = this.get(themeId);
    if (!theme || !Object.values(theme.assets).includes(file)) return null;
    return path.join(this.dir, themeId, file);
  }
}
