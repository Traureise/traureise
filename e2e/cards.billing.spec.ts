import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { login, uniqueEmail } from "./helpers/auth";
import { chooseCard, createCard } from "./helpers/cards";
import { createWebsite } from "./helpers/editor";
import { addHousehold, guestLink, guestsUrl, household } from "./helpers/guests";
import { waitForMessages } from "./helpers/mailpit";

const STUB_URL = process.env.E2E_CREEM_STUB_URL ?? "http://localhost:4010";

async function buy(page: Page, tier: "invitations" | "complete") {
  await page.goto("/preise");
  await page.getByTestId(`tier-${tier}`).getByRole("button", { name: "Jetzt kaufen" }).click();
  await expect(page).toHaveURL(new RegExp(`^${STUB_URL}/checkout/ch_`));
  await page.getByRole("button", { name: "Bezahlen" }).click();
  await expect(page).toHaveURL(/\/dashboard\?kauf=danke/);
}

test.describe("Einladungen and Komplett packages", () => {
  test.use({ allowedHosts: [new URL(STUB_URL).host] });

  test("designing and previewing is free; links, export and sending need the package, and buying activates them", async ({ page, request }) => {
    test.setTimeout(4 * 60_000);
    const email = uniqueEmail("karten-kauf");
    const guestEmail = uniqueEmail("gast");
    const slug = `mia-tom-${Date.now()}`;
    let editorUrl = "";
    let link = "";

    await test.step("without a package the couple designs and previews, but links, export and sending lead to /preise", async () => {
      await login(page, email, "Mia");
      editorUrl = await createWebsite(page, slug, "2027-06-12");
      await page.goto(guestsUrl(editorUrl));
      await addHousehold(page, "Familie Kern", [{ name: "Eva" }], undefined, { email: guestEmail });

      await createCard(page, "Save the Date");
      await expect(page.getByTestId("card-editor-locked")).toBeVisible();
      await expect(page.getByTestId("card-preview").getByTestId("card-view")).toBeVisible();
      await page.getByRole("link", { name: "Vorschau mit Umschlag" }).click();
      await page.getByTestId("envelope").click();
      await expect(page.getByTestId("page-card-saveTheDate")).toBeVisible();

      await page.goto("/dashboard?tab=save-the-dates");
      const item = page.getByTestId("card-item");
      await expect(item.getByTestId("card-locked")).toBeVisible();
      await expect(item.getByRole("link", { name: "Teilen" })).toHaveAttribute("href", "/preise");
      await expect(item.getByRole("link", { name: "Exportieren" })).toHaveAttribute("href", "/preise");
      const exportUrl = `${editorUrl.replace(/\/edit$/, "")}/karten/save-the-date/export?format=a6`;
      const blocked = await page.request.get(exportUrl, { maxRedirects: 0 });
      expect(blocked.status()).toBe(303);
      expect(blocked.headers().location).toMatch(/\/preise$/);

      await page.goto(guestsUrl(editorUrl));
      await chooseCard(page, "Save the Date");
      await expect(page.getByTestId("card-sending").getByRole("link", { name: "Paket freischalten" })).toHaveAttribute("href", "/preise");
      await expect(household(page, "Familie Kern").getByRole("link", { name: "Link kopieren" })).toHaveAttribute("href", "/preise");
    });

    await test.step("buying Einladungen activates Save the Dates: links, export and email sending", async () => {
      await buy(page, "invitations");
      await page.goto("/dashboard?tab=save-the-dates");
      await expect(page.getByTestId("card-item").getByTestId("card-locked")).toHaveCount(0);
      const downloading = page.waitForEvent("download");
      await page.getByTestId("card-item").getByRole("button", { name: "Exportieren" }).click();
      await page.getByRole("menuitem", { name: "PDF (A6)" }).click();
      expect((await downloading).suggestedFilename()).toBe("save-the-date-a6.pdf");

      await page.goto(guestsUrl(editorUrl));
      link = await guestLink(page, "Familie Kern");
      await chooseCard(page, "Save the Date");
      await page.getByRole("button", { name: "Per E-Mail an alle senden (1)" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Jetzt senden" }).click();
      const [message] = await waitForMessages(request, guestEmail, "Save the Date von Anna & Ben");
      expect(message!.Text).toContain(link);
      await page.goto(link);
      await page.getByTestId("envelope").click();
      await expect(page.getByTestId("page-card-saveTheDate")).toBeVisible();
    });

    await test.step("the thank-you card and the engagement announcement need Komplett", async () => {
      await createCard(page, "Dankeskarte");
      await createCard(page, "Verlobungsanzeige");
      for (const tab of ["engagement", "thank-you"]) {
        await page.goto(`/dashboard?tab=${tab}`);
        await expect(page.getByTestId("card-locked")).toHaveCount(1);
      }
      expect((await page.request.get(`/${slug}/verlobung`)).status()).toBe(200);
      await page.goto(`/${slug}/verlobung`);
      await expect(page.getByTestId("engagement-inactive")).toBeVisible();

      await buy(page, "complete");
      for (const tab of ["engagement", "thank-you"]) {
        await page.goto(`/dashboard?tab=${tab}`);
        await expect(page.getByTestId("card-item").getByTestId("card-locked")).toHaveCount(0);
      }
      await page.goto(`/${slug}/verlobung`);
      await expect(page.getByTestId("envelope")).toContainText("Für euch");
    });
  });
});
