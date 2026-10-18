import { expect, test } from "./fixtures";
import { login, uniqueEmail } from "./helpers/auth";
import { createWebsite } from "./helpers/editor";

// This instance has no IMPRINT_FILE, PRIVACY_FILE or TERMS_FILE (see docker-compose.e2e.yml).
test("without the operator's files the legal pages do not exist and nothing links to them", async ({ page, request }) => {
  for (const path of ["/impressum", "/datenschutz", "/agb"]) expect((await request.get(path)).status()).toBe(404);

  await page.goto("/");
  const footer = page.getByTestId("app-footer");
  await expect(footer).toBeVisible();
  for (const name of ["Impressum", "Datenschutz", "AGB", "Preise"]) await expect(footer.getByRole("link", { name })).toHaveCount(0);

  await login(page, uniqueEmail("no-legal"), "Lea");
  const slug = `lea-und-max-${Date.now()}`;
  await createWebsite(page, slug);
  await page.goto(`/${slug}`);
  const siteFooter = page.getByTestId("site-footer");
  await expect(siteFooter).toContainText("Erstellt mit Traureise");
  await expect(siteFooter.getByRole("link")).toHaveCount(0);
});

test("without billing there are no prices, plans or purchases anywhere", async ({ page, request }) => {
  expect((await request.get("/preise")).status()).toBe(404);
  expect((await request.post("/api/billing/webhook", { data: "{}" })).status()).toBe(404);

  await login(page, uniqueEmail("no-billing"), "Nora");
  await createWebsite(page, `nora-${Date.now()}`);
  await page.goto("/dashboard");
  await expect(page.getByTestId("website-card")).toBeVisible();
  await expect(page.getByTestId("website-plan")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Paket wählen" })).toHaveCount(0);

  await page.getByRole("link", { name: "Konto", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Konto" })).toBeVisible();
  await expect(page.getByTestId("account-purchases")).toHaveCount(0);
});
