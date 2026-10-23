import { readFile } from "node:fs/promises";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { expect, test } from "./fixtures";
import { login, uniqueEmail } from "./helpers/auth";
import { addHousehold, household } from "./helpers/guests";
import { createWedding, guestsUrl } from "./helpers/weddings";

const csv = (text: string) => ({ name: "gaeste.csv", mimeType: "text/csv", buffer: Buffer.from(text, "utf8") });

async function startImport(page: import("@playwright/test").Page, weddingId: string) {
  await page.goto(guestsUrl(weddingId));
  await page.getByRole("link", { name: "Gästeliste importieren" }).click();
  await expect(page).toHaveURL(`${guestsUrl(weddingId)}/import`);
}

const inline = (ref: string, value: string) => `<c r="${ref}" t="inlineStr"><is><t>${value}</t></is></c>`;

test("the downloaded template, filled in, imports", async ({ page }) => {
  await login(page, uniqueEmail("vorlage"), "Nora");
  const weddingId = await createWedding(page);
  await page.goto(guestsUrl(weddingId));
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Vorlage herunterladen" }).click();
  expect((await download).suggestedFilename()).toBe("gaeste-vorlage.xlsx");

  const files = unzipSync(await readFile((await (await download).path())!));
  const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]!);
  expect(sheet).toContain("Haushalt");
  const rows = `<row r="2">${inline("A2", "Paula Weber")}${inline("B2", "Weber")}${inline("D2", "paula@example.org")}</row><row r="3">${inline("A3", "Tom Weber")}${inline("B3", "Weber")}${inline("C3", "ja")}</row>`;
  files["xl/worksheets/sheet1.xml"] = strToU8(sheet.replace("</sheetData>", `${rows}</sheetData>`));

  await startImport(page, weddingId);
  await page.getByLabel("Datei auswählen").setInputFiles({ name: "gaeste-vorlage.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from(zipSync(files)) });
  await expect(page.getByTestId("import-new")).toContainText("2 Personen: Paula Weber, Tom Weber");
  await page.getByRole("button", { name: "Importieren" }).click();
  await expect(page).toHaveURL(guestsUrl(weddingId));
  await expect(household(page, "Weber")).toContainText("Paula Weber");
  await expect(household(page, "Weber")).toContainText("Tom Weber");
});

test("a file over 1 MB is refused before it is sent", async ({ page }) => {
  await login(page, uniqueEmail("gross"), "Nora");
  const weddingId = await createWedding(page);
  await startImport(page, weddingId);
  await page.getByLabel("Datei auswählen").setInputFiles({ name: "gaeste.csv", mimeType: "text/csv", buffer: Buffer.alloc(13_000_000, 0x41) });
  await expect(page.getByRole("alert").filter({ hasText: "Diese Datei ist größer als 1 MB." })).toBeVisible();
});

