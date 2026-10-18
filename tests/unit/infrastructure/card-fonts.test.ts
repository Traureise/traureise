import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FONT_PAIRINGS } from "@/domain/fonts";
import { CARD_FONT_WEIGHTS, fontFiles } from "@/infrastructure/cards/renderer";

describe("card export fonts", () => {
  it("load exactly the weights the browser gets, so page and PDF pick the same face", () => {
    const css = readFileSync("src/app/site-fonts.css", "utf8");
    const browser: Record<string, number[]> = {};
    for (const [, pkg, weight] of css.matchAll(/@fontsource\/([a-z0-9-]+)\/latin-(\d+)\.css/g)) (browser[pkg!] ??= []).push(Number(weight));
    const exporter = Object.fromEntries(Object.entries(CARD_FONT_WEIGHTS).map(([family, weights]) => [family.toLowerCase().replace(/\s+/g, "-"), [...weights]]));
    expect(exporter).toEqual(browser);
  });

  it("cover every family of every pairing, with the files present (latin and latin-ext)", () => {
    for (const pairing of FONT_PAIRINGS) {
      for (const face of [pairing.heading, pairing.body]) {
        const files = fontFiles(face.family);
        expect(files.length, face.family).toBeGreaterThan(0);
        for (const { file } of files) expect(existsSync(path.join("node_modules/@fontsource", file)), file).toBe(true);
      }
    }
  });
});
