import { expect, type Page } from "@playwright/test";
import { watchInbox } from "./mailpit";

export const uniqueEmail = (name: string) => `${name}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.org`;

/** Logs in through the real magic-link flow. Pass firstName for a first login, which ends on the Hochzeit form. */
export async function login(page: Page, email: string, firstName?: string) {
  const inbox = await watchInbox(page.request, email);
  await page.goto("/login");
  await page.getByLabel("E-Mail-Adresse").fill(email);
  await page.getByRole("button", { name: "Anmeldelink senden" }).click();
  await expect(page.getByRole("heading", { name: "Schau in dein Postfach" })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();

  await page.goto(await inbox.nextMagicLink());
  if (firstName) {
    await expect(page).toHaveURL(/\/willkommen$/);
    await page.getByLabel("Vorname").fill(firstName);
    await page.getByRole("button", { name: "Weiter" }).click();
  }
  // /dashboard opens the most recent wedding, or the Hochzeit form without one.
  await expect(page).toHaveURL(/\/hochzeiten\/(neu|[0-9a-f-]{36})$/);
}
