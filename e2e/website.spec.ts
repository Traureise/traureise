import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, recordForeignRequests, test } from "./fixtures";
import { login, uniqueEmail } from "./helpers/auth";
import {
  addBlock,
  addEvent,
  deleteBlock,
  editBlock,
  expectBlocks,
  moveBlock,
  openSection,
  renameSection,
  scheduleUrl,
  siteSection,
  toggleVisibility,
  type Values,
} from "./helpers/editor";
import { createWeddingWithWebsite, homeUrl, publishWebsite, step } from "./helpers/weddings";

const COVER = path.join(import.meta.dirname, "assets/cover.jpg");
const PHOTO = path.join(import.meta.dirname, "assets/photo.jpg");

type BlockCase = {
  /** The template section, by its default title. */
  nav: string;
  /** The block type's German label. */
  type: string;
  renamed: string;
  /** Three blocks; the flow edits the first, moves and deletes the others. */
  make: (n: "A" | "B" | "C") => Values;
  headline: (n: string) => string;
  edit: Values;
  editedHeadline: string;
};

const BLOCKS: BlockCase[] = [
  {
    nav: "Anreise",
    type: "Ort",
    renamed: "Anreise & Hotels",
    make: (n) => ({ Name: `Unterkunft ${n}`, Art: { select: n === "A" ? "Hotel" : "Parken" }, Adresse: `Bahnhofstraße ${n}` }),
    headline: (n) => `Unterkunft ${n}`,
    edit: { Name: "Hotel Linde", Website: "hotel-linde.example" },
    editedHeadline: "Hotel Linde",
  },
  {
    nav: "Empfehlungen",
    type: "Ort",
    renamed: "Tipps für euch",
    make: (n) => ({ Name: `Tipp ${n}`, Art: { select: "Ausflug" }, Beschreibung: `Beschreibung ${n}` }),
    headline: (n) => `Tipp ${n}`,
    edit: { Name: "Altstadtführung" },
    editedHeadline: "Altstadtführung",
  },
  {
    nav: "Geschenkideen",
    type: "Link",
    renamed: "Wunschliste",
    make: (n) => ({ Name: `Wunsch ${n}`, Link: `https://example.org/wunsch-${n.toLowerCase()}` }),
    headline: (n) => `Wunsch ${n}`,
    edit: { Name: "Hochzeitsreise", Beschreibung: "Ein Zuschuss für Lissabon." },
    editedHeadline: "Hochzeitsreise",
  },
  {
    nav: "Hochzeitsgesellschaft",
    type: "Person",
    renamed: "Unsere Liebsten",
    make: (n) => ({ Name: `Person ${n}`, Rolle: { select: n === "A" ? "Trauzeugin" : "Trauzeuge" }, ...(n === "A" ? { Bild: { file: PHOTO } } : {}) }),
    headline: (n) => `Person ${n}`,
    edit: { Name: "Mia Berger" },
    editedHeadline: "Mia Berger",
  },
  {
    nav: "Galerie",
    type: "Bild",
    renamed: "Momente",
    make: (n) => ({ Bild: { file: PHOTO }, Bildunterschrift: `Foto ${n}` }),
    headline: (n) => `Foto ${n}`,
    edit: { Bildunterschrift: "Der Antrag" },
    editedHeadline: "Der Antrag",
  },
  {
    nav: "Häufige Fragen",
    type: "Frage & Antwort",
    renamed: "Fragen & Antworten",
    make: (n) => ({ Frage: `Frage ${n}?`, Antwort: `Antwort ${n}.` }),
    headline: (n) => `Frage ${n}?`,
    edit: { Frage: "Gibt es einen Dresscode?", Antwort: "Sommerlich elegant." },
    editedHeadline: "Gibt es einen Dresscode?",
  },
];

const event = (n: "A" | "B" | "C"): Values => ({
  Art: { select: n === "A" ? "Trauung" : n === "B" ? "Sektempfang" : "Feier" },
  Name: `Programmpunkt ${n}`,
  "Beginn (Datum)": "12.06.2027",
  "Beginn (Uhrzeit)": n === "A" ? "14:30" : n === "B" ? "16:00" : "19:00",
  ...(n === "A" ? { "Ende (Uhrzeit, optional)": "15:30", Veranstaltungsort: "Gut Sonnenhof", Adresse: "Hofweg 3, 12345 Beispielstadt" } : {}),
});

