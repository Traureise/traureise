import { expect, test } from "@playwright/test";
import { isAllowedUrl, recordForeignRequests } from "./fixtures";

test("the instance is up and healthy", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBe(true);
  expect(await res.json()).toEqual({ ok: true });
});

test("the third-party guard only allows the instance itself", () => {
  const base = "http://localhost:3000";
  expect(isAllowedUrl("http://localhost:3000/_next/static/x.js", base)).toBe(true);
  expect(isAllowedUrl("data:image/png;base64,AAAA", base)).toBe(true);
  expect(isAllowedUrl("https://fonts.googleapis.com/css2?family=Inter", base)).toBe(false);
  expect(isAllowedUrl("https://www.openstreetmap.org/search?query=x", base)).toBe(false);
  expect(isAllowedUrl("http://localhost:8025/api", base)).toBe(false);
});

test("the third-party guard records requests a page makes to other hosts", async ({ page, context, baseURL }) => {
  const foreign = recordForeignRequests(context, baseURL!);
  // Stand-in for an embedded font or script from a CDN; answered locally so no real request leaves.
  await context.route("https://cdn.example.org/**", (route) => route.fulfill({ status: 200, body: "" }));
  await page.goto("/login");
  expect(foreign).toEqual([]);
  await page.evaluate(() => fetch("https://cdn.example.org/font.woff2", { mode: "no-cors" }));
  expect(foreign).toEqual(["https://cdn.example.org/font.woff2"]);
});
