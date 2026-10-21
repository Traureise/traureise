import { expect, type Page } from "@playwright/test";
import { openCard } from "./weddings";

export type CardName = "Save the Date" | "Einladung" | "Dankeskarte" | "Verlobungsanzeige";

/** Opens the first version of a card kind from the wedding's timeline (every kind exists from the start). */
export async function createCard(page: Page, weddingId: string, name: CardName) {
  return openCard(page, weddingId, name);
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
  await page.getByTestId("card-picker").getByRole("button").click();
  await page.getByRole("menuitem", { name, exact: true }).click();
  await expect(page.getByTestId("card-picker").getByRole("button")).toHaveAccessibleName(`Versand: ${name}`);
}

/** Opens a household's envelope (or sees the card directly) and waits until the page reported it. */
export async function openEnvelope(page: Page) {
  const opened = page.waitForResponse((r) => r.url().includes("/geoeffnet") && r.request().method() === "POST");
  await page.getByTestId("envelope").click();
  expect((await opened).status()).toBe(204);
}

/** Exportieren → a format, in the card editor at `cardUrl`. */
export async function exportCard(page: Page, cardUrl: string, format: "PDF (A6)" | "PDF (A5)" | "Bild (PNG)") {
  await page.goto(cardUrl);
  await page.getByRole("button", { name: "Exportieren" }).click();
  const downloading = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: format }).click();
  return downloading;
}
