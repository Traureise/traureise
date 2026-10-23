import { expect, test } from "./fixtures";
import { login, uniqueEmail } from "./helpers/auth";
import { fillForm, scheduleUrl } from "./helpers/editor";
import { createWeddingWithWebsite, homeUrl } from "./helpers/weddings";

const NOMINATIM = "nominatim.openstreetmap.org";
const TILES = "tile.openstreetmap.org";
// The test stands in for OpenStreetMap: requests are answered here and never leave the machine.
test.use({ allowedHosts: [NOMINATIM, TILES] });

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
const SONNENHOF = {
  place_id: 1,
  lat: "47.721634",
  lon: "10.313218",
  name: "Gut Sonnenhof",
  display_name: "Gut Sonnenhof, Hofweg 3, 87439 Kempten, Bayern, Deutschland",
  address: { road: "Hofweg", house_number: "3", postcode: "87439", city: "Kempten" },
};

test("a couple finds the venue on an OpenStreetMap map, after agreeing to load it", async ({ page }) => {
  const osm: string[] = [];
  page.on("request", (r) => {
    const host = new URL(r.url()).host;
    if (host === NOMINATIM || host === TILES) osm.push(r.url());
  });
  await page.route(`https://${NOMINATIM}/**`, (route) => route.fulfill({ json: [SONNENHOF] }));
  await page.route(`https://${TILES}/**`, (route) => route.fulfill({ body: PNG, contentType: "image/png" }));

  const slug = `ida-und-noah-${Date.now()}`;
  await login(page, uniqueEmail("ida"), "Ida");
  const { weddingId } = await createWeddingWithWebsite(page, slug, { names: "Ida & Noah" });

  await test.step("nothing comes from OpenStreetMap until the couple loads the map", async () => {
    await page.goto(scheduleUrl(weddingId));
    await page.getByRole("button", { name: "Termin hinzufügen" }).click();
    const form = page.getByRole("form", { name: "Neuer Termin" });
    await expect(form.getByTestId("location-consent").getByRole("link", { name: "OpenStreetMap Foundation" })).toHaveAttribute(
      "href",
      "https://osmfoundation.org/wiki/Privacy_Policy",
    );
    expect(osm).toEqual([]);
    await form.getByRole("button", { name: "Karte laden" }).click();
    await expect(form.getByTestId("location-map")).toBeVisible();
    await expect.poll(() => osm.some((u) => u.includes(TILES))).toBe(true);
  });

  await test.step("a search result fills the venue and address and keeps the spot", async () => {
    const form = page.getByRole("form", { name: "Neuer Termin" });
    await form.getByLabel("Ort suchen").fill("Sonnenhof Kempten");
    await form.getByLabel("Ort suchen").press("Enter");
    await expect(form).toBeVisible(); // Enter searched instead of saving the event.
    await form.getByRole("button", { name: /Gut Sonnenhof/ }).click();
    await expect(form.getByLabel("Veranstaltungsort")).toHaveValue("Gut Sonnenhof");
    await expect(form.getByLabel("Adresse")).toHaveValue("Hofweg 3, 87439 Kempten");
    await fillForm(form, { Art: { select: "Trauung" }, Name: "Trauung", "Beginn (Datum)": "12.06.2027", "Beginn (Uhrzeit)": "14:30" });
    await form.getByRole("button", { name: "Speichern" }).click();
    await expect(form).toBeHidden();
    await expect(page.getByTestId("event").filter({ hasText: "Trauung" })).toContainText("Gut Sonnenhof");
  });

  await test.step("guests open the exact spot from the website", async () => {
    await page.goto(`/${slug}`);
    await expect(page.getByTestId("site-event").getByRole("link", { name: "Karte ansehen" })).toHaveAttribute(
      "href",
      "https://www.openstreetmap.org/?mlat=47.72163&mlon=10.31322#map=17/47.72163/10.31322",
    );
  });

  await test.step("\"Immer laden\" remembers the choice in this browser", async () => {
    await page.goto(scheduleUrl(weddingId));
    await page.getByTestId("event").getByRole("button", { name: /^Bearbeiten/ }).click();
    const edit = page.getByRole("form", { name: "Termin bearbeiten" });
    await edit.getByRole("button", { name: "Immer laden" }).click();
    await expect(edit.getByRole("button", { name: "Punkt entfernen" })).toBeVisible();
    await edit.getByRole("button", { name: "Abbrechen" }).click();
    await page.getByRole("button", { name: "Termin hinzufügen" }).click();
    await expect(page.getByRole("form", { name: "Neuer Termin" }).getByTestId("location-picker")).toBeVisible();
  });

  await test.step("the wedding's place is found on the same map, on the Hochzeit tab", async () => {
    await page.goto(`${homeUrl(weddingId)}/hochzeit`);
    const form = page.getByRole("form", { name: "Eure Hochzeit" });
    await form.getByLabel("Ort suchen").fill("Sonnenhof Kempten");
    await form.getByLabel("Ort suchen").press("Enter");
    await form.getByRole("button", { name: /Gut Sonnenhof/ }).click();
    await expect(form.getByLabel("Ort (optional)")).toHaveValue("Gut Sonnenhof");
    await form.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByText("Gespeichert").first()).toBeVisible();
    await page.reload();
    await expect(form.getByLabel("Ort (optional)")).toHaveValue("Gut Sonnenhof");
    await expect(form.getByRole("button", { name: "Punkt entfernen" })).toBeVisible();
    await page.getByTestId("tab-preparation").click();
    await expect(page.getByTestId("wedding-badge")).toContainText("Gut Sonnenhof");
  });

  await test.step("a click on the map takes the place there, with its name", async () => {
    await page.route(`https://${NOMINATIM}/reverse**`, (route) =>
      route.fulfill({ json: { place_id: 2, lat: "47.72674", lon: "10.31389", name: "Rathaus Kempten", display_name: "Rathaus Kempten, Rathausplatz 29, 87435 Kempten", address: { road: "Rathausplatz", house_number: "29", postcode: "87435", city: "Kempten" } } }),
    );
    await page.goto(scheduleUrl(weddingId));
    await page.getByRole("button", { name: "Termin hinzufügen" }).click();
    const form = page.getByRole("form", { name: "Neuer Termin" });
    // Leaflet loads after the map's box appears and listens for clicks once it has set the box up.
    const map = form.getByTestId("location-map");
    await expect(map).toHaveClass(/leaflet-container/);
    await map.click();
    await expect(form.getByLabel("Veranstaltungsort")).toHaveValue("Rathaus Kempten");
    await expect(form.getByLabel("Adresse")).toHaveValue("Rathausplatz 29, 87435 Kempten");
    expect(osm.some((u) => u.includes("/reverse?") && u.includes("zoom=18"))).toBe(true);
  });
});
