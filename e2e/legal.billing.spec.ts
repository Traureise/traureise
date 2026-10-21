import { expect, test } from "./fixtures";
import { login, uniqueEmail } from "./helpers/auth";
import { createWebsite } from "./helpers/editor";

// This instance links a fictitious operator's legal pages (see docker-compose.e2e.yml). They live elsewhere, so the
// tests check the links and never follow them: the fixture fails any request to another host.
const LINKS = {
  Impressum: "https://docs.example.org/impressum/",
  Datenschutz: "https://docs.example.org/datenschutz/",
  AGB: "https://docs.example.org/agb/",
};

test("the app footer links the operator's legal pages; Traureise shows none itself", async ({ page, request }) => {
  for (const path of ["/impressum", "/datenschutz", "/agb"]) expect((await request.get(path)).status()).toBe(404);
  await page.goto("/");
  const footer = page.getByTestId("app-footer");
  for (const [name, href] of Object.entries(LINKS)) await expect(footer.getByRole("link", { name })).toHaveAttribute("href", href);
  await expect(footer.getByRole("link", { name: "Preise" })).toHaveAttribute("href", "/preise");

  // Where people buy, the terms are named too.
  await page.goto("/preise");
  const terms = page.getByTestId("pricing-terms");
  await expect(terms.getByRole("link", { name: "AGB" })).toHaveAttribute("href", LINKS.AGB);
  await expect(terms.getByRole("link", { name: "Datenschutzerklärung" })).toHaveAttribute("href", LINKS.Datenschutz);
});

test("every public wedding website links the legal pages in a discreet footer", async ({ page }) => {
  await login(page, uniqueEmail("site-legal"), "Sina");
  const slug = `sina-und-tom-${Date.now()}`;
  await createWebsite(page, slug);
  await page.goto(`/${slug}`);
  const footer = page.getByTestId("site-footer");
  await expect(footer).toContainText("Erstellt mit Traureise");
  await expect(footer.getByRole("link")).toHaveText(["Erstellt mit Traureise", ...Object.keys(LINKS)]);
  for (const [name, href] of Object.entries(LINKS)) await expect(footer.getByRole("link", { name })).toHaveAttribute("href", href);
});
