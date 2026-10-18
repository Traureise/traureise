import { readFile, stat } from "node:fs/promises";

export const LEGAL_PAGES = ["imprint", "privacy", "terms"] as const;
export type LegalPage = (typeof LEGAL_PAGES)[number];

/** A page of text, not a place to keep files: anything larger is a mistake in the setting. */
export const MAX_LEGAL_BYTES = 256 * 1024;

const SETTING: Record<LegalPage, string> = { imprint: "IMPRINT_FILE", privacy: "PRIVACY_FILE", terms: "TERMS_FILE" };

/**
 * The operator's own Impressum, privacy policy and terms: Markdown files named by IMPRINT_FILE, PRIVACY_FILE and
 * TERMS_FILE. Traureise ships none of the texts. Without a readable file the page does not exist and nothing links to it.
 * Files are read on every request, so an edited file shows at once.
 */
export class FileLegalPages {
  constructor(private files: Record<LegalPage, string | undefined>) {}

  private async usable(page: LegalPage): Promise<string | null> {
    const file = this.files[page];
    if (!file) return null;
    try {
      const info = await stat(/*turbopackIgnore: true*/ file);
      return info.isFile() && info.size <= MAX_LEGAL_BYTES ? file : null;
    } catch {
      return null;
    }
  }

  async read(page: LegalPage): Promise<string | null> {
    const file = await this.usable(page);
    if (!file) return null;
    try {
      return await readFile(/*turbopackIgnore: true*/ file, "utf8");
    } catch {
      return null; // removed or unreadable since the check
    }
  }

  async available(): Promise<LegalPage[]> {
    const found = await Promise.all(LEGAL_PAGES.map(async (page) => ((await this.usable(page)) ? page : null)));
    return found.filter((page): page is LegalPage => page !== null);
  }

  /** For the startup log: settings that are set but name nothing readable (the variable, never the path). */
  async unreadableSettings(): Promise<string[]> {
    const out: string[] = [];
    for (const page of LEGAL_PAGES) if (this.files[page] && !(await this.usable(page))) out.push(SETTING[page]);
    return out;
  }
}
