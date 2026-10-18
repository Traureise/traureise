import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FileLegalPages, MAX_LEGAL_BYTES } from "@/infrastructure/legal/files";
import { renderLegalMarkdown } from "@/infrastructure/legal/markdown";

async function setup() {
  const dir = await mkdtemp(path.join(tmpdir(), "traureise-legal-"));
  const imprint = path.join(dir, "impressum.md");
  await writeFile(imprint, "# Impressum\n\nErika Musterfrau");
  return { dir, imprint };
}

describe("FileLegalPages", () => {
  it("reads a configured file on every request and lists only pages that exist", async () => {
    const { dir, imprint } = await setup();
    const pages = new FileLegalPages({ imprint, privacy: "", terms: path.join(dir, "missing.md") });
    expect(await pages.read("imprint")).toBe("# Impressum\n\nErika Musterfrau");
    expect(await pages.read("privacy")).toBeNull();
    expect(await pages.read("terms")).toBeNull();
    expect(await pages.available()).toEqual(["imprint"]);

    await writeFile(imprint, "# Impressum\n\nGeändert");
    expect(await pages.read("imprint")).toContain("Geändert");
  });

  it("refuses directories and files that are too large", async () => {
    const { dir } = await setup();
    const big = path.join(dir, "big.md");
    await writeFile(big, "x".repeat(MAX_LEGAL_BYTES + 1));
    const folder = path.join(dir, "folder");
    await mkdir(folder);
    const pages = new FileLegalPages({ imprint: big, privacy: folder, terms: "" });
    expect(await pages.read("imprint")).toBeNull();
    expect(await pages.read("privacy")).toBeNull();
    expect(await pages.available()).toEqual([]);
  });

  it("names settings that are set but unreadable, never their paths", async () => {
    const { dir, imprint } = await setup();
    const pages = new FileLegalPages({ imprint, privacy: path.join(dir, "nope.md"), terms: "" });
    expect(await pages.unreadableSettings()).toEqual(["PRIVACY_FILE"]);
  });
});

describe("renderLegalMarkdown", () => {
  it("renders Markdown to HTML", () => {
    const html = renderLegalMarkdown("# Impressum\n\nErika Musterfrau\\\nMusterstraße 1\n\n[Mail](mailto:a@example.org)");
    expect(html).toContain("<h1>Impressum</h1>");
    expect(html).toContain("Erika Musterfrau<br>Musterstraße 1");
    expect(html).toContain('<a href="mailto:a@example.org">Mail</a>');
  });

  it("escapes raw HTML instead of passing it through", () => {
    const html = renderLegalMarkdown('Hallo <script>alert("x")</script> <img src=x onerror=alert(1)>');
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });

  it("drops javascript: links", () => {
    expect(renderLegalMarkdown("[x](javascript:alert(1))")).not.toContain("javascript:");
  });
});
