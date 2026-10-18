import { expect, type Page } from "@playwright/test";

export const CARD_SLUG = { "Save the Date": "save-the-date", Einladung: "einladung", Dankeskarte: "dankeskarte", Verlobungsanzeige: "verlobung" } as const;
export type CardName = keyof typeof CARD_SLUG;

/** Erstellen → card kind on the dashboard; with one website it opens the card editor. */
export async function createCard(page: Page, name: CardName) {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Erstellen", exact: true }).click();
  await page.getByRole("menuitem", { name, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/websites/[0-9a-f-]{36}/karten/${CARD_SLUG[name]}$`));
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  return page.url();
}

export async function saveCard(page: Page) {
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.getByText("Gespeichert").first()).toBeVisible();
}

/**
 * WhatsApp is a wa.me link the couple opens in a new tab. In tests it must not leave the app (the
 * third-party check), so window.open only records the URL.
 */
export async function captureWindowOpen(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __opened: string[] }).__opened = [];
    window.open = (url?: string | URL) => {
      (window as unknown as { __opened: string[] }).__opened.push(String(url));
      return null;
    };
  });
}

export const openedUrls = (page: Page) => page.evaluate(() => (window as unknown as { __opened: string[] }).__opened);

/** Picks the card on the Gäste page (Versand: Antwortlink / Save the Date / Einladung / Dankeskarte). */
export async function chooseCard(page: Page, name: CardName | "Antwortlink") {
  await page.getByTestId("card-picker").getByRole("link", { name, exact: true }).click();
  await expect(page.getByTestId("card-picker").getByRole("link", { name, exact: true })).toHaveAttribute("aria-current", "page");
}

/** Opens a household's envelope (or sees the card directly) and waits until the page reported it. */
export async function openEnvelope(page: Page) {
  const opened = page.waitForResponse((r) => r.url().includes("/geoeffnet") && r.request().method() === "POST");
  await page.getByTestId("envelope").click();
  expect((await opened).status()).toBe(204);
}
