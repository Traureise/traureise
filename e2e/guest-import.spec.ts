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

test("the template downloads as an Excel file", async ({ page }) => {
  await login(page, uniqueEmail("vorlage"), "Nora");
  const weddingId = await createWedding(page);
  await page.goto(guestsUrl(weddingId));
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Vorlage herunterladen" }).click();
  expect((await download).suggestedFilename()).toBe("gaeste-vorlage.xlsx");
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
  await page.getByLabel("Datei auswählen").setInputFiles(csv("Name;Allergien\nanna meier;Nüsse"));
  await expect(page.getByTestId("import-duplicate")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Importieren" })).toBeDisabled();

  await page.getByRole("button", { name: /Anna Meier in Meier überschreiben/ }).click();
  await expect(page.getByRole("button", { name: "Importieren" })).toBeEnabled();
  await page.getByRole("button", { name: "Importieren" }).click();
  await expect(page).toHaveURL(guestsUrl(weddingId));

  const res = await page.request.get(`${guestsUrl(weddingId)}/export`);
  const text = await res.text();
  expect(text.match(/anna meier/gi)).toHaveLength(1);
  expect(text).toContain("Nüsse");
});

test("an unreadable file shows an error", async ({ page }) => {
  await login(page, uniqueEmail("kaputt"), "Nora");
  const weddingId = await createWedding(page);
  await startImport(page, weddingId);
  await page.getByLabel("Datei auswählen").setInputFiles({ name: "x.xlsx", mimeType: "application/octet-stream", buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04, 5, 250, 251, 7]) });
  await expect(page.getByRole("alert").filter({ hasText: "Diese Datei konnten wir nicht lesen." })).toBeVisible();
});
