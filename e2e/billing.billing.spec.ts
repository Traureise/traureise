import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "./fixtures";
import { login, uniqueEmail } from "./helpers/auth";
import { createWebsite } from "./helpers/editor";

const STUB_URL = process.env.E2E_CREEM_STUB_URL ?? "http://localhost:4010";

test("the pricing page lists every tier, and all of them can be bought", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("app-footer").getByRole("link", { name: "Preise" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Preise" })).toBeVisible();

  const tier = (id: string) => page.getByTestId(`tier-${id}`);
  await expect(tier("website").getByTestId("tier-price")).toHaveText("kostenlos");
  await expect(tier("rsvp").getByTestId("tier-price")).toHaveText(/^49\s€$/);
  await expect(tier("invitations").getByTestId("tier-price")).toHaveText(/^139\s€$/);
  await expect(tier("complete").getByTestId("tier-price")).toHaveText(/^149\s€$/);
  await expect(page.getByText("inkl. MwSt.", { exact: false })).toBeVisible();

  for (const id of ["rsvp", "invitations", "complete"]) {
    await expect(tier(id).getByRole("link", { name: "Anmelden, um zu kaufen" })).toBeVisible();
    await expect(tier(id).getByTestId("coming-soon")).toHaveCount(0);
  }
});

async function stub(request: APIRequestContext, path: string) {
  const res = await request.post(`${STUB_URL}${path}`);
  expect(res.ok()).toBe(true);
  return (await res.json()) as { status: number; body: { ok: boolean; outcome: string } };
}

test.describe("checkout", () => {
  // The buyer is sent to the payment provider's checkout page, played here by the local stub.
  test.use({ allowedHosts: [new URL(STUB_URL).host] });

  test("buying a tier through the checkout grants it; replays are ignored and a refund revokes it", async ({ page, request }) => {
    test.setTimeout(3 * 60_000);
    const card = page.getByTestId("website-card");
    let checkoutId = "";

    await test.step("a couple with a website opens the checkout from the pricing page", async () => {
      await login(page, uniqueEmail("kauf"), "Paula");
      await createWebsite(page, `paula-${Date.now()}`, "2027-06-12");
      await page.goto("/dashboard");
      await expect(card.getByTestId("website-plan")).toHaveText("Paket: Website");
      await card.getByRole("link", { name: "Paket wählen" }).click();
      await expect(page).toHaveURL(/\/preise$/);
      const rsvp = page.getByTestId("tier-rsvp");
      await expect(rsvp.getByLabel("Für welche Website?")).toHaveValue(/[0-9a-f-]{36}/);
      await rsvp.getByRole("button", { name: "Jetzt kaufen" }).click();
      await expect(page).toHaveURL(new RegExp(`^${STUB_URL}/checkout/ch_`));
      await expect(page.getByText("prod_e2e_rsvp")).toBeVisible();
      checkoutId = new URL(page.url()).pathname.split("/").pop()!;
    });

    await test.step("paying sends the webhook and returns to the dashboard with the tier unlocked", async () => {
      await page.getByRole("button", { name: "Bezahlen" }).click();
      await expect(page).toHaveURL(/\/dashboard\?kauf=danke/);
      await expect(page.getByTestId("purchase-thanks")).toBeVisible();
      await expect(card.getByTestId("website-plan")).toHaveText("Paket: RSVP");

      await page.getByRole("link", { name: "Konto", exact: true }).click();
      const purchase = page.getByTestId("purchase");
      await expect(purchase).toHaveCount(1);
      await expect(purchase).toContainText("RSVP für „Anna & Ben“");
      await expect(purchase).toContainText("gültig bis 12. Juni 2028");

      await page.goto("/preise");
      await expect(page.getByTestId("tier-rsvp")).toContainText("Deine Websites haben dieses Paket schon.");
    });

    await test.step("a replayed webhook is ignored", async () => {
      const replay = await stub(request, `/test/checkouts/${checkoutId}/replay`);
      expect(replay).toEqual({ status: 200, body: { ok: true, outcome: "duplicate" } });
      await page.goto("/konto");
      await expect(page.getByTestId("purchase")).toHaveCount(1);
    });

    await test.step("a refund revokes the tier, and a webhook without a valid signature is rejected", async () => {
      const refund = await stub(request, `/test/checkouts/${checkoutId}/refund`);
      expect(refund).toEqual({ status: 200, body: { ok: true, outcome: "applied" } });
      await page.goto("/konto");
      await expect(page.getByTestId("purchase")).toContainText("nicht mehr aktiv");
      await page.goto("/dashboard");
      await expect(card.getByTestId("website-plan")).toHaveText("Paket: Website");

      const forged = await request.post("/api/billing/webhook", {
        data: { id: "evt_forged", eventType: "checkout.completed", object: {} },
        headers: { "creem-signature": "00".repeat(32) },
      });
      expect(forged.status()).toBe(401);
    });
  });
});
