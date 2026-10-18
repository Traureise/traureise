import { expect, test } from "./fixtures";
import { login, uniqueEmail } from "./helpers/auth";
import { createWebsite } from "./helpers/editor";

test("the legal pages are linked from the app footer and say when they are not configured", async ({ page }) => {
  await page.goto("/");
  const footer = page.getByTestId("app-footer");
  await expect(footer.getByRole("link", { name: "Preise" })).toHaveCount(0);

  await footer.getByRole("link", { name: "Impressum" }).click();
  await expect(page).toHaveURL(/\/impressum$/);
  await expect(page.getByRole("heading", { level: 1, name: "Impressum" })).toBeVisible();
  await expect(page.getByTestId("legal-not-configured")).toBeVisible();

  await page.getByTestId("app-footer").getByRole("link", { name: "Datenschutz" }).click();
  await expect(page).toHaveURL(/\/datenschutz$/);
  await expect(page.getByRole("heading", { level: 1, name: "Datenschutzerklärung" })).toBeVisible();
  await expect(page.getByTestId("legal-not-configured")).toBeVisible();
  // Without billing there is no payment provider, and unnamed processors get neutral wording.
  await expect(page.getByTestId("privacy-payment")).toHaveCount(0);
  await expect(page.getByText("Creem")).toHaveCount(0);
  await expect(page.getByTestId("privacy-hostingUnnamed")).toBeVisible();
  await expect(page.getByTestId("privacy-storageLocal")).toBeVisible();
  await expect(page.getByTestId("privacy-login")).toContainText("15 Minuten");
  await expect(page.getByTestId("privacy-login")).toContainText("30 Tage");
  await expect(page.getByTestId("privacy-cookies")).toContainText("traureise_session");

  for (const path of ["/login", "/dashboard"]) {
    if (path === "/dashboard") await login(page, uniqueEmail("legal"), "Lea");
    else await page.goto(path);
    await expect(page.getByTestId("app-footer").getByRole("link", { name: "Impressum" })).toHaveAttribute("href", "/impressum");
    await expect(page.getByTestId("app-footer").getByRole("link", { name: "Datenschutz" })).toHaveAttribute("href", "/datenschutz");
  }
});

test("every public wedding website links the legal pages in a discreet footer", async ({ page }) => {
  await login(page, uniqueEmail("site-legal"), "Sina");
  const slug = `sina-und-tom-${Date.now()}`;
  await createWebsite(page, slug);
  await page.goto(`/${slug}`);
  const footer = page.getByTestId("site-footer");
  await expect(footer).toContainText("Erstellt mit Traureise");
  await footer.getByRole("link", { name: "Impressum" }).click();
  await expect(page).toHaveURL(/\/impressum$/);
  await page.goBack();
  await page.getByTestId("site-footer").getByRole("link", { name: "Datenschutz" }).click();
  await expect(page).toHaveURL(/\/datenschutz$/);
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
  await expect(page.getByTestId("app-footer").getByRole("link", { name: "Preise" })).toHaveCount(0);

  await page.getByRole("link", { name: "Konto", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Konto" })).toBeVisible();
  await expect(page.getByTestId("account-purchases")).toHaveCount(0);
});