test("a couple builds, shares, restyles and deletes their wedding website", async ({ page, browser, baseURL, context, thirdPartyRequests }) => {
  test.setTimeout(6 * 60_000);
  const slug = `anna-und-ben-${Date.now()}`;
  const publicUrl = `${baseURL}/${slug}`;
  const preview = page.getByTestId("site-preview");
  let editorUrl = "";
  let weddingId = "";
  const sectionIds: Record<string, string> = {};

  await test.step("log in, create the wedding; its website is a draft until published", async () => {
    await login(page, uniqueEmail("anna"), "Anna");
    await expect(page.getByRole("heading", { name: "Eure Hochzeit" })).toBeVisible();
    ({ weddingId, editorUrl } = await createWeddingWithWebsite(page, slug, { published: false }));
    await page.goto(editorUrl);
    await expect(preview.getByTestId("site-title")).toHaveText("Anna & Ben");
    await expect(preview.getByTestId("site-location")).toHaveText("Ort noch offen");
    expect((await page.request.get(`/${slug}`)).status()).toBe(404);
  });

  await test.step("names, date and place are the wedding's; the home section has the rest, with live preview", async () => {
    await openSection(page, editorUrl, "Startseite");
    await page.getByTestId("home-wedding-details").getByRole("button", { name: "Angaben ändern" }).click();
    let details = page.getByRole("dialog", { name: "Eure Hochzeit" });
    await details.getByLabel("Eure Namen").fill("Anna & Ben heiraten");
    await details.getByLabel("Ort (optional)").fill("Gut Sonnenhof, Beispielstadt");
    await details.getByRole("button", { name: "Speichern" }).click();
    await expect(details).toBeHidden();
    await page.locator('input[type="file"]').setInputFiles(COVER);
    await expect(preview.locator("img.site-cover")).toBeVisible();
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

    // Not planned yet shows the placeholder.
    await page.getByTestId("home-wedding-details").getByRole("button", { name: "Angaben ändern" }).click();
    details = page.getByRole("dialog", { name: "Eure Hochzeit" });
    await details.getByLabel("Noch nicht").check();
    await details.getByRole("button", { name: "Speichern" }).click();
    await expect(preview.getByTestId("site-date")).toHaveText("Datum noch offen");
    await page.getByTestId("home-wedding-details").getByRole("button", { name: "Angaben ändern" }).click();
    details = page.getByRole("dialog", { name: "Eure Hochzeit" });
    await details.getByLabel("Ja", { exact: true }).check();
    await details.getByLabel("Hochzeitsdatum").fill("12.06.2027");
    await details.getByRole("button", { name: "Speichern" }).click();
    await expect(preview.getByTestId("site-date")).toHaveText("Samstag, 12. Juni 2027");
  });

  await test.step("write our story in a text block, rename it, hide and show it", async () => {
    const id = await openSection(page, editorUrl, "Unsere Geschichte");
    await page.getByRole("button", { name: "Text hinzufügen" }).click();
    const form = page.getByRole("form", { name: "Neuer Baustein" });
    await form.getByLabel("Text", { exact: true }).fill("Kennengelernt im Nachtzug nach Wien.");
    await form.getByRole("button", { name: "Speichern" }).click();
    await expect(form).toBeHidden();
    await expect(siteSection(preview, id)).toContainText("Kennengelernt im Nachtzug nach Wien.");
    await renameSection(page, id, "Wie alles begann");
    await toggleVisibility(page, id);
  });

  await test.step("the Ablauf: events are chronological and every website shows them through Tagesablauf", async () => {
    for (const n of ["C", "A", "B"] as const) await addEvent(page, weddingId, event(n));
    const events = page.getByTestId("event").getByTestId("event-headline");
    await expect(events).toHaveText([/^Programmpunkt A/, /^Programmpunkt B/, /^Programmpunkt C/]);
    await page.getByTestId("event").filter({ hasText: "Programmpunkt A" }).getByRole("button", { name: /^Bearbeiten/ }).click();
    const form = page.getByRole("form", { name: "Termin bearbeiten" });
    await form.getByLabel("Name", { exact: true }).fill("Freie Trauung");
    await form.getByLabel("Beschreibung", { exact: true }).fill("Bitte seid um 14 Uhr da.");
    await form.getByRole("button", { name: "Speichern" }).click();
    await expect(form).toBeHidden();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByTestId("event").filter({ hasText: "Programmpunkt C" }).getByRole("button", { name: /^Löschen/ }).click();
    await expect(events).toHaveText([/^Freie Trauung/, /^Programmpunkt B/]);

    const id = await openSection(page, editorUrl, "Tagesablauf");
    await expectBlocks(page, ["Alle Termine"]);
    const section = siteSection(preview, id);
    await expect(section.getByTestId("site-event")).toHaveCount(2);
    const text = await section.innerText();
    expect(text.indexOf("Freie Trauung")).toBeLessThan(text.indexOf("Programmpunkt B"));
    await renameSection(page, id, "Ablauf des Tages");
    await toggleVisibility(page, id);
  });

  for (const c of BLOCKS) {
    await test.step(`manage ${c.type} blocks in ${c.nav}`, async () => {
      const id = await openSection(page, editorUrl, c.nav);
      sectionIds[c.nav] = id;
      for (const n of ["A", "B", "C"] as const) await addBlock(page, c.type, c.make(n));
      await expectBlocks(page, ["A", "B", "C"].map(c.headline));
      await expect(siteSection(preview, id)).toContainText(c.headline("C"));

      await editBlock(page, c.headline("A"), c.edit);
      await moveBlock(page, c.headline("C"), "Nach oben");
      await expectBlocks(page, [c.editedHeadline, c.headline("C"), c.headline("B")]);
      await deleteBlock(page, c.headline("C"));
      await moveBlock(page, c.headline("B"), "Nach oben");
      await expectBlocks(page, [c.headline("B"), c.editedHeadline]);

      const section = siteSection(preview, id);
      await expect(section).toContainText(c.editedHeadline);
      await expect(section).not.toContainText(c.headline("C"));
      const text = await section.innerText();
      expect(text.indexOf(c.headline("B"))).toBeLessThan(text.indexOf(c.editedHeadline));

      await renameSection(page, id, c.renamed);
      await toggleVisibility(page, id);
    });
  }

  await test.step("hide a section; the overview marks it hidden", async () => {
    await openSection(page, editorUrl, "Wunschliste");
    await page.getByRole("switch", { name: "Abschnitt anzeigen" }).click();
    await expect(siteSection(preview, sectionIds["Geschenkideen"]!)).toHaveCount(0);
    await page.goto(editorUrl);
    await expect(page.getByTestId("section-nav").getByRole("link", { name: /Wunschliste/ })).toContainText("Ausgeblendet");
    await expect(page.getByTestId("section-nav").getByRole("link", { name: /Momente/ })).toContainText("Sichtbar");
  });

  await test.step("the public page shows exactly the visible content once published", async () => {
    await publishWebsite(page, editorUrl);
    const guest = await context.newPage();
    await guest.goto(`/${slug}`);
    await expect(guest).toHaveTitle("Anna & Ben heiraten");
    await expect(guest.locator('meta[property="og:title"]')).toHaveAttribute("content", "Anna & Ben heiraten");
    await expect(guest.locator('meta[property="og:image"]')).toHaveAttribute("content", /\/uploads\/.+\.webp$/);
    await expect(guest.getByTestId("site-section").getByRole("heading", { level: 2 })).toHaveText([
      "Wie alles begann",
      "Ablauf des Tages",
      "Anreise & Hotels",
      "Tipps für euch",
      "Unsere Liebsten",
      "Momente",
      "Fragen & Antworten",
    ]);
    const nav = guest.getByRole("navigation", { name: "Abschnitte" });
    await expect(nav.getByRole("link")).toHaveText(["Start", "Wie alles begann", "Ablauf des Tages", "Anreise & Hotels", "Tipps für euch", "Unsere Liebsten", "Momente", "Fragen & Antworten"]);
    await expect(guest.getByText("Wunsch B")).toHaveCount(0);
    await expect(guest.getByText("Gibt es einen Dresscode?")).toBeVisible();
    await expect(siteSection(guest, sectionIds["Hochzeitsgesellschaft"]!)).toContainText("Trauzeugin");

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

  await test.step("share the website from the wedding's home", async () => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto(homeUrl(weddingId));
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Anna & Ben heiraten");
    await expect(page.getByTestId("wedding-badge")).toContainText("12. Juni 2027 · Gut Sonnenhof, Beispielstadt");
    const card = step(page, "Hochzeitswebsite");
    await expect(card).toHaveAttribute("data-state", "done");
    await expect(card.getByTestId("step-status")).toHaveText("Veröffentlicht");
    // "Versenden" leads to the guest list, where each household's personal link is sent.
    await expect(card.getByRole("link", { name: "Versenden" })).toHaveAttribute("href", `/hochzeiten/${weddingId}/gaeste`);

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

  await test.step("another user cannot see or edit the website", async () => {
    const ben = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": "10.200.0.1" } });
    const benForeign = recordForeignRequests(ben, baseURL!);
    const benPage = await ben.newPage();
    await login(benPage, uniqueEmail("ben"), "Ben");
    for (const url of [homeUrl(weddingId), `${homeUrl(weddingId)}/gaeste`, scheduleUrl(weddingId), editorUrl, `${editorUrl}/home`, `${editorUrl}/${sectionIds["Häufige Fragen"]}`]) {
      const res = await benPage.goto(url);
      expect(res?.status()).toBe(404);
      await expect(benPage.getByRole("heading", { name: "Seite nicht gefunden" })).toBeVisible();
    }
    await ben.close();
    thirdPartyRequests.push(...benForeign);
  });

  await test.step("take the website offline, then delete the wedding", async () => {
    await page.goto(editorUrl);
    await page.getByTestId("publish-control").getByRole("button", { name: "Offline nehmen" }).click();
    await expect(page.getByTestId("publish-control")).toHaveAttribute("data-published", "false");
    expect((await page.request.get(`/${slug}`)).status()).toBe(404);
    await publishWebsite(page, editorUrl);
    await page.goto(homeUrl(weddingId));
    await page.getByRole("button", { name: "Hochzeit löschen" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Hochzeit löschen?" });
    await dialog.getByRole("button", { name: "Endgültig löschen" }).click();
    await expect(page).toHaveURL(/\/hochzeiten$/);
    await expect(page.getByTestId("wedding")).toHaveCount(0);
    expect((await page.request.get(`/${slug}`)).status()).toBe(404);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/hochzeiten\/neu$/);
  });

  await test.step("log out", async () => {
    await page.getByRole("button", { name: "Abmelden" }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
  });
});
