import path from "node:path";
import type { Browser, Page } from "@playwright/test";
import { expect, recordForeignRequests, test } from "./fixtures";
import { login, uniqueEmail } from "./helpers/auth";
import { openSection } from "./helpers/editor";
import { waitForMail } from "./helpers/mailpit";
import { createWeddingWithWebsite, de } from "./helpers/weddings";

const COVER = path.join(import.meta.dirname, "assets/cover.jpg");
const randomIp = () => `10.${[0, 0, 0].map(() => Math.floor(Math.random() * 250) + 1).join(".")}`;

/** Another person at their own computer: a browser context of their own, from their own address. */
async function person(browser: Browser, baseURL: string) {
  const context = await browser.newContext({ baseURL, locale: "de-DE", timezoneId: "Europe/Berlin", extraHTTPHeaders: { "x-forwarded-for": randomIp() } });
  return { context, page: await context.newPage(), foreign: recordForeignRequests(context, baseURL) };
}

/** The newest invitation link mailed to `email`. */
async function invitationLink(page: Page, email: string) {
  const text = await waitForMail(page.request, email, "lädt dich");
  return /https?:\/\/\S+\/einladung\?token=\S+/.exec(text)![0];
}

const members = (page: Page) => page.getByTestId("wedding-members");
const member = (page: Page, name: string) => members(page).getByTestId("member").filter({ hasText: name });

async function invite(page: Page, weddingId: string, email: string, role: "Editor" | "Admin") {
  await page.goto(`/hochzeiten/${weddingId}/hochzeit`);
  const form = members(page).getByRole("form", { name: "Person einladen" });
  await form.getByLabel("E-Mail-Adresse").fill(email);
  await form.getByLabel("Rolle").selectOption({ label: role });
  await form.getByRole("button", { name: "Einladen" }).click();
  await expect(members(page).getByTestId("invitation").filter({ hasText: email })).toContainText(role);
  return invitationLink(page, email);
}

async function leave(page: Page) {
  await members(page).getByRole("button", { name: "Hochzeit verlassen" }).click();
  await page.getByRole("alertdialog", { name: "Hochzeit verlassen?" }).getByRole("button", { name: "Verlassen" }).click();
}

