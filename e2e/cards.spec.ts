import { readFile } from "node:fs/promises";
import path from "node:path";
import { unzipSync } from "fflate";
import type { Download, Page } from "@playwright/test";
import { expect, recordForeignRequests, test } from "./fixtures";
import { login, uniqueEmail } from "./helpers/auth";
import { captureWindowOpen, chooseCard, createCard, openedUrls, openEnvelope, saveCard } from "./helpers/cards";
import { createWebsite } from "./helpers/editor";
import { addEvent, addHousehold, daysUntil, guestLink, guestsUrl, household, runGuestJobs, setClockOffset, websiteIdOf } from "./helpers/guests";
import { messageHeaders, messagesFor, waitForMessages } from "./helpers/mailpit";

const PHOTO = path.join(import.meta.dirname, "assets/photo.jpg");
const COUPLE = "Anna & Ben";

async function downloaded(download: Download) {
  return new Uint8Array(await readFile((await download.path())!));
}

/** Width of a PNG, from its IHDR chunk. */
const pngWidth = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset).getUint32(16);

async function exportCard(page: Page, kind: string, format: "PDF (A6)" | "PDF (A5)" | "Bild (PNG)") {
  const item = page.locator(`[data-testid="card-item"][data-kind="${kind}"]`);
  await item.getByRole("button", { name: "Exportieren" }).click();
  const downloading = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: format }).click();
  return downloading;
}

