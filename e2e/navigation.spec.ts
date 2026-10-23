import { expect, test } from "./fixtures";
import { login, uniqueEmail } from "./helpers/auth";
import { createWeddingWithWebsite, homeUrl } from "./helpers/weddings";

/**
 * Walks every page a couple can reach from their wedding, by following links, and checks each has a way back:
 * to the wedding's home and to the list of weddings. Pages outside a wedding (account, list, form) lead to
 * the list and, through the logo, to the most recent wedding.
 */
test("every couple page has a way back to the wedding and to the list of weddings", async ({ page }) => {
  test.setTimeout(5 * 60_000);
  await login(page, uniqueEmail("wege"), "Wanda");
  const { weddingId } = await createWeddingWithWebsite(page, `wanda-${Date.now()}`);
  const home = homeUrl(weddingId);

  const seen = new Set<string>();
  const queue = [home, "/hochzeiten", "/hochzeiten/neu", "/konto", "/dashboard"];
  while (queue.length > 0) {
    const path = queue.shift()!;
    if (seen.has(path)) continue;
    seen.add(path);
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
    const landed = new URL(page.url()).pathname;

    const hrefs = await page.locator("a[href^='/']").evaluateAll((links) => links.map((a) => a.getAttribute("href")!));
    const back = new Set(hrefs.map((h) => h.split(/[?#]/)[0]!));
    expect(back.has("/hochzeiten"), `${landed} links to the list of weddings`).toBe(true);
    if (landed.startsWith(home)) expect(back.has(home), `${landed} links to the wedding's home`).toBe(true);
    else expect(back.has("/dashboard") || back.has(home), `${landed} links to the most recent wedding`).toBe(true);

    // Follow every link to a couple page of this wedding or the account (download links and public pages excluded).
    const follow = new Set(
      (await page.locator("a[href^='/']:not([download])").evaluateAll((links) => links.map((a) => a.getAttribute("href")!))).map((h) => h.split(/[?#]/)[0]!),
    );
    for (const href of follow) {
      if (href.startsWith(home) || href === "/konto" || href === "/hochzeiten") queue.push(href);
    }
  }

  // The walk reached every tab (Hochzeit, guest list, Ablauf), every card editor and preview, and every website editor page
  // (theme, design, home and the eight template sections, which have ids).
  const visited = [...seen];
  expect(visited.filter((p) => /\/karten\/[0-9a-f-]{36}$/.test(p))).toHaveLength(4);
  expect(visited.filter((p) => /\/karten\/[0-9a-f-]{36}\/vorschau$/.test(p))).toHaveLength(4);
  expect(visited.filter((p) => /\/website\/[0-9a-f-]{36}\/(theme|design|home)$/.test(p))).toHaveLength(3);
  expect(visited.filter((p) => /\/website\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/.test(p))).toHaveLength(8);
  for (const suffix of ["/hochzeit", "/ablauf", "/gaeste", "/gaeste/einstellungen", "/gaeste/vorschau"]) expect(visited).toContain(`${home}${suffix}`);
});
