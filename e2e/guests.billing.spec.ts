import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "./fixtures";
import { login, uniqueEmail } from "./helpers/auth";
import { createWebsite } from "./helpers/editor";
import { addHousehold, daysUntil, guestLink, guestsUrl, household, runGuestJobs, setClockOffset, websiteIdOf } from "./helpers/guests";

const STUB_URL = process.env.E2E_CREEM_STUB_URL ?? "http://localhost:4010";

async function latestCheckout(request: APIRequestContext) {
  return ((await (await request.get(`${STUB_URL}/test/checkouts/latest`)).json()) as { id: string }).id;
}

test.describe("RSVP package", () => {
  test.use({ allowedHosts: [new URL(STUB_URL).host] });

  test("setting up guests is free, sending needs the RSVP package; a refund stops the links and keeps the data until the end", async ({ page, request, baseURL }) => {
    test.setTimeout(3 * 60_000);
    const email = uniqueEmail("rsvp-kauf");
    let editorUrl = "";
    let link = "";

    await test.step("without the package the couple prepares everything, but links and sharing lead to /preise", async () => {
      await login(page, email, "Lea");
      editorUrl = await createWebsite(page, `lea-${Date.now()}`, "2027-06-12");
      await page.goto(guestsUrl(editorUrl));
      await expect(page.getByTestId("rsvp-locked")).toBeVisible();
      await addHousehold(page, "Familie Kern", [{ name: "Eva" }, { name: "Paul" }]);
      const kern = household(page, "Familie Kern");
      await expect(kern.getByRole("button", { name: "Link kopieren" })).toHaveCount(0);
      await expect(kern.getByRole("link", { name: "Link kopieren" })).toHaveAttribute("href", "/preise");
      await expect(kern.getByRole("link", { name: "WhatsApp" })).toHaveAttribute("href", "/preise");
      await expect(page.locator("body")).not.toContainText("/antwort/");

      await page.getByRole("link", { name: "Vorschau" }).click();
      await expect(page.getByTestId("guest-form-preview").getByRole("heading", { level: 1, name: "Hallo Familie Kern!" })).toBeVisible();
      await page.getByRole("link", { name: "Einstellungen" }).click();
      await expect(page.getByText("E-Mails verschicken wir, sobald das RSVP-Paket aktiv ist.")).toBeVisible();
    });

    await test.step("buying RSVP through the checkout activates the links", async () => {
      await page.getByRole("link", { name: "Übersicht" }).click();
      await page.getByTestId("rsvp-locked").getByRole("link", { name: "RSVP-Paket ansehen" }).click();
      await expect(page).toHaveURL(/\/preise$/);
      await page.getByTestId("tier-rsvp").getByRole("button", { name: "Jetzt kaufen" }).click();
      await expect(page).toHaveURL(new RegExp(`^${STUB_URL}/checkout/ch_`));
      await page.getByRole("button", { name: "Bezahlen" }).click();
      await expect(page).toHaveURL(/\/dashboard\?kauf=danke/);

      await page.goto(guestsUrl(editorUrl));
      await expect(page.getByTestId("rsvp-locked")).toHaveCount(0);
      link = await guestLink(page, "Familie Kern");
      await page.goto(link);
      await page.getByRole("region", { name: "Eva", exact: true }).getByLabel("Ich komme").check();
      await page.getByRole("region", { name: "Paul", exact: true }).getByLabel("Ich kann leider nicht").check();
      await page.getByRole("button", { name: "Antwort senden" }).click();
      await expect(page.getByTestId("guest-form-saved")).toBeVisible();
    });

    await test.step("a refund stops the links at once, but the answers stay", async () => {
      const refund = await request.post(`${STUB_URL}/test/checkouts/${await latestCheckout(request)}/refund`);
      expect(((await refund.json()) as { body: { outcome: string } }).body.outcome).toBe("applied");
      await page.goto(link);
      await expect(page.getByTestId("guest-link-inactive")).toContainText("Dieser Link ist noch nicht aktiv");
      await expect(page.getByText("Eva")).toHaveCount(0);

      await page.goto(guestsUrl(editorUrl));
      await expect(page.getByTestId("rsvp-locked")).toBeVisible();
      await expect(household(page, "Familie Kern").getByTestId("household-status")).toHaveText("Geantwortet");
      await expect(page.getByTestId("count-coming")).toHaveText("1");
    });

    await test.step("at the regular end date the guest data is deleted", async () => {
      const websiteId = websiteIdOf(`${editorUrl}/`);
      try {
        await setClockOffset(page.request, baseURL!, daysUntil("2028-06-13T00:00:00Z") + 1);
        expect((await runGuestJobs(page.request, baseURL!, websiteId)).deleted).toEqual([websiteId]);
        expect((await page.request.get(link)).status()).toBe(404);
        await login(page, email);
        await page.goto(guestsUrl(editorUrl));
        await expect(page.getByTestId("guests-empty")).toBeVisible();
      } finally {
        await setClockOffset(page.request, baseURL!, 0);
      }
    });
  });
});
