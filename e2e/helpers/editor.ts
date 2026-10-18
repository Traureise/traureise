import { expect, type Locator, type Page } from "@playwright/test";

export type FieldValue = string | { select: string } | { file: string };
export type Values = Record<string, FieldValue>;

export async function fillForm(form: Locator, values: Values) {
  for (const [label, value] of Object.entries(values)) {
    if (typeof value === "string") {
      await form.getByLabel(label, { exact: true }).fill(value);
    } else if ("select" in value) {
      await form.getByLabel(label, { exact: true }).selectOption({ label: value.select });
    } else {
      await form.locator('input[type="file"]').setInputFiles(value.file);
      await expect(form.getByRole("img", { name: label })).toBeVisible();
    }
  }
}

export const items = (page: Page) => page.getByTestId("item");

export async function addItem(page: Page, values: Values) {
  await page.getByRole("button", { name: "Hinzufügen" }).click();
  const form = page.getByRole("form", { name: "Neuer Eintrag" });
  await fillForm(form, values);
  await form.getByRole("button", { name: "Speichern" }).click();
  await expect(form).toBeHidden();
}

export async function editItem(page: Page, headline: string, values: Values) {
  await items(page).filter({ hasText: headline }).getByRole("button", { name: "Bearbeiten" }).click();
  const form = page.getByRole("form", { name: "Eintrag bearbeiten" });
  await fillForm(form, values);
  await form.getByRole("button", { name: "Speichern" }).click();
  await expect(form).toBeHidden();
}

export async function moveItem(page: Page, headline: string, direction: "Nach oben" | "Nach unten") {
  const before = await items(page).allInnerTexts();
  await items(page).filter({ hasText: headline }).getByRole("button", { name: direction }).click();
  await expect.poll(() => items(page).allInnerTexts()).not.toEqual(before);
}

export async function deleteItem(page: Page, headline: string) {
  page.once("dialog", (dialog) => dialog.accept());
  await items(page).filter({ hasText: headline }).getByRole("button", { name: "Löschen" }).click();
  await expect(items(page).filter({ hasText: headline })).toHaveCount(0);
}

export async function expectItems(page: Page, headlines: string[]) {
  await expect(items(page)).toHaveText(headlines);
}

export async function openSection(page: Page, editorUrl: string, name: string) {
  await page.goto(editorUrl);
  await page.getByRole("navigation", { name: "Website bearbeiten" }).getByRole("link", { name }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

/** Shows the toggle → hidden in preview, then back. */
export async function toggleVisibility(page: Page, sectionId: string) {
  const preview = page.getByTestId("site-preview");
  const toggle = page.getByRole("switch", { name: "Abschnitt anzeigen" });
  await expect(preview.getByTestId(`site-section-${sectionId}`)).toBeVisible();
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await expect(preview.getByTestId(`site-section-${sectionId}`)).toHaveCount(0);
  await toggle.click();
  await expect(toggle).toBeChecked();
  await expect(preview.getByTestId(`site-section-${sectionId}`)).toBeVisible();
}

export async function renameSection(page: Page, sectionId: string, title: string) {
  await page.getByLabel("Titel des Abschnitts").fill(title);
  await page.getByRole("button", { name: "Speichern" }).first().click();
  await expect(page.getByTestId("site-preview").getByTestId(`site-section-${sectionId}`).getByRole("heading", { level: 2 })).toHaveText(title);
}
