import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import satori, { type Font } from "satori";
import sharp from "sharp";
import type { CardRenderer, PaperFormat } from "@/application/ports";
import { CARD_HEIGHT_EM, CARD_WIDTH_EM, CardView } from "@/components/cards/card-view";
import type { CardModel } from "@/domain/cards";

/**
 * The weights src/app/site-fonts.css loads in the browser, per family. The exporter loads exactly these, so a
 * card picks the same face on the page and in the PDF (tests/unit/infrastructure/card-fonts.test.ts checks it).
 */
export const CARD_FONT_WEIGHTS: Record<string, readonly number[]> = {
  "Cormorant Garamond": [500, 600],
  "Source Sans 3": [400, 600],
  "Great Vibes": [400],
  Lora: [400, 600],
  "Josefin Sans": [400, 600],
  "Work Sans": [400, 600],
  "Playfair Display": [500],
  "Nunito Sans": [400, 700],
  Parisienne: [400],
  Raleway: [400, 600],
  "DM Serif Display": [400],
  "DM Sans": [400, 600],
};

/** Font files as fontsource ships them: latin plus latin-ext (names like Łukasz or Dvořák), WOFF since satori cannot read WOFF2. */
export function fontFiles(family: string): { file: string; weight: number; subset: "latin" | "latin-ext" }[] {
  const pkg = family.toLowerCase().replace(/\s+/g, "-");
  return (CARD_FONT_WEIGHTS[family] ?? []).flatMap((weight) =>
    (["latin", "latin-ext"] as const).map((subset) => ({ file: path.join(pkg, "files", `${pkg}-${subset}-${weight}-normal.woff`), weight, subset })),
  );
}

const PAPER_MM: Record<PaperFormat, { width: number; height: number }> = { a6: { width: 105, height: 148 }, a5: { width: 148, height: 210 } };
const PRINT_DPI = 300;
const POINTS_PER_MM = 72 / 25.4;
const PHOTO_EDGE = 2000;

/**
 * Draws CardView with satori (SVG, text as paths, no network: fonts are files, images data URIs), rasterises
 * it with sharp and wraps it in a PDF with pdf-lib. Everything runs in the app process.
 */
export class SatoriCardRenderer implements CardRenderer {
  private fonts = new Map<string, Promise<Font[]>>();

  constructor(private fontsDir: string) {}

  private loadFamily(family: string): Promise<Font[]> {
    let fonts = this.fonts.get(family);
    if (!fonts) {
      fonts = Promise.all(
        // latin-ext under its own name: satori falls back to it only for glyphs the latin file lacks.
        fontFiles(family).map(async ({ file, weight, subset }) => ({
          name: subset === "latin" ? family : `${family} Ext`,
          data: await readFile(path.join(this.fontsDir, file)),
          weight: weight as Font["weight"],
          style: "normal" as const,
        })),
      );
      fonts.catch(() => this.fonts.delete(family));
      this.fonts.set(family, fonts);
    }
    return fonts;
  }

  private async svg(model: CardModel, photo: Uint8Array | null, width: number): Promise<string> {
    const photoSrc = photo && model.photoSrc ? await jpegDataUri(photo) : null;
    const fonts = (await Promise.all([model.fonts.heading.family, model.fonts.body.family].map((f) => this.loadFamily(f)))).flat();
    const height = Math.round((width * CARD_HEIGHT_EM) / CARD_WIDTH_EM);
    return satori(<CardView model={{ ...model, photoSrc }} fontSize={width / CARD_WIDTH_EM} />, { width, height, fonts });
  }

  async png(model: CardModel, photo: Uint8Array | null, width: number): Promise<Uint8Array> {
    // Laid out at 600px and scaled up as vectors, so line breaks are the same at every size.
    const svg = await this.svg(model, photo, 600);
    return new Uint8Array(await sharp(Buffer.from(svg), { density: (72 * width) / 600 }).png().toBuffer());
  }

  async pdf(model: CardModel, photo: Uint8Array | null, format: PaperFormat): Promise<Uint8Array> {
    const paper = PAPER_MM[format];
    const png = await this.png(model, photo, Math.round((paper.width / 25.4) * PRINT_DPI));
    const doc = await PDFDocument.create();
    doc.setTitle(model.names);
    doc.setProducer("Traureise");
    doc.setCreator("Traureise");
    const page = doc.addPage([paper.width * POINTS_PER_MM, paper.height * POINTS_PER_MM]);
    page.drawImage(await doc.embedPng(png), { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
    return doc.save();
  }
}

async function jpegDataUri(bytes: Uint8Array): Promise<string> {
  const jpeg = await sharp(bytes).rotate().resize({ width: PHOTO_EDGE, height: PHOTO_EDGE, fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 86 }).toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}