test("admins invite people to a wedding, editors work on it, and the wedding outlives any one account", async ({ page, browser, baseURL }) => {
  test.setTimeout(5 * 60_000);
  const anna = uniqueEmail("anna");
  const ben = uniqueEmail("ben");
  const carla = uniqueEmail("carla");
  const dora = uniqueEmail("dora");
  const slug = `geteilt-${Date.now()}`;
  const benAt = await person(browser, baseURL!);
  const carlaAt = await person(browser, baseURL!);
  const stranger = await person(browser, baseURL!);
  let weddingId = "";
  let editorUrl = "";
  let carlaLink = "";
  let coverUrl = "";

  await test.step("Anna creates a wedding and is its only member, its admin and contact person", async () => {
    await login(page, anna, "Anna");
    ({ weddingId, editorUrl } = await createWeddingWithWebsite(page, slug));
    await page.goto(`/hochzeiten/${weddingId}/hochzeit`);
    await expect(member(page, "Anna")).toContainText("Admin");
    await expect(member(page, "Anna")).toContainText("Kontaktperson");
    await expect(page.locator("#wedding-delete")).toBeVisible();
  });

  await test.step("Anna invites Ben as editor; Ben, logged in, follows the link to the Hochzeit tab", async () => {
    await login(benAt.page, ben, "Ben");
    const link = await invite(page, weddingId, ben, "Editor");
    await benAt.page.goto(link);
    await expect(benAt.page).toHaveURL(`/hochzeiten/${weddingId}/hochzeit`);
    await expect(member(benAt.page, "Ben")).toContainText("Editor");
    await page.reload();
    await expect(members(page).getByTestId("invitation")).toHaveCount(0);
    await expect(member(page, "Ben")).toContainText("Editor");
  });

  await test.step("Ben edits the date and the website, but sees no delete section, invite form or role controls", async () => {
    const form = benAt.page.getByRole("form", { name: "Eure Hochzeit" });
    await form.getByLabel("Hochzeitsdatum").fill(de("2027-08-21"));
    await form.getByRole("button", { name: "Speichern" }).click();
    // Exact: "Wird gespeichert …" on the button would match too.
    await expect(benAt.page.getByText("Gespeichert", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("form", { name: "Eure Hochzeit" }).getByLabel("Hochzeitsdatum")).toHaveValue(de("2027-08-21"));

    await expect(benAt.page.locator("#wedding-delete")).toHaveCount(0);
    await expect(benAt.page.getByRole("button", { name: "Hochzeit löschen" })).toHaveCount(0);
    await expect(members(benAt.page).getByRole("form", { name: "Person einladen" })).toHaveCount(0);
    await expect(members(benAt.page).getByRole("combobox")).toHaveCount(0);
    await expect(members(benAt.page).getByRole("button", { name: /entfernen/ })).toHaveCount(0);
    await expect(members(benAt.page).getByRole("button", { name: "Hochzeit verlassen" })).toBeVisible();

    // The cover comes from Ben: deleting his account later must not take it with him.
    await openSection(benAt.page, editorUrl, "Startseite");
    await benAt.page.locator('input[type="file"]').setInputFiles(COVER);
    const cover = benAt.page.getByTestId("site-preview").locator("img.site-cover");
    await expect(cover).toBeVisible();
    coverUrl = (await cover.getAttribute("src"))!;

    // His wedding list marks the shared wedding and offers no delete.
    await benAt.page.goto("/hochzeiten");
    const card = benAt.page.getByTestId("wedding");
    await expect(card).toHaveCount(1);
    await expect(card.getByTestId("role-badge")).toHaveText("Editor");
    await expect(card.getByRole("button", { name: "Löschen" })).toHaveCount(0);
  });

  await test.step("an invitation can be withdrawn", async () => {
    await invite(page, weddingId, dora, "Editor");
    await members(page).getByTestId("invitation").filter({ hasText: dora }).getByRole("button", { name: "Zurückziehen" }).click();
    await expect(members(page).getByTestId("invitation")).toHaveCount(0);
  });

  await test.step("as the only admin, Anna can neither leave nor delete her account", async () => {
    carlaLink = await invite(page, weddingId, carla, "Admin");
    // A pending admin invitation does not count: Carla is not an admin yet.
    await leave(page);
    await expect(members(page).getByRole("alert")).toContainText("mindestens einen Admin");
    await expect(page).toHaveURL(`/hochzeiten/${weddingId}/hochzeit`);

    await page.goto("/konto");
    const blocked = page.getByTestId("account-delete-blocked");
    await expect(blocked).toContainText("Anna & Ben");
    await expect(page.getByTestId("account-delete").getByRole("button", { name: "Konto endgültig löschen" })).toHaveCount(0);
    await blocked.getByRole("link", { name: "Anna & Ben" }).click();
    await expect(page).toHaveURL(`/hochzeiten/${weddingId}/hochzeit#wedding-members`);
  });

  await test.step("the link refuses another logged-in account; after logging out it makes Carla a new account", async () => {
    // Ben opens Carla's link at Carla's computer.
    await login(carlaAt.page, ben);
    await carlaAt.page.goto(carlaLink);
    await expect(carlaAt.page).toHaveURL(/\/login\?error=einladung-konto$/);
    await expect(carlaAt.page.getByText("Diese Einladung ging an eine andere E-Mail-Adresse")).toBeVisible();
    await carlaAt.page.getByRole("button", { name: "Abmelden" }).click();
    await expect(carlaAt.page).toHaveURL(/\/$/);

    await carlaAt.page.goto(carlaLink);
    await expect(carlaAt.page).toHaveURL(/\/willkommen$/);
    await carlaAt.page.getByLabel("Vorname").fill("Carla");
    await carlaAt.page.getByRole("button", { name: "Weiter" }).click();
    await expect(carlaAt.page).toHaveURL(`/hochzeiten/${weddingId}`);
    // Ben's own session is untouched.
    await benAt.page.goto(`/hochzeiten/${weddingId}/hochzeit`);
    await expect(member(benAt.page, "Carla")).toContainText("Admin");
  });

  await test.step("a used invitation link no longer works", async () => {
    await stranger.page.goto(carlaLink);
    await expect(stranger.page).toHaveURL(/\/login\?error=einladung$/);
    await expect(stranger.page.getByText("abgelaufen, wurde zurückgezogen oder schon angenommen")).toBeVisible();
  });

  await test.step("Carla, as admin, sees the invite form and the delete section", async () => {
    await carlaAt.page.goto(`/hochzeiten/${weddingId}/hochzeit`);
    await expect(members(carlaAt.page).getByRole("form", { name: "Person einladen" })).toBeVisible();
    await expect(carlaAt.page.locator("#wedding-delete")).toBeVisible();
  });

  await test.step("Anna makes Carla the contact person and Ben an admin and back", async () => {
    await page.goto(`/hochzeiten/${weddingId}/hochzeit`);
    await members(page).getByLabel("Kontaktperson für Gäste").selectOption({ label: "Carla" });
    await expect(member(page, "Carla")).toContainText("Kontaktperson");
    await expect(member(page, "Anna")).not.toContainText("Kontaktperson");
    await member(page, "Ben").getByLabel("Rolle von Ben").selectOption({ label: "Admin" });
    await expect(member(page, "Ben").getByLabel("Rolle von Ben")).toHaveValue("admin");
    await page.reload();
    await member(page, "Ben").getByLabel("Rolle von Ben").selectOption({ label: "Editor" });
    await page.reload();
    await expect(member(page, "Ben").getByLabel("Rolle von Ben")).toHaveValue("editor");
  });

  await test.step("Ben deletes his account; Anna still has the wedding and the cover he uploaded", async () => {
    await benAt.page.goto("/konto");
    await expect(benAt.page.getByTestId("account-delete-blocked")).toHaveCount(0);
    const panel = benAt.page.getByTestId("account-delete");
    await panel.getByLabel("Gib zur Bestätigung deine E-Mail-Adresse ein").fill(ben);
    await panel.getByRole("button", { name: "Konto endgültig löschen" }).click();
    await expect(benAt.page).toHaveURL(/\/\?konto=geloescht$/);

    await page.goto(`/hochzeiten/${weddingId}/hochzeit`);
    await expect(members(page).getByTestId("member")).toHaveCount(2);
    await expect(member(page, "Ben")).toHaveCount(0);
    await page.goto("/hochzeiten");
    await expect(page.getByTestId("wedding")).toHaveCount(1);
    await expect(page.getByTestId("wedding").getByTestId("role-badge")).toHaveCount(0);
    expect((await page.request.get(coverUrl)).status()).toBe(200);
    await openSection(page, editorUrl, "Startseite");
    await expect(page.getByTestId("site-preview").locator("img.site-cover")).toHaveAttribute("src", coverUrl);
  });

  await test.step("now that Carla is an admin too, Anna can leave; Carla keeps the wedding", async () => {
    await page.goto(`/hochzeiten/${weddingId}/hochzeit`);
    await leave(page);
    await expect(page).toHaveURL(/\/hochzeiten\/neu$/);
    expect((await page.request.get(`/hochzeiten/${weddingId}`)).status()).toBe(404);

    await carlaAt.page.goto(`/hochzeiten/${weddingId}/hochzeit`);
    await expect(members(carlaAt.page).getByTestId("member")).toHaveCount(1);
    await expect(member(carlaAt.page, "Carla")).toContainText("Kontaktperson");
  });

  for (const p of [benAt, carlaAt, stranger]) {
    expect(p.foreign, "requests to third-party hosts").toEqual([]);
    await p.context.close();
  }
});
