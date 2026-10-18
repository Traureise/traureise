import { mkdtemp, mkdir, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { SharpImageProcessor } from "@/infrastructure/images/sharp";
import { createMagicLinkTemplate } from "@/infrastructure/mail/magic-link-template";
import { SmtpMailer } from "@/infrastructure/mail/smtp";
import { LocalFileStorage } from "@/infrastructure/storage/local";
import { FsThemeCatalog, loadThemes } from "@/infrastructure/themes/fs-catalog";
import { testEnv } from "./env";

describe("LocalFileStorage", () => {
  it("writes, reads and deletes files and refuses path traversal", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "traureise-"));
    const storage = new LocalFileStorage(path.join(dir, "uploads"));
    await storage.put("abc.webp", new Uint8Array([1, 2, 3]), "image/webp");
    expect(await storage.get("abc.webp")).toEqual({ bytes: new Uint8Array([1, 2, 3]), contentType: "image/webp" });
    await storage.delete("abc.webp");
    expect(await storage.get("abc.webp")).toBeNull();
    await expect(storage.put("../evil.webp", new Uint8Array([1]), "image/webp")).rejects.toThrow();
  });
});

describe("SharpImageProcessor", () => {
  it("re-encodes to WebP, strips EXIF and bounds the size", async () => {
    const input = await sharp({ create: { width: 3000, height: 1000, channels: 3, background: "#4a2342" } })
      .jpeg()
      .withExif({ IFD0: { Copyright: "Anna", Artist: "GPS-Test" } })
      .toBuffer();
    expect((await sharp(input).metadata()).exif).toBeDefined();

    const output = await new SharpImageProcessor().process(new Uint8Array(input));
    const meta = await sharp(output.bytes).metadata();
    expect(output.contentType).toBe("image/webp");
    expect(meta.format).toBe("webp");
    expect(meta.exif).toBeUndefined();
    expect(meta.width).toBe(2400);
  });

  it("rejects data that is not an image", async () => {
    await expect(new SharpImageProcessor().process(new TextEncoder().encode("%PDF-1.7"))).rejects.toThrow();
  });
});

describe("SmtpMailer", () => {
  it("delivers the magic-link email over SMTP", async () => {
    const { smtpPort, mailpitUrl } = testEnv();
    const to = `smtp-test-${Date.now()}@example.org`;
    const mailer = new SmtpMailer({ host: "localhost", port: smtpPort, secure: false, from: "Traureise <no-reply@traureise.localhost>" });
    await mailer.send({ to, ...createMagicLinkTemplate().render("http://localhost:3000/auth/verify?token=abc", 15) });

    const res = await fetch(`${mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    const { messages } = (await res.json()) as { messages: { Subject: string; ID: string }[] };
    expect(messages[0]?.Subject).toBe("Dein Anmeldelink für Traureise");
    const message = await (await fetch(`${mailpitUrl}/api/v1/message/${messages[0]!.ID}`)).json();
    expect(message.Text).toContain("http://localhost:3000/auth/verify?token=abc");
    expect(message.Text).toContain("15 Minuten");
  });
});

describe("theme loading", () => {
  const manifest = (id: string, patch: object = {}) => ({
    id,
    name: { de: id },
    category: { de: "Test" },
    palettes: [{ id: "p", name: { de: "P" }, colors: { background: "#ffffff", surface: "#ffffff", text: "#000000", muted: "#555555", primary: "#333333", accent: "#999999" } }],
    fonts: { defaultPairing: "klassisch" },
    assets: { preview: "preview.svg" },
    ...patch,
  });

  async function themeDir(themes: Record<string, object | string>) {
    const dir = await mkdtemp(path.join(tmpdir(), "themes-"));
    for (const [folder, content] of Object.entries(themes)) {
      await mkdir(path.join(dir, folder));
      await writeFile(path.join(dir, folder, "theme.json"), typeof content === "string" ? content : JSON.stringify(content));
      await writeFile(path.join(dir, folder, "preview.svg"), "<svg/>");
    }
    return dir;
  }

  it("discovers valid theme folders and skips invalid ones", async () => {
    const dir = await themeDir({
      gut: manifest("gut"),
      kaputt: "{ not json",
      falsch: manifest("anders"),
      ohnebild: manifest("ohnebild", { assets: { preview: "preview.svg", divider: "fehlt.svg" } }),
    });
    const { themes, errors } = loadThemes(dir);
    expect(themes.map((t) => t.id)).toEqual(["gut"]);
    expect(errors.map((e) => e.folder).sort()).toEqual(["falsch", "kaputt", "ohnebild"]);
  });

  it("serves only declared assets", async () => {
    const dir = await themeDir({ gut: manifest("gut") });
    const catalog = new FsThemeCatalog(dir);
    expect(catalog.assetPath("gut", "preview.svg")).toBe(path.join(dir, "gut", "preview.svg"));
    expect(catalog.assetPath("gut", "theme.json")).toBeNull();
    expect(catalog.assetPath("nope", "preview.svg")).toBeNull();
    expect(catalog.defaultThemeId()).toBe("gut");
  });

  it("loads the themes shipped with Traureise", async () => {
    const { themes, errors } = loadThemes(path.resolve("themes"));
    expect(errors).toEqual([]);
    expect(themes.length).toBeGreaterThanOrEqual(2);
    expect(themes.map((t) => t.id)).toContain("salbei");
    const folders = (await readdir("themes", { withFileTypes: true })).filter((d) => d.isDirectory());
    expect(folders).toHaveLength(themes.length);
  });
});
