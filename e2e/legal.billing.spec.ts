import { expect, test } from "./fixtures";
import { login, uniqueEmail } from "./helpers/auth";
import { createWebsite } from "./helpers/editor";

// This instance mounts e2e/legal as the operator's files (see docker-compose.e2e.yml).
test("the operator's Markdown files are the legal pages, linked from the app footer", async ({ page }) => {
  await page.goto("/");
  const footer = page.getByTestId("app-footer");

  await footer.getByRole("link", { name: "Impressum" }).click();
  await expect(page).toHaveURL(/\/impressum$/);
  await expect(page).toHaveTitle(/^Impressum/);
  const content = page.getByTestId("legal-content");
  await expect(content.getByRole("heading", { level: 1, name: "Impressum" })).toBeVisible();
  await expect(content.getByRole("heading", { level: 2, name: "Angaben gemäß § 5 DDG" })).toBeVisible();
  await expect(content).toContainText("Erika Musterfrau");
  await expect(content.getByRole("link", { name: "kontakt@example.org" })).toHaveAttribute("href", "mailto:kontakt@example.org");
  // Raw HTML in a file is shown as text, never run.
  await expect(content).toContainText("<script>window.injected = true</script>");
  expect(await page.evaluate(() => (window as unknown as { injected?: boolean }).injected)).toBeUndefined();

  await page.getByTestId("app-footer").getByRole("link", { name: "Datenschutz" }).click();
  await expect(page).toHaveURL(/\/datenschutz$/);
  await expect(page.getByTestId("legal-content").getByRole("heading", { level: 1, name: "Datenschutzerklärung" })).toBeVisible();

  await page.getByTestId("app-footer").getByRole("link", { name: "AGB" }).click();
  await expect(page).toHaveURL(/\/agb$/);
  await expect(page.getByTestId("legal-content")).toContainText("Diese Testbedingungen");

  await expect(page.getByTestId("app-footer").getByRole("link", { name: "Preise" })).toHaveAttribute("href", "/preise");
});

test("every public wedding website links the legal pages in a discreet footer", async ({ page }) => {
  await login(page, uniqueEmail("site-legal"), "Sina");
  const slug = `sina-und-tom-${Date.now()}`;
  await createWebsite(page, slug);
  await page.goto(`/${slug}`);
  const footer = page.getByTestId("site-footer");
  await expect(footer).toContainText("Erstellt mit Traureise");
  await expect(footer.getByRole("link")).toHaveText(["Impressum", "Datenschutz", "AGB"]);
  await footer.getByRole("link", { name: "Datenschutz" }).click();
  await expect(page).toHaveURL(/\/datenschutz$/);
});
