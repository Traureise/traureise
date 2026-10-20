import { expect, type Locator, type Page } from "@playwright/test";
import { createWeddingWithWebsite } from "./weddings";

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

export const blocks = (page: Page) => page.getByTestId("block");

/** Opens the block chips and the form for a new block of this type (its German label, e.g. "Person"). */
export async function openNewBlock(page: Page, type: string): Promise<Locator> {
  await page.getByRole("button", { name: "Baustein hinzufügen", exact: true }).click();
  await page.getByRole("group", { name: "Baustein hinzufügen" }).getByRole("button", { name: type, exact: true }).click();
  return page.getByRole("form", { name: "Neuer Baustein" });
}

export async function addBlock(page: Page, type: string, values: Values) {
  const form = await openNewBlock(page, type);
  await fillForm(form, values);
  await form.getByRole("button", { name: "Speichern" }).click();
  await expect(form).toBeHidden();
}

export async function editBlock(page: Page, headline: string, values: Values) {
  await blocks(page).filter({ hasText: headline }).getByRole("button", { name: "Bearbeiten" }).click();
  const form = page.getByRole("form", { name: "Baustein bearbeiten" });
  await fillForm(form, values);
  await form.getByRole("button", { name: "Speichern" }).click();
  await expect(form).toBeHidden();
}

export async function moveBlock(page: Page, headline: string, direction: "Nach oben" | "Nach unten") {
  const before = await blocks(page).allInnerTexts();
  await blocks(page).filter({ hasText: headline }).getByRole("button", { name: direction }).click();
  await expect.poll(() => blocks(page).allInnerTexts()).not.toEqual(before);
}

export async function deleteBlock(page: Page, headline: string) {
  page.once("dialog", (dialog) => dialog.accept());
  await blocks(page).filter({ hasText: headline }).getByRole("button", { name: "Löschen" }).click();
  await expect(blocks(page).filter({ hasText: headline })).toHaveCount(0);
}

export async function expectBlocks(page: Page, headlines: string[]) {
  await expect(blocks(page).getByTestId("block-headline")).toHaveText(headlines);
}

/** Opens a section from the version's overview by its title; returns the section's id (from the URL). */
export async function openSection(page: Page, editorUrl: string, name: string): Promise<string> {
  await page.goto(editorUrl);
  await page.getByRole("navigation", { name: "Website bearbeiten" }).getByRole("link", { name }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  return new URL(page.url()).pathname.split("/").at(-1)!;
}

/** A section of the site (preview or public) by its id. */
export const siteSection = (scope: Page | Locator, sectionId: string) => scope.locator(`[data-testid="site-section"][data-section-id="${sectionId}"]`);

/** Shows the toggle → hidden in preview, then back. */
export async function toggleVisibility(page: Page, sectionId: string) {
  const preview = page.getByTestId("site-preview");
  const toggle = page.getByRole("switch", { name: "Abschnitt anzeigen" });
  await expect(siteSection(preview, sectionId)).toBeVisible();
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await expect(siteSection(preview, sectionId)).toHaveCount(0);
  await toggle.click();
  await expect(toggle).toBeChecked();
  await expect(siteSection(preview, sectionId)).toBeVisible();
}

export async function renameSection(page: Page, sectionId: string, title: string) {
  await page.getByLabel("Titel des Abschnitts").fill(title);
  await page.getByRole("button", { name: "Speichern" }).first().click();
  await expect(siteSection(page.getByTestId("site-preview"), sectionId).getByRole("heading", { level: 2 })).toHaveText(title);
}

/** The Ablauf page of the wedding. */
export const scheduleUrl = (weddingId: string) => `/hochzeiten/${weddingId}/ablauf`;

/** Adds an event to the wedding's Ablauf. */
export async function addEvent(page: Page, weddingId: string, values: Values) {
  await page.goto(scheduleUrl(weddingId));
  await page.getByRole("button", { name: "Termin hinzufügen" }).click();
  const form = page.getByRole("form", { name: "Neuer Termin" });
  await fillForm(form, values);
  await form.getByRole("button", { name: "Speichern" }).click();
  await expect(form).toBeHidden();
}

/** A new wedding whose (published) website has this address; returns the website editor's URL. */
export async function createWebsite(page: Page, slug: string, weddingDate = "2027-06-12") {
  return (await createWeddingWithWebsite(page, slug, { date: weddingDate })).editorUrl;
}
