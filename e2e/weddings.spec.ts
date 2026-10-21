import type { Page } from "@playwright/test";
import { expect, recordForeignRequests, test } from "./fixtures";
import { login, uniqueEmail } from "./helpers/auth";
import { captureWindowOpen, chooseCard, openEnvelope, saveCard } from "./helpers/cards";
import { addHousehold, guestLink, household } from "./helpers/guests";
import { waitForMessages } from "./helpers/mailpit";
import { createWedding, guestsUrl, homeUrl, openWebsiteEditor, publishWebsite, setWeddingSlug, setWebsiteSlug, step } from "./helpers/weddings";

/** Nothing sticks out of the box of `container` (the share dialog) and the page has no horizontal scroll. */
async function expectFits(page: Page, selector: string) {
  const overflow = await page.evaluate((sel) => {
    const box = document.querySelector(sel)!.getBoundingClientRect();
    const out = [...document.querySelectorAll(`${sel} *`)].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && (r.left < box.left - 1 || r.right > box.right + 1);
    });
    return { elements: out.map((el) => el.outerHTML.slice(0, 80)), scroll: document.documentElement.scrollWidth - window.innerWidth };
  }, selector);
  expect(overflow.elements).toEqual([]);
  expect(overflow.scroll).toBeLessThanOrEqual(0);
}

