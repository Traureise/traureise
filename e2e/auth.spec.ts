import { expect, test } from "./fixtures";
import { login, uniqueEmail } from "./helpers/auth";
import { watchInbox } from "./helpers/mailpit";

test("first login creates an account, asks for the first name, and logout ends the session", async ({ page }) => {
  const email = uniqueEmail("clara");
  await login(page, email, "Clara");
  await expect(page.getByRole("heading", { name: "Willkommen, Clara" })).toBeVisible();

  await page.getByRole("button", { name: "Abmelden" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);

  // Second login: no name step any more.
  await login(page, email);
  await expect(page.getByRole("heading", { name: "Willkommen, Clara" })).toBeVisible();
});

test("a magic link works only once", async ({ page, browser }) => {
  const email = uniqueEmail("dora");
  const inbox = await watchInbox(page.request, email);
  await page.goto("/login");
  await page.getByLabel("E-Mail-Adresse").fill(email);
  await page.getByRole("button", { name: "Anmeldelink senden" }).click();
  const link = await inbox.nextMagicLink();

  await page.goto(link);
  await expect(page).toHaveURL(/\/willkommen$/);

  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await otherPage.goto(link);
  await expect(otherPage).toHaveURL(/\/login\?error=link$/);
  await expect(otherPage.getByRole("alert").filter({ hasText: "abgelaufen oder wurde schon benutzt" })).toBeVisible();
  await other.close();
});

test("invalid email addresses are rejected", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-Mail-Adresse").fill("keine-adresse");
  await page.getByRole("button", { name: "Anmeldelink senden" }).click();
  await expect(page.getByText("Bitte gib eine gültige E-Mail-Adresse ein.")).toBeVisible();
});

test("private pages require a login", async ({ page }) => {
  for (const path of ["/dashboard", "/websites/00000000-0000-0000-0000-000000000000/edit", "/willkommen"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
  }
});
