import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { login, uniqueEmail } from "./helpers/auth";
import { chooseCard, createCard } from "./helpers/cards";
import { createWebsite } from "./helpers/editor";
import { homeUrl, step, weddingIdOf } from "./helpers/weddings";
import { addHousehold, guestLink, guestsUrl, household } from "./helpers/guests";
import { waitForMessages } from "./helpers/mailpit";

const STUB_URL = process.env.E2E_CREEM_STUB_URL ?? "http://localhost:4010";

async function buy(page: Page, tier: "rsvp" | "invitations" | "complete") {
  await page.goto("/preise");
  await page.getByTestId(`tier-${tier}`).getByRole("button", { name: "Jetzt kaufen" }).click();
  await expect(page).toHaveURL(new RegExp(`^${STUB_URL}/checkout/ch_`));
  await page.getByRole("button", { name: "Bezahlen" }).click();
  await expect(page).toHaveURL(/\/hochzeiten\/[0-9a-f-]{36}\?kauf=danke/);
}

test.describe("Einladungen and Komplett packages", () => {
  test.use({ allowedHosts: [new URL(STUB_URL).host] });

  test("designing and previewing is free; links, export and sending need the package, and buying activates them", async ({ page, request }) => {
    test.setTimeout(4 * 60_000);
    const email = uniqueEmail("karten-kauf");
    const guestEmail = uniqueEmail("gast");
    const slug = `mia-tom-${Date.now()}`;
    let editorUrl = "";
    let weddingId = "";
    let link = "";
    const cards: Record<string, string> = {};

    await test.step("without a package the couple designs and previews, but links, export and sending lead to /preise", async () => {
      await login(page, email, "Mia");
      editorUrl = await createWebsite(page, slug, "2027-06-12");
      weddingId = weddingIdOf(editorUrl);
      await page.goto(guestsUrl(editorUrl));
      await addHousehold(page, "Familie Kern", [{ name: "Eva" }], undefined, { email: guestEmail });

      cards.saveTheDate = await createCard(page, weddingId, "Save the Date");
      await expect(page.getByTestId("card-editor-locked")).toBeVisible();
      await expect(page.getByTestId("card-preview").getByTestId("card-view")).toBeVisible();
      await page.getByRole("link", { name: "Vorschau mit Umschlag" }).click();
      await page.getByTestId("envelope").click();
      await expect(page.getByTestId("page-card-saveTheDate")).toBeVisible();

      await page.goto(cards.saveTheDate!);
      await expect(page.getByRole("link", { name: "Exportieren" })).toHaveAttribute("href", "/preise");
      const exportUrl = `${cards.saveTheDate!}/export?format=a6`;
      const blocked = await page.request.get(exportUrl, { maxRedirects: 0 });
      expect(blocked.status()).toBe(303);
      expect(blocked.headers().location).toMatch(/\/preise$/);

      await page.goto(guestsUrl(editorUrl));
      await chooseCard(page, "Save the Date");
      await expect(page.getByTestId("card-sending").getByRole("link", { name: "Paket freischalten" })).toHaveAttribute("href", "/preise");
      await expect(household(page, "Familie Kern").getByRole("link", { name: "Link kopieren" })).toHaveAttribute("href", "/preise");

      // Extra versions are paid too: "+ Version" leads to the prices for every item.
      await page.goto(homeUrl(weddingId));
      await expect(page.getByTestId("add-version-locked")).toHaveCount(5);
    });

    await test.step("buying RSVP activates Save the Dates: links and export, but not email sending", async () => {
      await buy(page, "rsvp");
      await page.goto(cards.saveTheDate!);
      await expect(page.getByTestId("card-editor-locked")).toHaveCount(0);
      const downloading = page.waitForEvent("download");
      await page.getByRole("button", { name: "Exportieren" }).click();
      await page.getByRole("menuitem", { name: "PDF (A6)" }).click();
      expect((await downloading).suggestedFilename()).toBe("save-the-date-a6.pdf");

      await page.goto(guestsUrl(editorUrl));
      link = await guestLink(page, "Familie Kern");
      await chooseCard(page, "Save the Date");
      await expect(page.getByTestId("card-sending").getByRole("link", { name: "E-Mail-Versand freischalten" })).toHaveAttribute("href", "/preise");

      // RSVP unlocks extra Save the Dates and websites; the invitation needs Einladungen.
      await page.goto(homeUrl(weddingId));
      for (const name of ["Save the Date", "Hochzeitswebsite"]) await expect(step(page, name).getByTestId("add-version-locked")).toHaveCount(0);
      await expect(step(page, "Einladung").getByTestId("add-version-locked")).toHaveCount(1);
    });

    await test.step("buying Einladungen adds email sending", async () => {
      await buy(page, "invitations");
      await page.goto(guestsUrl(editorUrl));
      await chooseCard(page, "Save the Date");
      await page.getByRole("button", { name: "Per E-Mail an alle senden (1)" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Jetzt senden" }).click();
      const [message] = await waitForMessages(request, guestEmail, "Save the Date von Anna & Ben");
      expect(message!.Text).toContain(link);
      await page.goto(link);
      await page.getByTestId("envelope").click();
      await expect(page.getByTestId("page-card-saveTheDate")).toBeVisible();

      // Einladungen unlocks extra invitations too; the other two need Komplett.
      await page.goto(homeUrl(weddingId));
      for (const name of ["Save the Date", "Einladung", "Hochzeitswebsite"]) await expect(step(page, name).getByTestId("add-version-locked")).toHaveCount(0);
      for (const name of ["Verlobungsanzeige", "Dankeskarte"]) await expect(step(page, name).getByTestId("add-version-locked")).toHaveCount(1);
    });

    await test.step("the thank-you card and the engagement announcement need Komplett", async () => {
      cards.thankYou = await createCard(page, weddingId, "Dankeskarte");
      cards.engagement = await createCard(page, weddingId, "Verlobungsanzeige");
      for (const url of [cards.thankYou, cards.engagement]) {
        await page.goto(url);
        await expect(page.getByTestId("card-editor-locked")).toBeVisible();
      }
      expect((await page.request.get(`/${slug}/verlobung`)).status()).toBe(200);
      await page.goto(`/${slug}/verlobung`);
      await expect(page.getByTestId("engagement-inactive")).toBeVisible();

      await buy(page, "complete");
      for (const url of [cards.thankYou, cards.engagement]) {
        await page.goto(url);
        await expect(page.getByTestId("card-editor-locked")).toHaveCount(0);
      }
      await page.goto(homeUrl(weddingId));
      await expect(page.getByTestId("add-version-locked")).toHaveCount(0);
      await page.goto(`/${slug}/verlobung`);
      await expect(page.getByTestId("envelope")).toContainText("Für euch");
    });
  });
});
