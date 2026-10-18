import { expect, test } from "./fixtures";

test("a configured operator shows a complete Impressum", async ({ page }) => {
  await page.goto("/impressum");
  await expect(page.getByTestId("legal-not-configured")).toHaveCount(0);
  await expect(page.getByText("Angaben gemäß § 5 DDG")).toBeVisible();
  await expect(page.getByTestId("operator-address")).toHaveText(
    ["Musterfrau Hochzeitsdienste", "Erika Musterfrau", "Musterstraße 1", "12345 Musterstadt", "Deutschland"].join(""),
  );
  await expect(page.getByRole("link", { name: "E-Mail: kontakt@example.org" })).toHaveAttribute("href", "mailto:kontakt@example.org");
  await expect(page.getByText("Telefon: +49 30 1234567")).toBeVisible();
  await expect(page.getByText("Gemäß § 19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung).")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV" })).toBeVisible();
  await expect(page.getByText("Erika Musterfrau, Anschrift wie oben")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Verbraucherstreitbeilegung" })).toBeVisible();
});

test("the privacy policy names the configured processors and the payment provider", async ({ page }) => {
  await page.goto("/datenschutz");
  await expect(page.getByTestId("privacy-controller").getByTestId("operator-address")).toContainText("Erika Musterfrau");
  await expect(page.getByTestId("privacy-hosting")).toContainText("Beispiel Hosting GmbH, Musterstadt");
  await expect(page.getByTestId("privacy-email")).toContainText("Beispiel Mail GmbH, Musterstadt");
  await expect(page.getByTestId("privacy-payment")).toContainText("Creem (Armitage Labs OÜ, Tallinn, Estland)");
  await expect(page.getByTestId("app-footer").getByRole("link", { name: "Preise" })).toHaveAttribute("href", "/preise");
});
