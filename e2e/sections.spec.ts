import { expect, test } from "./fixtures";
import { login, uniqueEmail } from "./helpers/auth";
import { addBlock, blocks, expectBlocks, fillForm, openNewBlock, openSection, renameSection, scheduleUrl, siteSection } from "./helpers/editor";
import { createWeddingWithWebsite, homeUrl, step } from "./helpers/weddings";

const TEMPLATE = ["Unsere Geschichte", "Tagesablauf", "Anreise", "Empfehlungen", "Geschenkideen", "Hochzeitsgesellschaft", "Galerie", "Häufige Fragen"];

test("a couple shapes sections from blocks", async ({ page }) => {
  test.setTimeout(3 * 60_000);
  const slug = `lena-und-tom-${Date.now()}`;
  const preview = page.getByTestId("site-preview");
  const previewNav = () => preview.getByRole("navigation", { name: "Abschnitte" }).getByRole("link");
  let editorUrl = "";
  let weddingId = "";
  let dayAfter = "";

  await test.step("a few words above the wedding party, then two people in one grid", async () => {
    await login(page, uniqueEmail("lena"), "Lena");
    ({ editorUrl, weddingId } = await createWeddingWithWebsite(page, slug, { names: "Lena & Tom" }));
    const party = await openSection(page, editorUrl, "Hochzeitsgesellschaft");
    await expect(page.getByRole("button", { name: "Person hinzufügen" })).toBeVisible();
    await addBlock(page, "Text", { Text: "Ohne sie wären wir nicht hier." });
    await addBlock(page, "Person", { Name: "Lena", Rolle: { select: "Trauzeugin" }, Text: "Seit der ersten Klasse" });
    await addBlock(page, "Person", { Name: "Jonas", Rolle: { select: "Trauzeuge" } });
    await expectBlocks(page, ["Ohne sie wären wir nicht hier.", "Lena", "Jonas"]);
    const section = siteSection(preview, party);
    await expect(section).toContainText("Seit der ersten Klasse");
    const text = await section.innerText();
    expect(text.indexOf("Ohne sie wären wir nicht hier.")).toBeLessThan(text.indexOf("Lena"));
    expect(text.indexOf("Lena")).toBeLessThan(text.indexOf("Jonas"));
  });

  await test.step("an empty section with a new event and a place", async () => {
    await page.goto(editorUrl);
    await page.getByRole("button", { name: "Abschnitt hinzufügen" }).click();
    const dialog = page.getByRole("dialog", { name: "Abschnitt hinzufügen" });
    await expect(dialog.getByLabel("Aus der Vorlage")).toHaveValue("");
    await dialog.getByRole("button", { name: "Hinzufügen" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Neuer Abschnitt" })).toBeVisible();
    dayAfter = new URL(page.url()).pathname.split("/").at(-1)!;
    const form = await openNewBlock(page, "Termin");
    await form.getByRole("button", { name: "Neuer Termin" }).click();
    const eventForm = page.getByRole("form", { name: "Neuer Termin" });
    await fillForm(eventForm, { Art: { select: "Brunch" }, Name: "Brunch", "Beginn (Datum)": "2027-06-13", "Beginn (Uhrzeit)": "11:00" });
    await eventForm.getByRole("button", { name: "Speichern" }).click();
    await expect(eventForm).toBeHidden();
    await expect(form.getByLabel("Termin", { exact: true })).toHaveValue(/^[0-9a-f-]{36}$/);
    await form.getByRole("button", { name: "Speichern" }).click();
    await expect(form).toBeHidden();
    await addBlock(page, "Ort", { Name: "Café am See", Art: { select: "Ausflug" } });
    await expectBlocks(page, ["Brunch · 13.06.2027 · 11:00", "Café am See"]);
    // An empty section stays off the site; now that it has blocks, rename it there.
    await renameSection(page, dayAfter, "Der Tag danach");

    await expect(previewNav()).toContainText(["Der Tag danach"]);
    const section = siteSection(preview, dayAfter);
    await expect(section.getByTestId("site-event")).toContainText("Brunch");
    await expect(section).toContainText("Café am See");
    await expect(section).toContainText("Ausflug");
    const schedule = preview.getByTestId("site-section").filter({ has: page.getByRole("heading", { level: 2, name: "Tagesablauf" }) });
    await expect(schedule).toContainText("Brunch");
  });

  await test.step("move the section up; the site navigation follows", async () => {
    await page.goto(editorUrl);
    const rows = page.getByTestId("section-row");
    const rowIndex = async () => (await rows.allInnerTexts()).findIndex((text) => text.startsWith("Der Tag danach"));
    await expect(previewNav()).toHaveText(["Start", "Tagesablauf", "Hochzeitsgesellschaft", "Der Tag danach"]);
    // Galerie and Häufige Fragen are empty (not on the site); moving past them changes only the editor's order.
    for (let index = 8; index > 5; index--) {
      await page.getByRole("button", { name: "Nach oben: Der Tag danach" }).click();
      await expect.poll(rowIndex).toBe(index - 1);
    }
    await expect(previewNav()).toHaveText(["Start", "Tagesablauf", "Der Tag danach", "Hochzeitsgesellschaft"]);
  });

  await test.step("deleting the event in the Ablauf removes it everywhere", async () => {
    // The website editor leads to the Ablauf, where events are edited.
    await page.goto(editorUrl);
    await page.getByRole("navigation", { name: "Website bearbeiten" }).getByRole("link", { name: /^Ablauf/ }).click();
    await expect(page).toHaveURL(new RegExp(`${scheduleUrl(weddingId)}$`));
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByTestId("event").filter({ hasText: "Brunch" }).getByRole("button", { name: /^Löschen/ }).click();
    await expect(page.getByTestId("event")).toHaveCount(0);
    await openSection(page, editorUrl, "Der Tag danach");
    await expectBlocks(page, ["Café am See"]);
    await expect(siteSection(preview, dayAfter)).not.toContainText("Brunch");
    await expect(blocks(page)).toHaveCount(1);
  });

  await test.step("a new website version from the template starts with the template's sections only", async () => {
    await page.goto(homeUrl(weddingId));
    await step(page, "Hochzeitswebsite").getByRole("button", { name: "+ Version" }).click();
    const dialog = page.getByRole("dialog", { name: "Neue Version: Hochzeitswebsite" });
    await dialog.getByLabel("Name der Version").fill("Freunde");
    await dialog.getByLabel("Aus Vorlage erstellen").check();
    await dialog.getByRole("button", { name: "Version anlegen" }).click();
    await expect(page).toHaveURL(/\/website\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId("version-menu")).toHaveText("Freunde");
    await expect(page.getByTestId("section-row")).toHaveText(TEMPLATE.map((title) => new RegExp(`^${title}`)));
    await expect(preview).not.toContainText("Ohne sie wären wir nicht hier.");
  });

  await test.step("delete a section", async () => {
    await openSection(page, editorUrl, "Der Tag danach");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Abschnitt löschen" }).click();
    await expect(page).toHaveURL(new RegExp(`${editorUrl}$`));
    await expect(preview.getByRole("navigation", { name: "Abschnitte" })).not.toContainText("Der Tag danach");
    await expect(page.getByTestId("section-nav")).not.toContainText("Der Tag danach");
  });
});