test("Save the Dates, invitations and cards: design, send by link, WhatsApp and email, reminders, opened status, export and data rights", async ({
  page,
  request,
  browser,
  baseURL,
  thirdPartyRequests,
}) => {
  test.setTimeout(8 * 60_000);
  const email = uniqueEmail("karten");
  const slug = `anna-ben-karten-${Date.now()}`;
  const mail = { weber: uniqueEmail("weber"), kern: uniqueEmail("kern") };
  let editorUrl = "";
  let websiteId = "";
  let weberLink = "";
  let kernLink = "";

  // The guests use their own browser, without the couple's session.
  const guestContext = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": "10.201.0.1" } });
  const guestForeign = recordForeignRequests(guestContext, baseURL!);
  const guest = await guestContext.newPage();
  await captureWindowOpen(page);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);

  try {
    await test.step("set up a website, an event, the reply-by date and three households", async () => {
      await login(page, email, "Anna");
      editorUrl = await createWebsite(page, slug, "2027-06-12");
      websiteId = websiteIdOf(`${editorUrl}/`);
      await addEvent(page, editorUrl, "Trauung", "2027-06-12", "14:30");
      await page.goto(guestsUrl(editorUrl));
      await addHousehold(page, "Familie Weber", [{ name: "Clara" }], undefined, { email: mail.weber, personalLine: "Danke für den Kuchen!" });
      await addHousehold(page, "Familie Kern", [{ name: "Eva" }], undefined, { email: mail.kern });
      await addHousehold(page, "Familie Roth", [{ name: "Paul" }]);
      await expect(household(page, "Familie Weber").getByTestId("household-channel")).toHaveText(`E-Mail: ${mail.weber}`);
      await expect(household(page, "Familie Roth").getByTestId("household-channel")).toHaveText("Link oder WhatsApp");
      weberLink = await guestLink(page, "Familie Weber");
      kernLink = await guestLink(page, "Familie Kern");
      await page.getByRole("link", { name: "Einstellungen" }).click();
      const settings = page.getByRole("form", { name: "RSVP-Einstellungen" });
      await settings.getByLabel("Antworten bis").fill("2027-05-01");
      await settings.getByRole("button", { name: "Einstellungen speichern" }).click();
      await expect(page.getByText("Gespeichert").first()).toBeVisible();
    });

    await test.step("the couple designs a Save the Date in another theme, with photo and text, in the live preview", async () => {
      await createCard(page, "Save the Date");
      const preview = page.getByTestId("card-preview").getByTestId("card-view");
      await expect(preview).toHaveAttribute("data-layout", "bogen");
      await page.locator("label").filter({ hasText: /^Bogen$/ }).click();
      await page.locator("label").filter({ hasText: /^Ozean$/ }).click();
      await page.locator("label").filter({ hasText: /^Farbfläche$/ }).click();
      await expect(preview).toHaveAttribute("data-layout", "farbe");
      await page.locator('input[type="file"]').setInputFiles(PHOTO);
      await expect(page.getByRole("img", { name: "Foto" })).toBeVisible();
      await expect(preview.locator('img[src^="/uploads/"]')).toHaveCount(1);
      await page.getByLabel("Text", { exact: true }).fill("Einladung folgt im Frühjahr");
      await expect(preview).toContainText("Einladung folgt im Frühjahr");
      await expect(preview).toContainText("12. Juni 2027");
      await saveCard(page);

      await page.getByRole("link", { name: "Vorschau mit Umschlag" }).click();
      await expect(page.getByTestId("card-preview-note")).toBeVisible();
      await expect(page.getByTestId("envelope")).toContainText("Für Familie Weber");
      await page.getByTestId("envelope").click();
      await expect(page.getByTestId("page-card-saveTheDate")).toContainText("Einladung folgt im Frühjahr");
    });

    await test.step("the other kinds are created from the dashboard and listed in their tabs", async () => {
      await createCard(page, "Einladung");
      await expect(page.getByTestId("card-preview")).toContainText("Wir heiraten");
      await expect(page.getByTestId("card-preview")).toContainText("14:30 Uhr");
      await expect(page.getByTestId("card-preview")).toContainText("Bitte antwortet bis zum 1. Mai 2027");
      await createCard(page, "Dankeskarte");
      await expect(page.getByTestId("card-preview")).toContainText("Von Herzen danke");
      await createCard(page, "Verlobungsanzeige");
      await page.getByLabel("Link zur Website auf der Karte zeigen").check();
      await saveCard(page);
      await page.goto("/dashboard?tab=cards");
      await expect(page.getByTestId("card-item")).toHaveCount(2);
      await page.goto("/dashboard?tab=save-the-dates");
      await expect(page.getByTestId("card-item")).toHaveCount(1);
      await expect(page.getByTestId("card-item").getByTestId("card-view")).toHaveAttribute("data-layout", "farbe");
    });

    await test.step("the Save the Date goes by WhatsApp and by email, as the couple, with the household's own link", async () => {
      await page.goto(guestsUrl(editorUrl));
      await chooseCard(page, "Save the Date");
      await household(page, "Familie Weber").getByRole("button", { name: "WhatsApp" }).click();
      await expect(household(page, "Familie Weber").getByTestId("delivery-status")).toHaveText(/^Per WhatsApp geteilt am/);
      const [whatsapp] = await openedUrls(page);
      expect(whatsapp).toMatch(/^https:\/\/wa\.me\/\?text=/);
      expect(decodeURIComponent(whatsapp!)).toContain(weberLink);

      await page.getByRole("button", { name: "Per E-Mail an alle senden (1)" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Jetzt senden" }).click();
      const [message] = await waitForMessages(request, mail.kern, `Save the Date von ${COUPLE}`);
      expect(message!.From).toEqual({ Name: `${COUPLE} über Traureise`, Address: "no-reply@traureise.localhost" });
      expect(message!.Text).toContain(kernLink);
      expect(message!.Text).not.toContain(weberLink);
      expect(message!.HTML).toContain('src="cid:karte"');
      expect(message!.Inline).toMatchObject([{ ContentType: "image/png" }]);
      const headers = await messageHeaders(request, message!.ID);
      expect(headers["List-Unsubscribe"]?.[0]).toMatch(/^<http:\/\/localhost:3000\/api\/abmelden\/[0-9a-f-]{36}\.[A-Za-z0-9_-]+>$/);
      expect(headers["List-Unsubscribe-Post"]).toEqual(["List-Unsubscribe=One-Click"]);
      await page.reload();
      await expect(household(page, "Familie Kern").getByTestId("delivery-status")).toHaveText(/^Per E-Mail gesendet am/);
      await expect(household(page, "Familie Roth").getByTestId("delivery-status")).toHaveText("Nicht gesendet");
    });

    await test.step("a household opens its link: the envelope, then the Save the Date; that counts as opened", async () => {
      await guest.goto(weberLink);
      await expect(guest.getByTestId("envelope")).toContainText("Für Familie Weber");
      await openEnvelope(guest);
      const card = guest.getByTestId("page-card-saveTheDate");
      await expect(card).toContainText("Einladung folgt im Frühjahr");
      const ics = card.getByRole("link", { name: "Zum Kalender hinzufügen" });
      await expect(ics).toHaveAttribute("href", `/${slug}/hochzeit.ics`);
      expect(await (await guest.request.get(`/${slug}/hochzeit.ics`)).text()).toContain("DTSTART;VALUE=DATE:20270612");
      await expect(card.getByRole("link", { name: "Zur Website" })).toHaveAttribute("href", `/${slug}`);
      await expect(guest.getByRole("button", { name: "Antwort senden" })).toHaveCount(0);

      await page.reload();
      await expect(household(page, "Familie Weber").getByTestId("delivery-status")).toHaveText(/^Geöffnet am/);
      await page.getByTestId("delivery-filter").getByRole("link", { name: "Save the Date nicht geöffnet" }).click();
      await expect(page.getByTestId("household")).toHaveCount(1);
      await expect(household(page, "Familie Kern")).toBeVisible();
      await page.goto("/dashboard?tab=save-the-dates");
      await expect(page.getByTestId("card-counts")).toHaveText("1 von 3 Haushalten geöffnet · 2 gesendet");
    });

    await test.step("later the same link shows the invitation with the response form, and the Save the Date below", async () => {
      await page.goto(guestsUrl(editorUrl));
      await chooseCard(page, "Einladung");
      await page.getByRole("button", { name: "Per E-Mail an alle senden (2)" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Jetzt senden" }).click();
      const [invitation] = await waitForMessages(request, mail.weber, `Einladung zur Hochzeit von ${COUPLE}`);
      expect(invitation!.Text).toContain(weberLink);
      // Emails go out one per second; wait for both before the clock moves later on.
      await waitForMessages(request, mail.kern, `Einladung zur Hochzeit von ${COUPLE}`);

      await guest.goto(weberLink);
      await openEnvelope(guest);
      const cards = guest.locator('[data-testid^="page-card-"]');
      await expect(cards).toHaveCount(2);
      await expect(cards.nth(0)).toHaveAttribute("data-testid", "page-card-invitation");
      await expect(cards.nth(1)).toHaveAttribute("data-testid", "page-card-saveTheDate");
      await guest.getByRole("link", { name: "Zur Antwort" }).click();
      await guest.getByRole("region", { name: "Clara", exact: true }).getByLabel("Ich komme").check();
      await guest.getByRole("button", { name: "Antwort senden" }).click();
      await expect(guest.getByTestId("guest-form-saved")).toBeVisible();
    });

    await test.step("reminders: a button for all open households (email or WhatsApp), and automatic ones at the configured days", async () => {
      await page.goto(guestsUrl(editorUrl));
      await page.getByRole("button", { name: "Erinnerung an alle offenen (2)" }).click();
      const confirm = page.getByRole("alertdialog");
      await expect(confirm).toContainText("1 Haushalt bekommt eine E-Mail.");
      await confirm.getByRole("button", { name: "Erinnern" }).click();
      const list = page.getByRole("dialog", { name: "Per WhatsApp erinnern" });
      await expect(list.getByRole("listitem")).toHaveCount(1);
      await expect(list.getByRole("listitem")).toContainText("Familie Roth");
      await page.keyboard.press("Escape");
      await waitForMessages(request, mail.kern, `Erinnerung: Antwort für die Hochzeit von ${COUPLE}`, 1);

      // 14 days before the reply-by date: only Kern is open and has an address.
      await setClockOffset(page.request, baseURL!, daysUntil("2027-04-17T10:00:00Z"));
      expect((await runGuestJobs(page.request, baseURL!, websiteId)) as unknown).toMatchObject({ reminders: 1 });
      expect((await runGuestJobs(page.request, baseURL!, websiteId)) as unknown).toMatchObject({ reminders: 0 });
      const reminders = await waitForMessages(request, mail.kern, `Erinnerung: Antwort für die Hochzeit von ${COUPLE}`, 2);
      expect(reminders[0]!.Text).toContain(kernLink);
      expect(reminders[0]!.Text).toContain("Bitte antwortet bis zum 1. Mai 2027.");
      expect(await messagesFor(request, mail.weber, "Erinnerung")).toEqual([]);
      await setClockOffset(page.request, baseURL!, 0);
    });

    await test.step("unsubscribing clears the address and stops emails", async () => {
      const [last] = await messagesFor(request, mail.kern, "Erinnerung");
      const stop = /http:\/\/localhost:3000\/abmelden\/\S+/.exec(last!.Text)![0];
      await guest.goto(stop);
      await expect(guest.getByTestId("unsubscribe")).toContainText("Familie Kern");
      await guest.getByRole("button", { name: "Keine E-Mails mehr senden" }).click();
      await expect(guest.getByTestId("unsubscribed")).toContainText("Familie Kern bekommt keine E-Mails mehr");

      // One click from the mail client (List-Unsubscribe-Post), without login.
      const [weberMail] = await messagesFor(request, mail.weber, "Einladung");
      const header = (await messageHeaders(request, weberMail!.ID))["List-Unsubscribe"]![0]!.slice(1, -1);
      expect((await guest.request.post(header, { form: { "List-Unsubscribe": "One-Click" } })).status()).toBe(200);

      await page.goto(guestsUrl(editorUrl));
      await expect(household(page, "Familie Kern").getByTestId("household-channel")).toHaveText("Keine E-Mails gewünscht");
      await expect(household(page, "Familie Weber").getByTestId("household-channel")).toHaveText("Keine E-Mails gewünscht");
      await chooseCard(page, "Dankeskarte");
      await expect(page.getByRole("button", { name: "Per E-Mail an alle senden (0)" })).toBeDisabled();
      await expect(household(page, "Familie Kern").getByRole("button", { name: "E-Mail senden" })).toHaveCount(0);
    });

    await test.step("after the wedding the thank-you card shows first, with the household's personal line", async () => {
      await setClockOffset(page.request, baseURL!, daysUntil("2027-06-14T10:00:00Z"));
      // Months later the session has expired, as it would for the couple.
      await login(page, email);
      await page.goto(guestsUrl(editorUrl));
      await chooseCard(page, "Dankeskarte");
      await household(page, "Familie Weber").getByRole("button", { name: "Link kopieren" }).click();
      await expect(household(page, "Familie Weber").getByTestId("delivery-status")).toHaveText(/^Link kopiert am/);

      await guest.goto(weberLink);
      await openEnvelope(guest);
      const cards = guest.locator('[data-testid^="page-card-"]');
      await expect(cards).toHaveCount(3);
      await expect(cards.nth(0)).toHaveAttribute("data-testid", "page-card-thankYou");
      await expect(cards.nth(0).getByTestId("card-personal-line")).toHaveText("Danke für den Kuchen!");
      await setClockOffset(page.request, baseURL!, 0);
    });

    await test.step("PDF and PNG exports download and contain the card", async () => {
      await page.goto("/dashboard?tab=cards");
      const pdf = await exportCard(page, "thankYou", "PDF (A6)");
      expect(pdf.suggestedFilename()).toBe("dankeskarte-a6.pdf");
      const pdfBytes = await downloaded(pdf);
      expect(new TextDecoder().decode(pdfBytes.slice(0, 5))).toBe("%PDF-");
      expect(new TextDecoder("latin1").decode(pdfBytes)).toContain("/Subtype /Image");
      const a5 = await exportCard(page, "thankYou", "PDF (A5)");
      expect(a5.suggestedFilename()).toBe("dankeskarte-a5.pdf");
      const png = await exportCard(page, "engagement", "Bild (PNG)");
      expect(png.suggestedFilename()).toBe("verlobung.png");
      const pngBytes = await downloaded(png);
      expect([...pngBytes.slice(1, 4)]).toEqual([0x50, 0x4e, 0x47]);
      expect(pngWidth(pngBytes)).toBe(1748);
    });

    await test.step("the engagement announcement is one link for everyone, with a general greeting", async () => {
      const url = (await page.locator('[data-testid="card-item"][data-kind="engagement"]').getByTestId("card-public-url").getAttribute("href"))!;
      expect(url).toBe(`http://localhost:3000/${slug}/verlobung`);
      await guest.goto(`/${slug}/verlobung`);
      await expect(guest.getByTestId("envelope")).toContainText("Für euch");
      await guest.getByTestId("envelope").click();
      await expect(guest.getByTestId("page-card-engagement")).toContainText("Wir haben uns verlobt");
      await expect(guest.getByTestId("page-card-engagement")).toContainText(`localhost:3000/${slug}`);
    });

    await test.step("the account export contains cards, addresses, personal lines and statuses", async () => {
      await page.goto("/konto");
      const downloading = page.waitForEvent("download");
      await page.getByRole("link", { name: "ZIP-Datei herunterladen" }).click();
      const files = unzipSync(await downloaded(await downloading));
      const website = JSON.parse(new TextDecoder().decode(files["data.json"])).websites[0];
      expect(website.cards.map((c: { kind: string }) => c.kind).sort()).toEqual(["engagement", "invitation", "saveTheDate", "thankYou"]);
      const std = website.cards.find((c: { kind: string }) => c.kind === "saveTheDate");
      expect(std.themeId).toBe("bogen");
      expect(std.photo).toMatch(/^images\//);
      expect(std.deliveries.find((d: { household: string }) => d.household === "Familie Weber")).toMatchObject({ sharedVia: "whatsapp" });
      expect(std.deliveries.find((d: { household: string }) => d.household === "Familie Weber").openedAt).toBeTruthy();
      const weber = website.guests.households.find((h: { name: string }) => h.name === "Familie Weber");
      expect(weber).toMatchObject({ email: null, personalLine: "Danke für den Kuchen!" });
      expect(weber.unsubscribedAt).toBeTruthy();
    });

    await test.step("retention removes the guest data with addresses, personal lines and statuses; the designs stay", async () => {
      await setClockOffset(page.request, baseURL!, daysUntil("2028-06-13T00:00:00Z") + 1);
      expect((await runGuestJobs(page.request, baseURL!, websiteId)).deleted).toEqual([websiteId]);
      expect((await guest.request.get(weberLink)).status()).toBe(404);
      await setClockOffset(page.request, baseURL!, 0);
      await page.goto("/konto");
      const downloading = page.waitForEvent("download");
      await page.getByRole("link", { name: "ZIP-Datei herunterladen" }).click();
      const website = JSON.parse(new TextDecoder().decode(unzipSync(await downloaded(await downloading))["data.json"])).websites[0];
      expect(website.guests.households).toEqual([]);
      expect(website.cards).toHaveLength(4);
      for (const card of website.cards) expect(card.deliveries).toEqual([]);
      expect(JSON.stringify(website)).not.toContain("Danke für den Kuchen!");
    });

    await test.step("deleting the account removes the cards too", async () => {
      await page.goto("/konto");
      const panel = page.getByTestId("account-delete");
      await panel.getByLabel("Gib zur Bestätigung deine E-Mail-Adresse ein").fill(email);
      await panel.getByRole("button", { name: "Konto endgültig löschen" }).click();
      await expect(page).toHaveURL(/\/\?konto=geloescht$/);
      expect((await guest.request.get(`/${slug}/verlobung`)).status()).toBe(404);
    });
  } finally {
    await setClockOffset(page.request, baseURL!, 0);
    await guestContext.close();
    thirdPartyRequests.push(...guestForeign);
  }
});
