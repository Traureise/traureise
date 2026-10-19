import { expect, type Page } from "@playwright/test";

export const weddingIdOf = (url: string) => /\/hochzeiten\/([0-9a-f-]{36})/.exec(url)![1]!;
export const homeUrl = (weddingId: string) => `/hochzeiten/${weddingId}`;
export const guestsUrl = (weddingId: string) => `/hochzeiten/${weddingId}/gaeste`;

/** The Hochzeit form: names and, if given, the date. Lands on the wedding's home and returns its id. */
export async function createWedding(page: Page, { names = "Anna & Ben", date = "2027-06-12" as string | null } = {}) {
  await page.goto("/hochzeiten/neu");
  const form = page.getByRole("form", { name: "Eure Hochzeit" });
  await form.getByLabel("Eure Namen").fill(names);
  if (date) {
    await form.getByLabel("Ja", { exact: true }).check();
    await form.getByLabel("Hochzeitsdatum").fill(date);
  } else await form.getByLabel("Noch nicht").check();
  await form.getByRole("button", { name: "Hochzeit anlegen" }).click();
  await expect(page).toHaveURL(/\/hochzeiten\/[0-9a-f-]{36}$/);
  return weddingIdOf(page.url());
}

/** A step of the home timeline, by the item's name ("Save the Date", "Hochzeitswebsite", …). */
export const step = (page: Page, name: string) => page.getByTestId("timeline-step").filter({ has: page.getByRole("heading", { level: 2, name, exact: true }) });

/** Opens the first version of an item from the wedding's home. */
async function openStep(page: Page, weddingId: string, name: string) {
  await page.goto(homeUrl(weddingId));
  await step(page, name).getByRole("link", { name: /^(Öffnen|Weitermachen)$/ }).click();
}

export async function openWebsiteEditor(page: Page, weddingId: string): Promise<string> {
  await openStep(page, weddingId, "Hochzeitswebsite");
  await expect(page).toHaveURL(/\/hochzeiten\/[0-9a-f-]{36}\/website\/[0-9a-f-]{36}$/);
  return new URL(page.url()).pathname;
}

export async function openCard(page: Page, weddingId: string, name: "Verlobungsanzeige" | "Save the Date" | "Einladung" | "Dankeskarte"): Promise<string> {
  await openStep(page, weddingId, name);
  await expect(page).toHaveURL(/\/hochzeiten\/[0-9a-f-]{36}\/karten\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  return new URL(page.url()).pathname;
}

/** The wedding's address (details dialog), for /<slug>/verlobung and the calendar file. */
export async function setWeddingSlug(page: Page, weddingId: string, slug: string) {
  await page.goto(homeUrl(weddingId));
  await page.getByRole("button", { name: "Angaben ändern" }).click();
  const dialog = page.getByRole("dialog", { name: "Eure Hochzeit" });
  // A new address breaks links already shared: the dialog says so before saving.
  await expect(dialog.getByTestId("slug-change-hint")).toHaveCount(0);
  await dialog.getByLabel("Adresse eurer Hochzeit").fill(slug);
  await expect(dialog.getByTestId("slug-change-hint")).toContainText("keine Weiterleitung");
  await dialog.getByRole("button", { name: "Speichern" }).click();
  await expect(dialog).toBeHidden();
}

/** A website version's own address, from its home section. */
export async function setWebsiteSlug(page: Page, editorUrl: string, slug: string) {
  await page.goto(`${editorUrl}/home`);
  await expect(page.getByTestId("slug-change-hint")).toHaveCount(0);
  await page.getByLabel("Webadresse dieser Version").fill(slug);
  await expect(page.getByTestId("slug-change-hint")).toContainText("keine Weiterleitung");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Gespeichert").first()).toBeVisible();
}

export async function publishWebsite(page: Page, editorUrl: string) {
  await page.goto(editorUrl);
  await page.getByTestId("publish-control").getByRole("button", { name: "Veröffentlichen" }).click();
  await expect(page.getByTestId("publish-control")).toHaveAttribute("data-published", "true");
}

/**
 * A wedding with a known address for everything (the wedding and its first website version) and, unless
 * `published: false`, its website online. Returns the ids and the website editor's URL.
 */
export async function createWeddingWithWebsite(page: Page, slug: string, { names = "Anna & Ben", date = "2027-06-12" as string | null, published = true } = {}) {
  const weddingId = await createWedding(page, { names, date });
  await setWeddingSlug(page, weddingId, slug);
  const editorUrl = await openWebsiteEditor(page, weddingId);
  await setWebsiteSlug(page, editorUrl, slug);
  if (published) await publishWebsite(page, editorUrl);
  return { weddingId, editorUrl };
}
