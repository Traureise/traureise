import { describe, expect, it } from "vitest";
import { FONT_PAIRINGS, findFontPairing } from "@/domain/fonts";
import { cardLayoutsFor, parseThemeManifest, resolveDesign, themeAssetFiles } from "@/domain/theme";

const manifest = {
  id: "salbei",
  name: { de: "Salbei", en: "Sage" },
  category: { de: "Botanisch" },
  palettes: [
    {
      id: "salbei",
      name: { de: "Salbei" },
      colors: { background: "#f4f6f1", surface: "#ffffff", text: "#24302a", muted: "#5d6b62", primary: "#4f6f5b", accent: "#c7a46a" },
    },
    {
      id: "nacht",
      name: { de: "Nacht" },
      colors: { background: "#1f2a26", surface: "#26332e", text: "#eef2ec", muted: "#a9b8ae", primary: "#9cc2a7", accent: "#e0c38c" },
    },
  ],
  fonts: { defaultPairing: "klassisch" },
  assets: { preview: "preview.svg", heroFrame: "frame.svg", divider: "divider.svg" },
};

describe("parseThemeManifest", () => {
  it("accepts a valid manifest", () => {
    const result = parseThemeManifest(manifest, "salbei");
    expect(result.ok).toBe(true);
  });

  it("requires the folder name to match the id", () => {
    expect(parseThemeManifest(manifest, "other").ok).toBe(false);
  });

  it("rejects bad colours, unknown font pairings, missing German names and unsafe asset paths", () => {
    const bad = (patch: object) => parseThemeManifest({ ...manifest, ...patch }, "salbei").ok;
    expect(bad({ palettes: [{ ...manifest.palettes[0], colors: { ...manifest.palettes[0]!.colors, text: "red" } }] })).toBe(false);
    expect(bad({ fonts: { defaultPairing: "comic" } })).toBe(false);
    expect(bad({ name: { en: "Sage" } })).toBe(false);
    expect(bad({ assets: { preview: "../../etc/passwd" } })).toBe(false);
    expect(bad({ palettes: [] })).toBe(false);
  });
});

describe("resolveDesign", () => {
  const theme = parseThemeManifest(manifest, "salbei");
  if (!theme.ok) throw new Error("fixture invalid");

  it("uses the theme defaults when nothing is chosen", () => {
    const design = resolveDesign(theme.value, null, null);
    expect(design.palette.id).toBe("salbei");
    expect(design.fonts.id).toBe("klassisch");
  });

  it("uses the chosen palette and pairing and falls back when they are unknown", () => {
    expect(resolveDesign(theme.value, "nacht", "modern").palette.id).toBe("nacht");
    expect(resolveDesign(theme.value, "nacht", "modern").fonts.id).toBe("modern");
    expect(resolveDesign(theme.value, "gone", "gone").palette.id).toBe("salbei");
    expect(resolveDesign(theme.value, "gone", "gone").fonts.id).toBe("klassisch");
  });
});

describe("font pairings", () => {
  it("offers several distinct pairings", () => {
    expect(FONT_PAIRINGS.length).toBeGreaterThanOrEqual(6);
    expect(new Set(FONT_PAIRINGS.map((p) => p.id)).size).toBe(FONT_PAIRINGS.length);
    expect(findFontPairing("klassisch")?.heading).toBeTruthy();
  });
});

describe("card layouts", () => {
  const layout = { id: "bogen", name: { de: "Foto im Bogen" }, photo: "masked", photoMask: "frame.svg", ornament: "divider.svg" };
  const withCards = (cards: unknown) => parseThemeManifest({ ...manifest, cards }, "salbei");

  it("are optional, so older theme folders still load", () => {
    const parsed = parseThemeManifest(manifest, "salbei");
    expect(parsed.ok && cardLayoutsFor(parsed.value, "invitation")).toEqual([]);
  });

  it("apply to every kind unless they list some, with defaults for the rest", () => {
    const parsed = withCards({ layouts: [layout, { id: "schlicht", name: { de: "Schlicht" }, kinds: ["thankYou"], photo: "none" }] });
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.fieldErrors));
    expect(cardLayoutsFor(parsed.value, "invitation").map((l) => l.id)).toEqual(["bogen"]);
    expect(cardLayoutsFor(parsed.value, "thankYou").map((l) => l.id)).toEqual(["bogen", "schlicht"]);
    expect(cardLayoutsFor(parsed.value, "saveTheDate")[0]).toMatchObject({ align: "center", surface: "background", border: false, headingCase: "normal" });
  });

  it("reject unknown kinds, photo styles, unsafe files and duplicate ids", () => {
    expect(withCards({ layouts: [{ ...layout, kinds: ["menu"] }] }).ok).toBe(false);
    expect(withCards({ layouts: [{ ...layout, photo: "hexagon" }] }).ok).toBe(false);
    expect(withCards({ layouts: [{ ...layout, ornament: "../x.svg" }] }).ok).toBe(false);
    expect(withCards({ layouts: [layout, layout] }).ok).toBe(false);
    expect(withCards({ layouts: [{ ...layout, photo: "masked", photoMask: undefined }] }).ok).toBe(false);
  });

  it("count their files as theme assets (served and checked by the loader)", () => {
    const parsed = withCards({ layouts: [{ ...layout, ornament: "blatt.svg" }] });
    if (!parsed.ok) throw new Error("invalid");
    expect(themeAssetFiles(parsed.value).sort()).toEqual(["blatt.svg", "divider.svg", "frame.svg", "preview.svg"]);
  });
});
