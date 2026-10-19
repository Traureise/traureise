import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { login, uniqueEmail } from "./helpers/auth";
import { addItem, fillForm, openSection } from "./helpers/editor";
import { createWeddingWithWebsite } from "./helpers/weddings";

const PHOTO = path.join(import.meta.dirname, "assets/photo.jpg");

/** Opens the "new item" form, fills it and submits, leaving the form open (for error cases). */
async function submitNewItem(page: Page, values: Parameters<typeof fillForm>[1]): Promise<Locator> {
  await page.getByRole("button", { name: "Hinzufügen" }).click();
  const form = page.getByRole("form", { name: "Neuer Eintrag" });
  await fillForm(form, values);
  await form.getByRole("button", { name: "Speichern" }).click();
  return form;
}

/** The error shown under a field: the element its aria-describedby points to. */
async function fieldError(form: Locator, label: string): Promise<Locator> {
  const id = await form.getByLabel(label, { exact: true }).getAttribute("aria-describedby");
  return form.locator(`[id="${id}"]`);
}

test("every editor field reaches the public website, and invalid input explains itself", async ({ page }) => {
  test.setTimeout(4 * 60_000);
  const slug = `clara-und-dev-${Date.now()}`;
  const preview = page.getByTestId("site-preview");
  let editorUrl = "";

  await test.step("log in and create a website", async () => {
    await login(page, uniqueEmail("clara"), "Clara");
    ({ editorUrl } = await createWeddingWithWebsite(page, slug, { names: "Clara & Dev" }));
  });

  await test.step("wedding details: names are required; the time zone is the wedding's", async () => {
    await openSection(page, editorUrl, "Startseite");
    await page.getByTestId("home-wedding-details").getByRole("button", { name: "Angaben ändern" }).click();
    const details = page.getByRole("dialog", { name: "Eure Hochzeit" });
    await details.getByLabel("Eure Namen").fill(" ");
    await details.getByLabel("Adresse eurer Hochzeit").fill("konto");
    await details.getByRole("button", { name: "Speichern" }).click();
    await expect(details.getByText("Bitte fülle dieses Feld aus.")).toBeVisible();
    await expect(details.getByText("Diese Adresse ist für Traureise reserviert.")).toBeVisible();
    await details.getByLabel("Eure Namen").fill("Clara & Dev");
    await details.getByLabel("Adresse eurer Hochzeit").fill(slug);
    await details.getByLabel("Zeitzone").selectOption("Europe/London");
    await details.getByRole("button", { name: "Speichern" }).click();
    await expect(details).toBeHidden();
  });

  await test.step("home: invalid input shows errors next to the fields", async () => {
    await page.getByLabel("Hashtag").fill("#clara und dev");
    await page.getByLabel("Webadresse dieser Version").fill("dashboard");
    await page.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByText("Ein Hashtag darf nur Buchstaben, Ziffern und Unterstriche enthalten.")).toBeVisible();
    await expect(page.getByText("Diese Adresse ist für Traureise reserviert.")).toBeVisible();

    await page.getByLabel("Webadresse dieser Version").fill("Clara Und Dev");
    await page.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByText("Nur Kleinbuchstaben, Ziffern und einzelne Bindestriche (z. B. anna-und-ben).")).toBeVisible();
  });

  await test.step("home: web address and cover image upload errors", async () => {
    await page.getByLabel("Hashtag").fill("#claraunddev");
    await page.getByLabel("Webadresse dieser Version").fill(`${slug}-neu`);
    await page.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByRole("link", { name: "Öffentliche Seite öffnen" })).toHaveAttribute("href", `/${slug}-neu`);
    await expect(page.getByText("Diese Adresse ist für Traureise reserviert.")).toHaveCount(0);

    // The old address is now only the wedding's, which shows its first online version.
    expect((await page.request.get(`/${slug}-neu`)).status()).toBe(200);
    expect((await page.request.get(`/${slug}`)).status()).toBe(200);
    expect((await page.request.get(`/${slug}-frei`)).status()).toBe(404);

    // Reload: the saved values come back from the server.
    await page.reload();
    await expect(page.getByLabel("Webadresse dieser Version")).toHaveValue(`${slug}-neu`);

    const upload = page.locator('input[type="file"]');
    await upload.setInputFiles({ name: "notizen.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7") });
    await expect(page.getByText("Bitte lade ein Bild hoch (JPG, PNG, WebP, GIF oder AVIF).")).toBeVisible();
    await upload.setInputFiles({ name: "kaputt.png", mimeType: "image/png", buffer: Buffer.from("not really a png") });
    await expect(page.getByText("Dieses Bild konnte nicht gelesen werden.")).toBeVisible();
    await upload.setInputFiles({ name: "riesig.jpg", mimeType: "image/jpeg", buffer: Buffer.alloc(10 * 1024 * 1024 + 1) });
    await expect(page.getByText("Das Bild ist größer als 10 MB.")).toBeVisible();
    await expect(preview.locator("img.site-cover")).toHaveCount(0);
  });

  await test.step("schedule: image, multi-day end, website, and validation errors", async () => {
    await openSection(page, editorUrl, "Tagesablauf");

    const missing = await submitNewItem(page, { "Beginn (Datum)": "2027-06-12", "Beginn (Uhrzeit)": "22:00" });
    await expect(await fieldError(missing, "Name")).toHaveText("Bitte fülle dieses Feld aus.");
    await expect(await fieldError(missing, "Art")).toHaveText("Bitte wähle einen Eintrag aus der Liste.");

    await fillForm(missing, {
      Art: { select: "Feier" },
      Name: "Party",
      "Ende (Datum, optional)": "2027-06-12",
      "Ende (Uhrzeit, optional)": "21:00",
      Website: "nicht eine url",
    });
    await missing.getByRole("button", { name: "Speichern" }).click();
    await expect(await fieldError(missing, "Ende (Uhrzeit, optional)")).toHaveText("Das Ende muss nach dem Beginn liegen.");
    await expect(await fieldError(missing, "Website")).toHaveText("Bitte gib eine gültige Webadresse ein (z. B. https://beispiel.de).");

    await fillForm(missing, {
      "Ende (Datum, optional)": "2027-06-13",
      "Ende (Uhrzeit, optional)": "02:00",
      Website: "seehaus.example",
      Bild: { file: PHOTO },
      Veranstaltungsort: "Seehaus",
    });
    await missing.getByRole("button", { name: "Speichern" }).click();
    await expect(missing).toBeHidden();
    await expect(preview.getByTestId("site-section-schedule")).toContainText("Party");
  });

  await test.step("travel, things to do and FAQ: the remaining optional fields", async () => {
    await openSection(page, editorUrl, "Anreise");
    await addItem(page, { Name: "Bahnhof", Art: { select: "Anreise" }, Beschreibung: "Vom Bahnhof fährt ein Shuttle." });

    await openSection(page, editorUrl, "Empfehlungen");
    await addItem(page, { Name: "Seerundweg", Website: "https://seerundweg.example/route", Beschreibung: "Zwei Stunden, flach." });

    await openSection(page, editorUrl, "Häufige Fragen");
    await addItem(page, { Frage: "Wo ist der Eingang?", Antwort: "Hinter dem Tor links.", Bild: { file: PHOTO } });

    await openSection(page, editorUrl, "Geschenkideen");
    const registry = await submitNewItem(page, { Name: "Kasse" });
    await expect(await fieldError(registry, "Link")).toHaveText("Bitte gib eine gültige Webadresse ein (z. B. https://beispiel.de).");
    await registry.getByRole("button", { name: "Abbrechen" }).click();

    await page.getByLabel("Titel des Abschnitts").fill("x".repeat(61));
    await page.getByRole("button", { name: "Speichern" }).first().click();
    await expect(page.getByText("Dieser Text ist zu lang.")).toBeVisible();
  });

  await test.step("the public page shows every field", async () => {
    await page.goto(`/${slug}-neu`);
    await expect(page.getByText("#claraunddev")).toBeVisible();

    const party = page.getByTestId("site-event").filter({ hasText: "Party" });
    await expect(party).toContainText("Feier");
    await expect(party).toContainText("12. Juni 2027, 22:00 – 13. Juni 2027, 02:00 Uhr");
    await expect(party).toContainText("Seehaus");
    await expect(party.getByRole("link", { name: "Website" })).toHaveAttribute("href", "https://seehaus.example");
    await expect(party.locator('img[src^="/uploads/"]')).toBeVisible();

    const travel = page.getByTestId("site-section-travel");
    await expect(travel).toContainText("Anreise");
    await expect(travel).toContainText("Vom Bahnhof fährt ein Shuttle.");

    const tips = page.getByTestId("site-section-things-to-do");
    await expect(tips).toContainText("Zwei Stunden, flach.");
    await expect(tips.getByRole("link", { name: "Website" })).toHaveAttribute("href", "https://seerundweg.example/route");

    const faq = page.getByTestId("site-section-faqs");
    await expect(faq).toContainText("Hinter dem Tor links.");
    await expect(faq.locator('img[src^="/uploads/"]')).toBeVisible();

    // Section title errors were not saved.
    await expect(page.getByRole("heading", { name: "x".repeat(61) })).toHaveCount(0);

    // The calendar entry follows the wedding's time zone (London, summer time = UTC+1).
    const download = page.waitForEvent("download");
    await party.getByRole("link", { name: "Zum Kalender hinzufügen" }).click();
    const ics = await readFile(await (await download).path(), "utf8");
    expect(ics).toContain("DTSTART:20270612T210000Z");
    expect(ics).toContain("DTEND:20270613T010000Z");
    expect(ics).toContain("URL:");
  });
});
