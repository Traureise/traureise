import { expect, test } from "./fixtures";
import { login, uniqueEmail } from "./helpers/auth";
import { addHousehold, household } from "./helpers/guests";

test("a couple can start with any card; the website follows later for the same wedding, guests and cards", async ({ page }) => {
  const slug = `clara-dan-${Date.now()}`;
  let weddingId = "";

  await test.step("the Erstellen menu is in the order a couple needs things", async () => {
    await login(page, uniqueEmail("karte-zuerst"), "Clara");
    await expect(page.getByRole("navigation", { name: "Dashboard" }).getByRole("link")).toHaveText(["Verlobung", "Save the Dates", "Hochzeitswebsites", "Einladungen", "Dankeskarten"]);
    await page.getByRole("button", { name: "Erstellen", exact: true }).click();
    await expect(page.getByRole("menuitem")).toHaveText(["Verlobungsanzeige", "Save the Date", "Hochzeitswebsite", "Einladung", "Dankeskarte"]);
  });

  await test.step("a Save the Date first asks only for names and date, then opens the editor", async () => {
    await page.getByRole("menuitem", { name: "Save the Date" }).click();
    const dialog = page.getByRole("dialog", { name: "Save the Date erstellen" });
    await dialog.getByLabel("Eure Namen").fill("Clara & Dan");
    await dialog.getByLabel("Hochzeitsdatum (optional)").fill("2027-06-12");
    await dialog.getByRole("button", { name: "Weiter" }).click();
    await expect(page).toHaveURL(/\/websites\/[0-9a-f-]{36}\/karten\/save-the-date$/);
    weddingId = /\/websites\/([0-9a-f-]{36})\//.exec(page.url())![1]!;
    await expect(page.getByTestId("wedding-details")).toContainText("Clara & Dan · 12. Juni 2027");
    await expect(page.getByTestId("card-preview")).toContainText("12. Juni 2027");
  });

  await test.step("names, date and place are changed without a website editor", async () => {
    await page.getByTestId("wedding-details").getByRole("button", { name: "Angaben ändern" }).click();
    const dialog = page.getByRole("dialog", { name: "Eure Hochzeit" });
    await dialog.getByLabel("Hochzeitsdatum (optional)").fill("2027-07-03");
    await dialog.getByLabel("Ort (optional)").fill("Beispielstadt");
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("wedding-details")).toContainText("3. Juli 2027");
    await expect(page.getByTestId("card-preview")).toContainText("3. Juli 2027");
  });

  await test.step("the dashboard opens on the Save the Dates; the wedding has no website, and none is public", async () => {
    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: "Save the Dates" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("card-item")).toHaveCount(1);
    await page.getByRole("link", { name: "Hochzeitswebsites" }).click();
    const wedding = page.getByTestId("website-card");
    await expect(wedding.getByTestId("no-website")).toBeVisible();
    await expect(wedding).toContainText("Beispielstadt");
    const generated = await page.request.get(`/websites/${weddingId}/edit`, { maxRedirects: 0 });
    expect(generated.status()).toBe(307);
  });

  await test.step("the guest list works without a website", async () => {
    await page.getByTestId("website-card").getByRole("link", { name: "Gäste" }).click();
    await expect(page).toHaveURL(new RegExp(`/websites/${weddingId}/gaeste$`));
    await expect(page.getByRole("link", { name: "Website bearbeiten" })).toHaveCount(0);
    await addHousehold(page, "Familie Kern", [{ name: "Eva" }]);
  });

  await test.step("Hochzeitswebsite from the menu offers the existing wedding first", async () => {
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Erstellen", exact: true }).click();
    await page.getByRole("menuitem", { name: "Hochzeitswebsite" }).click();
    const dialog = page.getByRole("dialog", { name: "Neue Hochzeitswebsite" });
    await expect(dialog.getByRole("radio", { name: "Clara & Dan" })).toBeChecked();
    await expect(dialog.getByLabel("Eure Namen")).toHaveValue("Clara & Dan");
    await expect(dialog.getByLabel("Hochzeitsdatum (optional)")).toHaveValue("2027-07-03");
    await dialog.getByRole("radio", { name: "Neue Hochzeit" }).check();
    await expect(dialog.getByLabel("Eure Namen")).toHaveValue("");
    await dialog.getByRole("button", { name: "Abbrechen" }).click();
  });

  await test.step("creating the website keeps the wedding: same guests and cards, now public", async () => {
    await page.goto("/dashboard?tab=websites");
    await page.getByTestId("website-card").getByRole("button", { name: "Website erstellen" }).click();
    const dialog = page.getByRole("dialog", { name: "Neue Hochzeitswebsite" });
    await expect(dialog.getByTestId("website-for")).toHaveCount(0);
    expect((await page.request.get(`/${await dialog.getByLabel("Webadresse").inputValue()}`)).status()).toBe(404);
    await dialog.getByLabel("Webadresse").fill(slug);
    await dialog.getByRole("button", { name: "Website erstellen" }).click();
    await expect(page).toHaveURL(`/websites/${weddingId}/edit`);
    expect((await page.request.get(`/${slug}`)).status()).toBe(200);

    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: "Hochzeitswebsites" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("website-card")).toHaveCount(1);
    await expect(page.getByTestId("website-card").getByTestId("no-website")).toHaveCount(0);
    await page.goto(`/websites/${weddingId}/gaeste`);
    await expect(household(page, "Familie Kern")).toHaveCount(1);
    await page.goto("/dashboard?tab=save-the-dates");
    await expect(page.getByTestId("card-item")).toHaveCount(1);
  });
});