test("a couple fixes and skips problem rows, then imports the households", async ({ page }) => {
  await login(page, uniqueEmail("import"), "Nora");
  const weddingId = await createWedding(page);
  await startImport(page, weddingId);

  await page.getByLabel("Datei auswählen").setInputFiles(csv("Name;Haushalt;E-Mail\nAnna;Meier;anna@x.de\nBen;Meier;\n;Schulz;\nCarla;;nope"));
  await expect(page.getByTestId("import-problem")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Importieren" })).toBeDisabled();

  const empty = page.getByTestId("import-problem").filter({ hasText: "Zeile 4" });
  await empty.getByRole("button", { name: "Überspringen" }).click();
  await expect(page.getByTestId("import-problem")).toHaveCount(1);
  await expect(page.getByTestId("import-skipped").filter({ hasText: "Zeile 4" })).toBeVisible();

  await page.getByTestId("import-problem").getByRole("button", { name: "Korrigieren" }).click();
  const editor = page.getByRole("form", { name: "Zeile 5 korrigieren" });
  await editor.getByLabel("E-Mail", { exact: true }).fill("carla@x.de");
  await editor.getByRole("button", { name: "Übernehmen" }).click();
  await expect(page.getByTestId("import-problem")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Importieren" })).toBeEnabled();

  await page.getByRole("button", { name: "Importieren" }).click();
  await expect(page).toHaveURL(guestsUrl(weddingId));
  await expect(household(page, "Meier")).toContainText("Anna");
  await expect(household(page, "Meier")).toContainText("Ben");
  await expect(household(page, "Carla")).toBeVisible();
  await expect(household(page, "Schulz")).toHaveCount(0);
});

test("a duplicate must be decided, and overwriting keeps one person", async ({ page }) => {
  await login(page, uniqueEmail("dublette"), "Nora");
  const weddingId = await createWedding(page);
  await page.goto(guestsUrl(weddingId));
  await addHousehold(page, "Meier", [{ name: "Anna Meier" }]);

  await startImport(page, weddingId);
  await page.getByLabel("Datei auswählen").setInputFiles(csv("Name;Allergien\nanna  MEIER;Nüsse"));
  await expect(page.getByTestId("import-duplicate")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Importieren" })).toBeDisabled();

  await page.getByRole("button", { name: /Anna Meier in Meier überschreiben/ }).click();
  await expect(page.getByRole("button", { name: "Importieren" })).toBeEnabled();
  await page.getByRole("button", { name: "Importieren" }).click();
  await expect(page).toHaveURL(guestsUrl(weddingId));

  const res = await page.request.get(`${guestsUrl(weddingId)}/export`);
  const text = await res.text();
  expect(text.match(/anna meier/gi)).toEqual(["Anna Meier"]);
  expect(text).toContain("Nüsse");
});

test("a second row cannot overwrite the same person and visibly needs a decision", async ({ page }) => {
  await login(page, uniqueEmail("zweimal"), "Nora");
  const weddingId = await createWedding(page);
  await page.goto(guestsUrl(weddingId));
  await addHousehold(page, "Meier", [{ name: "Anna Meier" }]);

  await startImport(page, weddingId);
  await page.getByLabel("Datei auswählen").setInputFiles(csv("Name;Haushalt\nAnna Meier;A\nAnna Meier;B"));
  await expect(page.getByTestId("import-duplicate")).toHaveCount(2);
  await page.getByRole("button", { name: "Anna Meier in Meier überschreiben (Zeile 2)" }).click();

  const second = page.getByTestId("import-duplicate").filter({ hasText: "Zeile 3" });
  await expect(second).toContainText("wird schon von Zeile 2 überschrieben");
  await expect(second.getByRole("button", { name: "Anna Meier in Meier überschreiben (Zeile 3)" })).toBeDisabled();
  await expect(second.getByTestId("import-needs-decision")).toBeVisible();
  await expect(page.getByTestId("import-waiting")).toHaveText("Noch eine Zeile ohne Entscheidung: 3");
  await expect(page.getByRole("button", { name: "Importieren" })).toBeDisabled();

  await second.getByRole("button", { name: "Überspringen" }).click();
  await expect(page.getByTestId("import-waiting")).toHaveText("");
  await expect(page.getByRole("button", { name: "Importieren" })).toBeEnabled();
});

test("after the guest list changed, the review recovers and imports", async ({ page }) => {
  await login(page, uniqueEmail("veraltet"), "Nora");
  const weddingId = await createWedding(page);
  await page.goto(guestsUrl(weddingId));
  await addHousehold(page, "Meier", [{ name: "Anna Meier" }]);

  await startImport(page, weddingId);
  await page.getByLabel("Datei auswählen").setInputFiles(csv("Name;Haushalt\nAnna Meier;Neu"));
  await page.getByRole("button", { name: /Anna Meier in Meier überschreiben/ }).click();
  await expect(page.getByRole("button", { name: "Importieren" })).toBeEnabled();

  // Meanwhile, in another tab, Anna is renamed: the row is no longer a duplicate.
  const other = await page.context().newPage();
  await other.goto(guestsUrl(weddingId));
  await household(other, "Meier").getByRole("button", { name: "Weitere Aktionen für Meier" }).click();
  await other.getByRole("menuitem", { name: "Bearbeiten" }).click();
  const form = other.getByRole("form", { name: "Haushalt bearbeiten" });
  await form.getByLabel("Person 1", { exact: true }).fill("Anna Schmidt");
  await form.getByRole("button", { name: "Speichern" }).click();
  await expect(form).toBeHidden();
  await other.close();

  await page.getByRole("button", { name: "Importieren" }).click();
  await expect(page.getByTestId("import-outdated")).toBeVisible();
  await expect(page.getByTestId("import-duplicate")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Importieren" })).toBeEnabled();
  await page.getByRole("button", { name: "Importieren" }).click();
  await expect(page).toHaveURL(guestsUrl(weddingId));
  await expect(household(page, "Neu")).toContainText("Anna Meier");
  await expect(household(page, "Meier")).toContainText("Anna Schmidt");
});

test("an unreadable file shows an error", async ({ page }) => {
  await login(page, uniqueEmail("kaputt"), "Nora");
  const weddingId = await createWedding(page);
  await startImport(page, weddingId);
  await page.getByLabel("Datei auswählen").setInputFiles({ name: "x.xlsx", mimeType: "application/octet-stream", buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04, 5, 250, 251, 7]) });
  await expect(page.getByRole("alert").filter({ hasText: "Diese Datei konnten wir nicht lesen." })).toBeVisible();
});
