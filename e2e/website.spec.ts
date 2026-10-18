import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, recordForeignRequests, test } from "./fixtures";
import { login, uniqueEmail } from "./helpers/auth";
import {
  addItem,
  deleteItem,
  editItem,
  expectItems,
  moveItem,
  openSection,
  renameSection,
  toggleVisibility,
  type Values,
} from "./helpers/editor";

const COVER = path.join(import.meta.dirname, "assets/cover.jpg");
const PHOTO = path.join(import.meta.dirname, "assets/photo.jpg");

type CollectionCase = {
  id: string;
  nav: string;
  renamed: string;
  /** Three items; the flow edits the first, moves and deletes the others. */
  make: (n: "A" | "B" | "C") => Values;
  headline: (n: string) => string;
  edit: Values;
  editedHeadline: string;
};

const COLLECTIONS: CollectionCase[] = [
  {
    id: "schedule",
    nav: "Tagesablauf",
    renamed: "Ablauf des Tages",
    make: (n) => ({
      Art: { select: n === "A" ? "Trauung" : n === "B" ? "Sektempfang" : "Feier" },
      Name: `Programmpunkt ${n}`,
      "Beginn (Datum)": "2027-06-12",
      "Beginn (Uhrzeit)": n === "A" ? "14:30" : n === "B" ? "16:00" : "19:00",
      ...(n === "A" ? { "Ende (Uhrzeit, optional)": "15:30", Veranstaltungsort: "Gut Sonnenhof", Adresse: "Hofweg 3, 12345 Beispielstadt" } : {}),
    }),
    headline: (n) => `Programmpunkt ${n}`,
    edit: { Name: "Freie Trauung", Beschreibung: "Bitte seid um 14 Uhr da." },
    editedHeadline: "Freie Trauung",
  },
  {
    id: "travel",
    nav: "Anreise",
    renamed: "Anreise & Hotels",
    make: (n) => ({ Name: `Unterkunft ${n}`, Art: { select: n === "A" ? "Hotel" : "Parken" }, Adresse: `Bahnhofstraße ${n}` }),
    headline: (n) => `Unterkunft ${n}`,
    edit: { Name: "Hotel Linde", Website: "hotel-linde.example" },
    editedHeadline: "Hotel Linde",
  },
  {
    id: "things-to-do",
    nav: "Empfehlungen",
    renamed: "Tipps für euch",
    make: (n) => ({ Name: `Tipp ${n}`, Beschreibung: `Beschreibung ${n}` }),
    headline: (n) => `Tipp ${n}`,
    edit: { Name: "Altstadtführung" },
    editedHeadline: "Altstadtführung",
  },
  {
    id: "registry",
    nav: "Geschenkideen",
    renamed: "Wunschliste",
    make: (n) => ({ Name: `Wunsch ${n}`, Link: `https://example.org/wunsch-${n.toLowerCase()}` }),
    headline: (n) => `Wunsch ${n}`,
    edit: { Name: "Hochzeitsreise", Beschreibung: "Ein Zuschuss für Lissabon." },
    editedHeadline: "Hochzeitsreise",
  },
  {
    id: "wedding-party",
    nav: "Hochzeitsgesellschaft",
    renamed: "Unsere Liebsten",
    make: (n) => ({ Name: `Person ${n}`, Rolle: { select: n === "A" ? "Trauzeugin" : "Trauzeuge" }, ...(n === "A" ? { Bild: { file: PHOTO } } : {}) }),
    headline: (n) => `Person ${n}`,
    edit: { Name: "Mia Berger" },
    editedHeadline: "Mia Berger",
  },
  {
    id: "gallery",
    nav: "Galerie",
    renamed: "Momente",
    make: (n) => ({ Bild: { file: PHOTO }, Bildunterschrift: `Foto ${n}` }),
    headline: (n) => `Foto ${n}`,
    edit: { Bildunterschrift: "Der Antrag" },
    editedHeadline: "Der Antrag",
  },
  {
    id: "faqs",
    nav: "Häufige Fragen",
    renamed: "Fragen & Antworten",
    make: (n) => ({ Frage: `Frage ${n}?`, Antwort: `Antwort ${n}.` }),
    headline: (n) => `Frage ${n}?`,
    edit: { Frage: "Gibt es einen Dresscode?", Antwort: "Sommerlich elegant." },
    editedHeadline: "Gibt es einen Dresscode?",
  },
];

