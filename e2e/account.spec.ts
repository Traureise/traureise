import { readFile } from "node:fs/promises";
import path from "node:path";
import { unzipSync } from "fflate";
import { expect, test } from "./fixtures";
import { login, uniqueEmail } from "./helpers/auth";
import { createWebsite, openSection } from "./helpers/editor";

const COVER = path.join(import.meta.dirname, "assets/cover.jpg");

test("a user exports all their data and deletes the account, after which they start over as new", async ({ page, request }) => {
  test.setTimeout(3 * 60_000);
  const email = uniqueEmail("konto");
  const slug = `kim-und-jo-${Date.now()}`;
  let coverUrl = "";

  await test.step("create a wedding whose website has a cover image", async () => {
    await login(page, email, "Kim");
    const editorUrl = await createWebsite(page, slug);
    await openSection(page, editorUrl, "Startseite");
    await page.locator('input[type="file"]').setInputFiles(COVER);
    const cover = page.getByTestId("site-preview").locator("img.site-cover");
    await expect(cover).toBeVisible();
    coverUrl = (await cover.getAttribute("src"))!;
    expect(coverUrl).toMatch(/^\/uploads\/[A-Za-z0-9_-]+\.webp$/);
    expect((await request.get(coverUrl)).status()).toBe(200);
  });

  await test.step("export downloads a ZIP with data.json and the images", async () => {
    await page.goto("/dashboard");
    await page.getByRole("link", { name: "Konto", exact: true }).click();
    await expect(page.getByTestId("account-profile")).toContainText(email);
    const downloading = page.waitForEvent("download");
    await page.getByRole("link", { name: "ZIP-Datei herunterladen" }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toMatch(/^traureise-export-\d{4}-\d{2}-\d{2}\.zip$/);

    const files = unzipSync(new Uint8Array(await readFile((await download.path())!)));
    const key = coverUrl.split("/").pop()!;
    expect(Object.keys(files).sort()).toEqual(["data.json", `images/${key}`]);
    const served = new Uint8Array(await (await request.get(coverUrl)).body());
    expect(files[`images/${key}`]).toEqual(served);

    const data = JSON.parse(new TextDecoder().decode(files["data.json"]));
    expect(data.account).toMatchObject({ email, firstName: "Kim" });
    expect(data.weddings).toHaveLength(1);
    expect(data.weddings[0]).toMatchObject({ slug, title: "Anna & Ben", weddingDate: "2027-06-12" });
    expect(data.weddings[0].websites[0]).toMatchObject({ slug, label: "Standard", published: true, coverImage: `images/${key}` });
    expect(data.weddings[0].websites[0].sections.length).toBeGreaterThan(0);
    expect(data.weddings[0].cards).toHaveLength(4);
  });

  await test.step("deletion needs the account's email address", async () => {
    const panel = page.getByTestId("account-delete");
    await panel.getByLabel("Gib zur Bestätigung deine E-Mail-Adresse ein").fill("someone-else@example.org");
    await panel.getByRole("button", { name: "Konto endgültig löschen" }).click();
    await expect(panel.getByText("Bitte gib genau die E-Mail-Adresse deines Kontos ein.")).toBeVisible();
    await expect(page).toHaveURL(/\/konto$/);
  });

  await test.step("deleting removes the account, its weddings and its stored files, and logs out", async () => {
    const panel = page.getByTestId("account-delete");
    await panel.getByLabel("Gib zur Bestätigung deine E-Mail-Adresse ein").fill(email.toUpperCase());
    await panel.getByRole("button", { name: "Konto endgültig löschen" }).click();
    await expect(page).toHaveURL(/\/\?konto=geloescht$/);
    await expect(page.getByText("Dein Konto und alle deine Daten wurden gelöscht.")).toBeVisible();

    // The upload route reads storage directly, so a 404 means the file itself is gone.
    expect((await request.get(coverUrl)).status()).toBe(404);
    expect((await request.get(`/${slug}`)).status()).toBe(404);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
    expect((await page.context().cookies()).find((c) => c.name === "traureise_session")).toBeUndefined();
  });

  await test.step("the same email signs up again as a brand-new account", async () => {
    await login(page, email, "Kim");
    await expect(page).toHaveURL(/\/hochzeiten\/neu$/);
    await page.goto("/hochzeiten");
    await expect(page.getByTestId("wedding")).toHaveCount(0);
  });
});