test("a couple creates their wedding, gets every item, adds versions, chooses who gets which, and sends each household its own", async ({ page, browser, baseURL, request, thirdPartyRequests }) => {
  test.setTimeout(6 * 60_000);
  const email = uniqueEmail("hochzeit");
  const slug = `marcel-sybille-${Date.now()}`;
  const mail = { weber: uniqueEmail("weber"), kern: uniqueEmail("kern") };
  let weddingId = "";
  let familyUrl = "";
  const guestContext = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": "10.202.0.1" } });
  const guestForeign = recordForeignRequests(guestContext, baseURL!);
  const guest = await guestContext.newPage();
  await captureWindowOpen(page);

  try {
    await test.step("after the first login the couple creates the wedding: names, whether there is a date, the date", async () => {
      await login(page, email, "Marcel");
      await expect(page).toHaveURL(/\/hochzeiten\/neu$/);
      const form = page.getByRole("form", { name: "Eure Hochzeit" });
      // Without a date, no date field.
      await form.getByLabel("Noch nicht").check();
      await expect(form.getByLabel("Hochzeitsdatum")).toHaveCount(0);
      weddingId = await createWedding(page, { names: "Marcel & Sybille", date: "2027-10-31" });
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Schön, dass ihr wieder da seid, Marcel & Sybille");
      await expect(page.getByText("Wir wünschen euch, dass bis zum großen Tag alles ganz entspannt läuft.")).toBeVisible();
      await expect(page.getByTestId("wedding-badge")).toContainText(/Noch \d+ Tage · 31\. Oktober 2027/);
    });

    await test.step("one first version of every item exists, in the order a couple needs them; nothing is public yet", async () => {
      const steps = page.getByTestId("timeline-step");
      await expect(steps.locator("h2")).toHaveText(["Verlobungsanzeige", "Save the Date", "Hochzeitswebsite", "Einladung", "Dankeskarte"]);
      await expect(steps.first()).toHaveAttribute("data-state", "now");
      await expect(steps.first().getByRole("link", { name: "Weitermachen" })).toBeVisible();
      for (const name of ["Save the Date", "Einladung", "Dankeskarte"]) await expect(step(page, name).getByTestId("version-chips")).toContainText("Standard");
      await expect(step(page, "Hochzeitswebsite").getByTestId("step-status")).toHaveText("Entwurf · noch nicht veröffentlicht");
      // The wedding's tabs; a tab stays current on its subpages.
      await expect(page.getByTestId("wedding-tabs").getByRole("link")).toHaveText(["Vorbereitung", "Hochzeit", "Gästeliste", "Ablauf"]);
      await expect(page.getByTestId("tab-preparation")).toHaveAttribute("aria-current", "page");
      await page.getByTestId("tab-guests").click();
      await page.getByTestId("guest-tabs").getByRole("link", { name: "Einstellungen" }).click();
      await expect(page.getByTestId("tab-guests")).toHaveAttribute("aria-current", "page");
      await expect(page.getByTestId("tab-preparation")).not.toHaveAttribute("aria-current", "page");

      await setWeddingSlug(page, weddingId, slug);
      expect((await request.get(`/${slug}`)).status()).toBe(404);
      const editorUrl = await openWebsiteEditor(page, weddingId);
      await expect(page.getByTestId("site-preview").getByTestId("site-title")).toHaveText("Marcel & Sybille");
      await setWebsiteSlug(page, editorUrl, slug);
      await publishWebsite(page, editorUrl);
      expect((await request.get(`/${slug}`)).status()).toBe(200);
    });

    await test.step("the share dialog fits on desktop and on a phone", async () => {
      await page.goto(homeUrl(weddingId));
      await step(page, "Verlobungsanzeige").getByRole("button", { name: "Teilen" }).click();
      await expect(page.getByTestId("share-qr")).toBeVisible();
      await expectFits(page, '[data-testid="share-dialog"]');
      await page.setViewportSize({ width: 360, height: 740 });
      await expectFits(page, '[data-testid="share-dialog"]');
      await page.keyboard.press("Escape");
      await expectFits(page, "body");
      await page.setViewportSize({ width: 1280, height: 720 });
    });

    await test.step("a second Save the Date for the family, and a second website for friends", async () => {
      await page.goto(homeUrl(weddingId));
      await step(page, "Save the Date").getByRole("button", { name: "+ Version" }).click();
      let dialog = page.getByRole("dialog", { name: "Neue Version: Save the Date" });
      await dialog.getByLabel("Name der Version").fill("Familie");
      await dialog.getByRole("button", { name: "Version anlegen" }).click();
      await expect(page).toHaveURL(/\/karten\/[0-9a-f-]{36}$/);
      familyUrl = new URL(page.url()).pathname;
      // In the editor one menu names the version and switches, adds, renames and deletes versions.
      await expect(page.getByTestId("version-menu")).toHaveText("Familie");
      await page.getByTestId("version-menu").click();
      await expect(page.getByRole("menuitem", { name: "Standard" })).not.toHaveAttribute("aria-current");
      await expect(page.getByRole("menuitem", { name: "Familie" })).toHaveAttribute("aria-current", "page");
      await page.keyboard.press("Escape");
      await page.getByLabel("Text", { exact: true }).fill("Für die ganze Familie");
      // "Speichern und schließen" saves and goes back to the wedding.
      await page.getByRole("button", { name: "Weitere Speicher-Optionen" }).click();
      await page.getByRole("menuitem", { name: "Speichern und schließen" }).click();
      await expect(page).toHaveURL(new RegExp(`${homeUrl(weddingId)}$`));
      await page.goto(familyUrl);
      await expect(page.getByLabel("Text", { exact: true })).toHaveValue("Für die ganze Familie");
      await saveCard(page);

      await page.goto(homeUrl(weddingId));
      await step(page, "Hochzeitswebsite").getByRole("button", { name: "+ Version" }).click();
      dialog = page.getByRole("dialog", { name: "Neue Version: Hochzeitswebsite" });
      await dialog.getByLabel("Name der Version").fill("Freunde");
      await dialog.getByRole("button", { name: "Version anlegen" }).click();
      await expect(page).toHaveURL(/\/website\/[0-9a-f-]{36}$/);
      // A new version is a draft with its own address.
      await expect(page.getByTestId("publish-control")).toHaveAttribute("data-published", "false");
      expect((await request.get(`/${slug}-freunde`)).status()).toBe(404);
      await publishWebsite(page, new URL(page.url()).pathname);
      expect((await request.get(`/${slug}-freunde`)).status()).toBe(200);
      await page.getByTestId("version-menu").click();
      await page.getByRole("menuitem", { name: "Umbenennen" }).click();
      dialog = page.getByRole("dialog", { name: "Version umbenennen" });
      await dialog.getByLabel("Name der Version").fill("Freundeskreis");
      await dialog.getByRole("button", { name: "Speichern" }).click();
      await expect(page.getByTestId("version-menu")).toHaveText("Freundeskreis");

      await page.goto(homeUrl(weddingId));
      await expect(step(page, "Save the Date").getByTestId("version-chips").getByRole("link")).toHaveText(["Standard", "Familie"]);
      await expect(step(page, "Hochzeitswebsite").getByTestId("step-status")).toHaveText("2 Versionen veröffentlicht");
    });

    await test.step("on the guest list each household gets one version per item", async () => {
      await page.goto(guestsUrl(weddingId));
      await addHousehold(page, "Familie Weber", [{ name: "Clara" }], undefined, { email: mail.weber });
      await addHousehold(page, "Familie Kern", [{ name: "Eva" }], undefined, { email: mail.kern });
      const versions = household(page, "Familie Weber").getByTestId("household-versions");
      // Only items with more than one version are offered.
      await expect(versions.getByRole("combobox")).toHaveCount(2);
      await versions.getByLabel("Save the Date").selectOption({ label: "Familie" });
      await expect(page.getByText("Version für Familie Weber gespeichert")).toBeVisible();
      await versions.getByLabel("Hochzeitswebsite").selectOption({ label: "Freundeskreis" });
      await page.reload();
      await expect(household(page, "Familie Weber").getByTestId("household-versions").getByLabel("Save the Date")).toHaveValue(/[0-9a-f-]{36}/);
      await expect(household(page, "Familie Weber").getByTestId("household-versions").getByLabel("Save the Date").locator("option:checked")).toHaveText("Familie");
    });

    await test.step("sending gives every household its assigned version, linking its assigned website", async () => {
      await chooseCard(page, "Save the Date");
      await page.getByRole("button", { name: "Per E-Mail an alle senden (2)" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Jetzt senden" }).click();
      await waitForMessages(request, mail.weber, "Save the Date von Marcel & Sybille");
      await waitForMessages(request, mail.kern, "Save the Date von Marcel & Sybille");
      await page.reload();
      await expect(household(page, "Familie Weber").getByTestId("delivery-status")).toHaveText(/^Familie · Per E-Mail gesendet am/);

      const weberLink = await guestLink(page, "Familie Weber");
      const kernLink = await guestLink(page, "Familie Kern");
      await guest.goto(weberLink);
      await openEnvelope(guest);
      await expect(guest.getByTestId("page-card-saveTheDate")).toContainText("Für die ganze Familie");
      await expect(guest.getByRole("link", { name: "Zur Website" })).toHaveAttribute("href", `/${slug}-freunde`);
      await guest.goto(kernLink);
      await openEnvelope(guest);
      await expect(guest.getByTestId("page-card-saveTheDate")).not.toContainText("Für die ganze Familie");
      await expect(guest.getByRole("link", { name: "Zur Website" })).toHaveAttribute("href", `/${slug}`);

      await page.goto(homeUrl(weddingId));
      await expect(step(page, "Save the Date")).toHaveAttribute("data-state", "done");
      await expect(step(page, "Save the Date").getByTestId("step-status")).toHaveText("2 von 2 Haushalten geöffnet · 2 gesendet");
    });

    await test.step("re-assigning sends nothing again; deleting a version moves its households to the first and keeps their status", async () => {
      await page.goto(`${guestsUrl(weddingId)}?karte=saveTheDate`);
      await household(page, "Familie Kern").getByTestId("household-versions").getByLabel("Save the Date").selectOption({ label: "Familie" });
      await expect(page.getByText("Version für Familie Kern gespeichert")).toBeVisible();
      // Kern already got a Save the Date: it is not sent again, its page shows the new version.
      await expect(page.getByRole("button", { name: "Per E-Mail an alle senden (0)" })).toBeDisabled();
      await expect(household(page, "Familie Kern").getByTestId("delivery-status")).toHaveText(/^Familie · Per E-Mail gesendet am/);
      await guest.goto(await guestLink(page, "Familie Kern"));
      await openEnvelope(guest);
      await expect(guest.getByTestId("page-card-saveTheDate")).toContainText("Für die ganze Familie");
      await page.goto(familyUrl);
      await page.getByTestId("version-menu").click();
      await page.getByRole("menuitem", { name: "Version löschen" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Endgültig löschen" }).click();
      await expect(page).toHaveURL(new RegExp(`${homeUrl(weddingId)}$`));
      await expect(step(page, "Save the Date").getByTestId("version-chips").getByRole("link")).toHaveText(["Standard"]);
      await page.goto(`${guestsUrl(weddingId)}?karte=saveTheDate`);
      await expect(household(page, "Familie Weber").getByTestId("delivery-status")).toHaveText(/^Per E-Mail gesendet am/);
      await expect(household(page, "Familie Weber").getByTestId("household-versions").getByRole("combobox")).toHaveCount(1);
      const page2 = await guestLink(page, "Familie Weber");
      await guest.goto(page2);
      await openEnvelope(guest);
      await expect(guest.getByTestId("page-card-saveTheDate")).not.toContainText("Für die ganze Familie");
      // The last version of an item cannot be deleted.
      await page.goto(homeUrl(weddingId));
      await step(page, "Save the Date").getByRole("link", { name: "Öffnen" }).click();
      await expect(page.getByRole("button", { name: "Version löschen" })).toHaveCount(0);
    });

    await test.step("one person in one go; the engagement goes through the guest list; cards sent elsewhere are marked by hand", async () => {
      await page.goto(guestsUrl(weddingId));
      const quick = page.getByRole("form", { name: "Gäste hinzufügen" });
      await quick.getByLabel("Name").fill("Tante Erika");
      await quick.getByRole("button", { name: "Person hinzufügen" }).click();
      await expect(household(page, "Tante Erika")).toContainText("1 Person: Tante Erika");

      await chooseCard(page, "Verlobungsanzeige");
      await expect(page.getByTestId("card-sending-counts")).toHaveText("0 von 3 Haushalten geöffnet · 0 gesendet");
      const erika = household(page, "Tante Erika");
      // Marking by hand is in the household's menu.
      await erika.getByRole("button", { name: "Weitere Aktionen für Tante Erika" }).click();
      await page.getByRole("menuitem", { name: "Als gesendet markieren" }).click();
      await expect(erika.getByTestId("delivery-status")).toHaveText(/^Als gesendet markiert am/);
      await erika.getByRole("button", { name: "Weitere Aktionen für Tante Erika" }).click();
      await page.getByRole("menuitem", { name: "Doch nicht gesendet" }).click();
      await expect(erika.getByTestId("delivery-status")).toHaveText("Nicht gesendet");
      await page.getByRole("button", { name: "Alle als gesendet markieren (3)" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Als gesendet markieren" }).click();
      await expect(page.getByTestId("card-sending-counts")).toHaveText("0 von 3 Haushalten geöffnet · 3 gesendet");
      await expect(page.getByRole("button", { name: "Alle als gesendet markieren (0)" })).toBeDisabled();

      // Marked as sent, the card is on the household's own page, and the timeline moves on.
      await guest.goto(await guestLink(page, "Tante Erika"));
      await openEnvelope(guest);
      await expect(guest.getByTestId("page-card-engagement")).toContainText("Wir haben uns verlobt");
      await page.goto(homeUrl(weddingId));
      await expect(step(page, "Verlobungsanzeige")).toHaveAttribute("data-state", "done");
    });

    await test.step("a second wedding, not planned yet: its Save the Date and invitation wait for a date", async () => {
      await page.goto(homeUrl(weddingId));
      await page.getByRole("button", { name: "Hochzeit wechseln" }).click();
      await page.getByRole("menuitem", { name: "Neue Hochzeit" }).click();
      await expect(page).toHaveURL(/\/hochzeiten\/neu$/);
      const second = await createWedding(page, { names: "Lena & Jo", date: null });
      await expect(page.getByTestId("wedding-badge")).toHaveText("Datum noch offen");
      for (const name of ["Save the Date", "Einladung"]) await expect(step(page, name).getByTestId("step-status")).toHaveText("Entwurf · wartet auf euer Datum");
      await step(page, "Save the Date").getByRole("link", { name: "Öffnen" }).click();
      await expect(page.getByTestId("card-waits-for-date")).toBeVisible();
      await expect(page.getByTestId("card-preview")).toContainText("Datum folgt");
      await page.goto(guestsUrl(second));
      await addHousehold(page, "Familie Roth", [{ name: "Paul" }]);
      await chooseCard(page, "Save the Date");
      await expect(page.getByTestId("card-waits-for-date")).toBeVisible();
      await expect(household(page, "Familie Roth").getByRole("button", { name: "WhatsApp" })).toHaveCount(0);

      // The switcher lists the other wedding; /dashboard opens the one used last.
      await page.goto(homeUrl(second));
      await page.getByRole("button", { name: "Hochzeit wechseln" }).click();
      await expect(page.getByRole("menuitem", { name: "Marcel & Sybille" })).toBeVisible();
      await page.keyboard.press("Escape");
      await page.goto("/dashboard");
      await expect(page).toHaveURL(new RegExp(`${homeUrl(second)}$`));
      await page.goto("/hochzeiten");
      await expect(page.getByTestId("wedding").locator("h2")).toHaveText(["Marcel & Sybille", "Lena & Jo"]);
    });
  } finally {
    await guestContext.close();
    thirdPartyRequests.push(...guestForeign);
  }
});