async function createWebsite(page: Page, slug: string) {
  await page.getByRole("button", { name: "Erstellen", exact: true }).click();
  await page.getByRole("menuitem", { name: "Hochzeitswebsite" }).click();
  const dialog = page.getByRole("dialog", { name: "Neue Hochzeitswebsite" });
  await dialog.getByLabel("Eure Namen").fill("Anna & Ben");
  await dialog.getByLabel("Hochzeitsdatum (optional)").fill("2027-06-12");
  await dialog.getByLabel("Webadresse").fill(slug);
  await dialog.getByRole("button", { name: "Website erstellen" }).click();
  await expect(page).toHaveURL(/\/websites\/[0-9a-f-]{36}\/edit$/);
  return page.url();
}

test("a couple builds, shares, restyles and deletes their wedding website", async ({ page, browser, baseURL, context, thirdPartyRequests }) => {
  test.setTimeout(6 * 60_000);
  const slug = `anna-und-ben-${Date.now()}`;
  const publicUrl = `${baseURL}/${slug}`;
  const preview = page.getByTestId("site-preview");
  let editorUrl = "";

  await test.step("log in and create a website", async () => {
    await login(page, uniqueEmail("anna"), "Anna");
    await expect(page.getByRole("heading", { name: "Willkommen, Anna" })).toBeVisible();
    editorUrl = await createWebsite(page, slug);
    await expect(preview.getByTestId("site-title")).toHaveText("Anna & Ben");
    await expect(preview.getByTestId("site-location")).toHaveText("Ort noch offen");
  });

  await test.step("edit the home section with live preview", async () => {
    await openSection(page, editorUrl, "Startseite");
    await page.locator('input[type="file"]').setInputFiles(COVER);
    await expect(preview.locator("img.site-cover")).toBeVisible();
    await page.getByLabel("Titel", { exact: true }).fill("Anna & Ben heiraten");
    await page.getByLabel("Ort noch offen").uncheck();
    await page.getByLabel("Ort", { exact: true }).fill("Gut Sonnenhof, Beispielstadt");
    await page.getByLabel("Begrüßung").fill("Wir freuen uns riesig auf euch!");
    await page.getByLabel("Hashtag").fill("#annaundben");
    await page.getByRole("switch", { name: "Countdown bis zur Hochzeit anzeigen" }).click();
    await page.getByRole("button", { name: "Speichern" }).click();
    await expect(preview.getByTestId("site-title")).toHaveText("Anna & Ben heiraten");
    await expect(preview.getByTestId("site-date")).toHaveText("Samstag, 12. Juni 2027");
    await expect(preview.getByTestId("site-location")).toHaveText("Gut Sonnenhof, Beispielstadt");
    await expect(preview.getByTestId("site-countdown")).toContainText(/Noch \d+ Tage/);
    await expect(preview.getByText("#annaundben")).toBeVisible();
    await expect(preview.getByText("Wir freuen uns riesig auf euch!")).toBeVisible();

    // Replace and remove the cover, then set it again.
    const firstCover = await preview.locator("img.site-cover").getAttribute("src");
    await page.locator('input[type="file"]').setInputFiles(PHOTO);
    await expect(preview.locator("img.site-cover")).not.toHaveAttribute("src", firstCover!);
    await page.getByRole("button", { name: "Bild entfernen" }).click();
    await expect(preview.locator("img.site-cover")).toHaveCount(0);
    await page.locator('input[type="file"]').setInputFiles(COVER);
    await expect(preview.locator("img.site-cover")).toBeVisible();

    // Undecided date shows the placeholder.
    await page.getByLabel("Datum noch offen").check();
    await page.getByRole("button", { name: "Speichern" }).click();
    await expect(preview.getByTestId("site-date")).toHaveText("Datum noch offen");
    await page.getByLabel("Datum noch offen").uncheck();
    await page.getByLabel("Hochzeitsdatum").fill("2027-06-12");
    await page.getByRole("button", { name: "Speichern" }).click();
    await expect(preview.getByTestId("site-date")).toHaveText("Samstag, 12. Juni 2027");
  });

  await test.step("write our story, rename it, hide and show it", async () => {
    await openSection(page, editorUrl, "Unsere Geschichte");
    await page.getByLabel("Eure Geschichte").fill("Kennengelernt im Nachtzug nach Wien.");
    await page.getByRole("button", { name: "Speichern" }).click();
    await expect(preview.getByTestId("site-section-our-story")).toContainText("Kennengelernt im Nachtzug nach Wien.");
    await renameSection(page, "our-story", "Wie alles begann");
    await toggleVisibility(page, "our-story");
  });

  for (const c of COLLECTIONS) {
    await test.step(`manage items in ${c.nav}`, async () => {
      await openSection(page, editorUrl, c.nav);
      for (const n of ["A", "B", "C"] as const) await addItem(page, c.make(n));
      await expectItems(page, ["A", "B", "C"].map(c.headline));
      await expect(preview.getByTestId(`site-section-${c.id}`)).toContainText(c.headline("C"));

      await editItem(page, c.headline("A"), c.edit);
      await moveItem(page, c.headline("C"), "Nach oben");
      await expectItems(page, [c.editedHeadline, c.headline("C"), c.headline("B")]);
      await deleteItem(page, c.headline("C"));
      await moveItem(page, c.headline("B"), "Nach oben");
      await expectItems(page, [c.headline("B"), c.editedHeadline]);

      const section = preview.getByTestId(`site-section-${c.id}`);
      await expect(section).toContainText(c.editedHeadline);
      await expect(section).not.toContainText(c.headline("C"));
      const text = await section.innerText();
      expect(text.indexOf(c.headline("B"))).toBeLessThan(text.indexOf(c.editedHeadline));

      await renameSection(page, c.id, c.renamed);
      await toggleVisibility(page, c.id);
    });
  }

  await test.step("hide a section; the overview marks it hidden", async () => {
    await openSection(page, editorUrl, "Wunschliste");
    await page.getByRole("switch", { name: "Abschnitt anzeigen" }).click();
    await expect(preview.getByTestId("site-section-registry")).toHaveCount(0);
    await page.goto(editorUrl);
    await expect(page.getByTestId("section-nav").getByRole("link", { name: /Wunschliste/ })).toContainText("Ausgeblendet");
    await expect(page.getByTestId("section-nav").getByRole("link", { name: /Momente/ })).toContainText("Sichtbar");
  });

  await test.step("the public page shows exactly the visible content", async () => {
    const guest = await context.newPage();
    await guest.goto(`/${slug}`);
    await expect(guest).toHaveTitle("Anna & Ben heiraten");
    await expect(guest.locator('meta[property="og:title"]')).toHaveAttribute("content", "Anna & Ben heiraten");
    await expect(guest.locator('meta[property="og:image"]')).toHaveAttribute("content", /\/uploads\/.+\.webp$/);
    const sections = await guest.locator("[data-testid^=site-section-]").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
    expect(sections).toEqual(["our-story", "schedule", "travel", "things-to-do", "wedding-party", "gallery", "faqs"].map((id) => `site-section-${id}`));
    const nav = guest.getByRole("navigation", { name: "Abschnitte" });
    await expect(nav.getByRole("link")).toHaveText(["Start", "Wie alles begann", "Ablauf des Tages", "Anreise & Hotels", "Tipps für euch", "Unsere Liebsten", "Momente", "Fragen & Antworten"]);
    await expect(guest.getByText("Wunsch B")).toHaveCount(0);
    await expect(guest.getByText("Gibt es einen Dresscode?")).toBeVisible();
    await expect(guest.getByTestId("site-section-wedding-party")).toContainText("Trauzeugin");

    const event = guest.getByTestId("site-event").filter({ hasText: "Freie Trauung" });
    await expect(event).toContainText("14:30 – 15:30 Uhr");
    await expect(event.getByRole("link", { name: "Karte ansehen" })).toHaveAttribute(
      "href",
      "https://www.openstreetmap.org/search?query=Gut%20Sonnenhof%2C%20Hofweg%203%2C%2012345%20Beispielstadt",
    );

    const download = guest.waitForEvent("download");
    await event.getByRole("link", { name: "Zum Kalender hinzufügen" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe("freie-trauung.ics");
    const ics = await readFile(await file.path(), "utf8");
    expect(ics).toContain("SUMMARY:Freie Trauung");
    expect(ics).toContain("DTSTART:20270612T123000Z");
    expect(ics).toContain("DTEND:20270612T133000Z");
    await guest.close();
  });

  await test.step("share the website from the dashboard", async () => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/dashboard");
    const card = page.getByTestId("website-card");
    await expect(card.getByRole("heading", { name: "Anna & Ben heiraten" })).toBeVisible();
    await expect(card).toContainText("12. Juni 2027");
    await expect(card).toContainText("Gut Sonnenhof, Beispielstadt");
    await expect(card.getByTestId("public-url")).toHaveText(publicUrl);

    await card.getByRole("button", { name: "Teilen" }).click();
    const dialog = page.getByRole("dialog", { name: "Website teilen" });
    await expect(dialog.getByTestId("share-qr")).toHaveAttribute("src", /^data:image\/png;base64,/);
    await expect(dialog.getByLabel("Link zur Website")).toHaveValue(publicUrl);

    await dialog.getByRole("button", { name: "Link kopieren" }).click();
    await expect(page.getByText("Link kopiert")).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(publicUrl);

    await dialog.getByRole("button", { name: "QR-Code kopieren" }).click();
    await expect(page.getByText("QR-Code kopiert")).toBeVisible();

    const download = page.waitForEvent("download");
    await dialog.getByRole("link", { name: "QR-Code herunterladen" }).click();
    expect((await download).suggestedFilename()).toBe(`${slug}-qr-code.png`);
    await page.keyboard.press("Escape");
  });

  await test.step("switch theme and design; the public page follows", async () => {
    await openSection(page, editorUrl, "Theme");
    await page.getByRole("button", { name: "Auswählen: Bogen" }).click();
    await expect(preview).toHaveAttribute("data-theme", "bogen");
    await expect(preview).toHaveAttribute("data-fonts", "markant");

    await openSection(page, editorUrl, "Design");
    await page.getByText("Tinte").click();
    await expect(preview).toHaveAttribute("data-palette", "tinte");
    await page.locator("label").filter({ has: page.getByRole("radio", { name: "Playfair Display / Nunito Sans" }) }).click();
    await expect(page.getByRole("radio", { name: "Playfair Display / Nunito Sans" })).toBeChecked();
    await expect(preview).toHaveAttribute("data-fonts", "elegant");

    const guest = await context.newPage();
    await guest.goto(`/${slug}`);
    const site = guest.getByTestId("site");
    await expect(site).toHaveAttribute("data-theme", "bogen");
    await expect(site).toHaveAttribute("data-palette", "tinte");
    await expect(guest.getByTestId("site-title")).toHaveCSS("font-family", /Playfair Display/);
    await expect(site).toHaveCSS("background-color", "rgb(25, 27, 36)");
    await guest.close();
  });

  await test.step("card tabs show empty states until a card exists; there is no archive", async () => {
    await page.goto("/dashboard");
    const expectations: [string, string][] = [
      ["Save the Dates", "Deine Save the Dates erscheinen hier"],
      ["Einladungen", "Deine Einladungen erscheinen hier"],
      ["Karten", "Deine Karten erscheinen hier"],
    ];
    for (const [tab, text] of expectations) {
      await page.getByRole("link", { name: tab, exact: true }).click();
      await expect(page.getByTestId("empty-state")).toContainText(text);
    }
    await expect(page.getByRole("link", { name: "Archiviert" })).toHaveCount(0);
    await page.getByRole("button", { name: "Erstellen", exact: true }).click();
    await page.getByRole("menuitem", { name: "Einladung" }).click();
    await expect(page).toHaveURL(/\/websites\/[0-9a-f-]{36}\/karten\/einladung$/);
    await page.goto("/dashboard?tab=invitations");
    await expect(page.getByTestId("card-item")).toHaveCount(1);
  });

  await test.step("another user cannot see or edit the website", async () => {
    const ben = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": "10.200.0.1" } });
    const benForeign = recordForeignRequests(ben, baseURL!);
    const benPage = await ben.newPage();
    await login(benPage, uniqueEmail("ben"), "Ben");
    await expect(benPage.getByTestId("website-card")).toHaveCount(0);
    for (const suffix of ["", "/home", "/faqs"]) {
      const res = await benPage.goto(`${editorUrl}${suffix}`);
      expect(res?.status()).toBe(404);
      await expect(benPage.getByRole("heading", { name: "Seite nicht gefunden" })).toBeVisible();
    }
    await ben.close();
    thirdPartyRequests.push(...benForeign);
  });

  await test.step("delete the website", async () => {
    await page.goto("/dashboard");
    await page.getByTestId("website-card").getByRole("button", { name: "Löschen" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Website löschen?" });
    await dialog.getByRole("button", { name: "Endgültig löschen" }).click();
    await expect(page.getByTestId("website-card")).toHaveCount(0);
    await expect(page.getByTestId("empty-state")).toContainText("Hier erscheint eure Hochzeitswebsite");
    expect((await page.request.get(`/${slug}`)).status()).toBe(404);
  });

  await test.step("log out", async () => {
    await page.getByRole("button", { name: "Abmelden" }).click();
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
  });
});
