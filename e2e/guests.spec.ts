import { unzipSync } from "fflate";
import type { Browser, Locator, Page } from "@playwright/test";
import { expect, recordForeignRequests, test } from "./fixtures";
import { login, uniqueEmail } from "./helpers/auth";
import { captureWindowOpen, openedUrls } from "./helpers/cards";
import { createWebsite } from "./helpers/editor";
import { addEvent, addHousehold, daysUntil, guestLink, guestsUrl, household, runGuestJobs, setClockOffset, weddingIdOf } from "./helpers/guests";
import { waitForMail } from "./helpers/mailpit";

/** A guest opens their link in a browser of their own: no session, and no third-party requests either. */
async function asGuest(browser: Browser, baseURL: string, link: string, run: (guest: Page) => Promise<void>) {
  const context = await browser.newContext({ locale: "de-DE", timezoneId: "Europe/Berlin" });
  const foreign = recordForeignRequests(context, baseURL);
  try {
    const guest = await context.newPage();
    await guest.goto(link);
    await run(guest);
  } finally {
    await context.close();
  }
  expect(foreign, "requests to third-party hosts from the guest form").toEqual([]);
}

const person = (root: Page | Locator, name: string) => root.getByRole("region", { name, exact: true });
const berlinDay = (offsetDays: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() + offsetDays * 86_400_000));

test("a couple invites households, guests answer through their links, and the couple sees and exports it all", async ({ page, browser, baseURL }) => {
  test.setTimeout(5 * 60_000);
  const email = uniqueEmail("gaeste");
  let editorUrl = "";
  let weberLink = "";
  let muellerLink = "";
  await captureWindowOpen(page);

  await test.step("the couple sets up events, households, RSVP settings and polls for free", async () => {
    await login(page, email, "Nora");
    editorUrl = await createWebsite(page, `nora-und-tim-${Date.now()}`);
    await addEvent(page, editorUrl, "Feier", "2027-06-12", "18:00");
    await addEvent(page, editorUrl, "Brunch", "2027-06-13", "11:00");

    await page.goto(editorUrl);
    await page.getByRole("navigation", { name: "Website bearbeiten" }).getByRole("link", { name: /^Gäste/ }).click();
    await expect(page).toHaveURL(guestsUrl(editorUrl));
    await expect(page.getByRole("heading", { level: 1, name: "Gäste" })).toBeVisible();
    // Self-hosted without billing: no locks, no prices.
    await expect(page.getByTestId("rsvp-locked")).toHaveCount(0);
    await expect(page.locator('a[href="/preise"]')).toHaveCount(0);

    await addHousehold(page, "Familie Weber", [{ name: "Clara" }, { name: "Max" }]);
    await addHousehold(page, "Müller", [{ name: "Tom", child: true }], { uninvite: ["Brunch"] });
    await expect(household(page, "Müller")).toContainText("Eingeladen zu: Feier");

    await page.getByRole("link", { name: "Einstellungen" }).click();
    const settings = page.getByRole("form", { name: "RSVP-Einstellungen" });
    await settings.getByLabel("Antworten bis").fill("2027-05-01");
    await settings.getByRole("button", { name: "Gericht hinzufügen" }).click();
    await settings.getByLabel("Gericht 1", { exact: true }).fill("Fisch");
    await settings.getByRole("button", { name: "Gericht hinzufügen" }).click();
    await settings.getByLabel("Gericht 2", { exact: true }).fill("Vegetarisch");
    await settings.getByLabel("Menüwahl für").selectOption({ label: "Feier" });
    await settings.getByLabel("E-Mail bei jeder Antwort").check();
    await settings.getByRole("button", { name: "Einstellungen speichern" }).click();
    await expect(page.getByText("Gespeichert").first()).toBeVisible();

    const polls = page.getByTestId("rsvp-polls");
    await polls.getByRole("button", { name: "Umfrage hinzufügen" }).click();
    let poll = polls.getByRole("form", { name: "Neue Umfrage" });
    await poll.getByLabel("Frage").fill("Musikwunsch?");
    await poll.getByLabel("Antwort 1", { exact: true }).fill("Pop");
    await poll.getByLabel("Antwort 2", { exact: true }).fill("Jazz");
    await poll.getByLabel("Mehrfachauswahl").check();
    await poll.getByLabel("Freie Antwort „Andere“ erlauben").check();
    await poll.getByRole("button", { name: "Umfrage speichern" }).click();
    await expect(polls.getByTestId("poll")).toHaveCount(1);

    await polls.getByRole("button", { name: "Umfrage hinzufügen" }).click();
    poll = polls.getByRole("form", { name: "Neue Umfrage" });
    await poll.getByLabel("Frage").fill("Braucht ihr den Shuttle?");
    await poll.getByLabel("Antwort 1", { exact: true }).fill("Ja");
    await poll.getByLabel("Antwort 2", { exact: true }).fill("Nein");
    await poll.getByLabel("einmal pro Haushalt").check();
    await poll.getByRole("button", { name: "Umfrage speichern" }).click();
    await expect(polls.getByTestId("poll")).toHaveCount(2);
    await expect(polls.getByTestId("poll").nth(1)).toContainText("Ja, Nein · einmal pro Haushalt");

    await page.reload();
    await expect(settings.getByLabel("Antworten bis")).toHaveValue("2027-05-01");
    await expect(settings.getByLabel("Gericht 1", { exact: true })).toHaveValue("Fisch");
    await expect(settings.getByLabel("E-Mail bei jeder Antwort")).toBeChecked();
  });

  await test.step("the preview shows the form as guests see it, without sending", async () => {
    await page.getByRole("link", { name: "Vorschau" }).click();
    const preview = page.getByTestId("guest-form-preview");
    await expect(preview.getByRole("heading", { level: 1, name: "Hallo Familie Weber!" })).toBeVisible();
    await expect(preview.getByTestId("preview-note")).toBeVisible();
    await expect(preview.getByText("Bitte antwortet bis zum 1. Mai 2027.")).toBeVisible();
    await person(preview, "Clara").getByLabel("Ich komme").check();
    await expect(person(preview, "Clara").getByLabel(/^Feier/)).toBeChecked();
    await expect(preview.getByRole("button", { name: "Antwort senden" })).toBeDisabled();
  });

  await test.step("each household has a personal link to copy or send by WhatsApp", async () => {
    await page.getByRole("link", { name: "Übersicht" }).click();
    weberLink = await guestLink(page, "Familie Weber");
    muellerLink = await guestLink(page, "Müller");
    expect(weberLink).not.toBe(muellerLink);
    await household(page, "Familie Weber").getByRole("button", { name: "WhatsApp" }).click();
    const href = (await openedUrls(page)).at(-1)!;
    expect(href.startsWith("https://wa.me/?text=")).toBe(true);
    const text = decodeURIComponent(href.slice("https://wa.me/?text=".length));
    expect(text).toContain("Hallo Familie Weber, wir heiraten!");
    expect(text.endsWith(`\n${weberLink}`)).toBe(true);
  });

  await test.step("a household invited to some events sees only those, and no meal for others", async () => {
    await asGuest(browser, baseURL!, muellerLink, async (guest) => {
      await expect(guest.getByRole("heading", { level: 1, name: "Hallo Müller!" })).toBeVisible();
      await expect(guest.getByText("Clara")).toHaveCount(0);
      await person(guest, "Tom").getByLabel("Ich komme").check();
      const tom = person(guest, "Tom");
      await expect(tom.getByRole("checkbox", { name: /^Feier/ })).toBeChecked();
      await expect(tom.getByRole("checkbox", { name: /^Brunch/ })).toHaveCount(0);
      await expect(tom.getByRole("radio", { name: "Fisch" })).toBeVisible();
    });
  });

  await test.step("a household answers for each person, asks to bring two people and writes a message", async () => {
    await asGuest(browser, baseURL!, weberLink, async (guest) => {
      const clara = person(guest, "Clara");
      await clara.getByLabel("Ich komme").check();
      await clara.getByRole("checkbox", { name: /^Brunch/ }).check();
      await clara.getByRole("radio", { name: "Vegetarisch" }).check();
      await clara.getByLabel("Allergien und Unverträglichkeiten").fill("Nüsse");
      await clara.getByRole("checkbox", { name: "Pop" }).check();
      await clara.getByRole("checkbox", { name: "Andere" }).check();
      await clara.getByLabel("Andere Antwort: Musikwunsch?").fill("Schlager");
      await person(guest, "Max").getByLabel("Ich kann leider nicht").check();
      await guest.getByRole("radio", { name: "Ja" }).check();
      await guest.getByLabel("Name der Begleitung 1").fill("Lena");
      await guest.getByRole("button", { name: "Weitere Person" }).click();
      await guest.getByLabel("Name der Begleitung 2").fill("Jonas");
      await guest.getByLabel("Nachricht an Anna & Ben").fill("Wir freuen uns!");
      await guest.getByRole("button", { name: "Antwort senden" }).click();
      await expect(guest.getByTestId("guest-form-saved")).toHaveText("Danke! Eure Antwort ist gespeichert.");
      await expect(guest.getByTestId("request-outcomes")).toContainText("Lena: angefragt");
    });
    const mail = await waitForMail(page.request, email, "Familie Weber hat geantwortet");
    expect(mail).toContain("Kommen: Clara");
    expect(mail).toContain("Kommen nicht: Max");
    expect(mail).toContain("Möchten gern mitbringen: Lena und Jonas");
    expect(mail).toContain("Nachricht: Wir freuen uns!");
  });

  await test.step("the household changes its answer through the same link", async () => {
    await asGuest(browser, baseURL!, weberLink, async (guest) => {
      await expect(guest.getByTestId("answered-note")).toContainText("bis zum 1. Mai 2027");
      await expect(person(guest, "Clara").getByLabel("Allergien und Unverträglichkeiten")).toHaveValue("Nüsse");
      const max = person(guest, "Max");
      await max.getByLabel("Ich komme").check();
      await max.getByRole("checkbox", { name: /^Brunch/ }).uncheck();
      await max.getByRole("radio", { name: "Fisch" }).check();
      await guest.getByRole("button", { name: "Antwort ändern" }).click();
      await expect(guest.getByTestId("guest-form-saved")).toBeVisible();
    });
  });

  await test.step("another household's link can neither read nor change this household, and an unknown link is a 404", async () => {
    await page.goto(guestsUrl(editorUrl));
    const idOf = (name: string) => page.getByTestId("guest-person").filter({ hasText: name }).getAttribute("data-guest-id");
    const [claraId, tomId] = [(await idOf("Clara"))!, (await idOf("Tom"))!];
    await asGuest(browser, baseURL!, muellerLink, async (guest) => {
      await expect(guest.getByTestId("guest-form-person")).toHaveCount(1);
      await expect(guest.getByText(/Clara|Max|Wir freuen uns/)).toHaveCount(0);
      // A tampered request that answers for Clara with the Müller link is refused.
      await guest.route("**/antwort/**", (route) =>
        route.request().method() === "POST" ? route.continue({ postData: route.request().postData()!.replaceAll(tomId, claraId) }) : route.continue(),
      );
      await person(guest, "Tom").getByLabel("Ich kann leider nicht").check();
      await guest.getByRole("button", { name: "Antwort senden" }).click();
      await expect(guest.getByText("Diese Person gehört nicht zu diesem Haushalt.")).toBeVisible();
    });
    await expect(page.getByTestId("guest-person").filter({ hasText: "Clara" }).getByTestId("guest-person-status")).toHaveText("kommt");
    const unknown = await page.request.get(`/antwort/${"x".repeat(43)}`);
    expect(unknown.status()).toBe(404);
    expect(unknown.headers()["referrer-policy"]).toBe("no-referrer");
  });

  await test.step("the overview counts people, events, meals, polls and allergies", async () => {
    await page.goto(guestsUrl(editorUrl));
    const overview = page.getByTestId("guest-overview");
    await expect(overview.getByTestId("count-coming")).toHaveText("2");
    await expect(overview.getByTestId("count-notComing")).toHaveText("0");
    await expect(overview.getByTestId("count-open")).toHaveText("1");
    await expect(overview.getByRole("img", { name: "2 kommen, 0 kommen nicht, 1 offen" })).toBeVisible();
    await expect(overview.getByTestId("overview-households")).toHaveText("1 von 2 Haushalten haben geantwortet");
    await expect(overview.getByTestId("overview-events")).toContainText(/Feier\s*2/);
    await expect(overview.getByTestId("overview-events")).toContainText(/Brunch\s*1/);
    await expect(overview.getByTestId("overview-meals")).toContainText(/Fisch\s*1/);
    await expect(overview.getByTestId("overview-meals")).toContainText(/Vegetarisch\s*1/);
    const music = overview.getByTestId("overview-poll").filter({ hasText: "Musikwunsch?" });
    await expect(music).toContainText(/Pop\s*1/);
    await expect(music).toContainText("Andere Antworten: Schlager");
    await expect(overview.getByTestId("overview-poll").filter({ hasText: "Shuttle" })).toContainText(/Ja\s*1/);
    await expect(overview.getByTestId("overview-allergies")).toContainText("Clara (Familie Weber): Nüsse");

    await household(page, "Familie Weber").getByText("Antworten ansehen").click();
    await expect(household(page, "Familie Weber").getByTestId("household-message")).toHaveText("Wir freuen uns!");
    await expect(household(page, "Familie Weber").getByTestId("guest-person").first()).toContainText("Allergien: Nüsse");

    await page.getByRole("link", { name: "Offen (1)" }).click();
    await expect(page.getByTestId("household")).toHaveCount(1);
    await expect(page.getByTestId("household")).toContainText("Müller");
    await page.getByRole("link", { name: "Geantwortet (1)" }).click();
    await expect(page.getByTestId("household")).toContainText("Familie Weber");
  });

  await test.step("the couple adds one requested guest and declines the other; the household sees it", async () => {
    await page.goto(guestsUrl(editorUrl));
    const requests = page.getByTestId("guest-request");
    await expect(requests).toHaveCount(2);
    await requests.filter({ hasText: "Lena" }).getByRole("button", { name: "Zur Gästeliste" }).click();
    await expect(requests).toHaveCount(1);
    await requests.filter({ hasText: "Jonas" }).getByRole("button", { name: "Ablehnen" }).click();
    await expect(requests).toHaveCount(0);
    await expect(household(page, "Familie Weber")).toContainText("3 Personen: Clara, Max, Lena");

    await asGuest(browser, baseURL!, weberLink, async (guest) => {
      await expect(guest.getByTestId("request-outcomes")).toContainText("Lena: ist dabei");
      await expect(guest.getByTestId("request-outcomes")).toContainText("Jonas: leider nicht möglich");
      await expect(person(guest, "Lena")).toBeVisible();
    });
  });

  await test.step("the CSV export has every person with their answers", async () => {
    const res = await page.request.get(`${guestsUrl(editorUrl)}/export`);
    expect(res.headers()["content-type"]).toContain("text/csv");
    const lines = (await res.text()).replace(/^﻿/, "").trimEnd().split("\r\n");
    expect(lines[0]).toBe(`"Haushalt";"Name";"Kind";"Status";"Feier";"Brunch";"Essen";"Allergien";"Musikwunsch?";"Braucht ihr den Shuttle?";"Nachricht"`);
    expect(lines).toContain(`"Familie Weber";"Clara";"nein";"kommt";"ja";"ja";"Vegetarisch";"Nüsse";"Pop, Schlager";"Ja";"Wir freuen uns!"`);
    expect(lines).toContain(`"Familie Weber";"Max";"nein";"kommt";"ja";"nein";"Fisch";"";"";"Ja";"Wir freuen uns!"`);
    expect(lines).toContain(`"Familie Weber";"Lena";"nein";"offen";"";"";"";"";"";"Ja";"Wir freuen uns!"`);
    expect(lines).toContain(`"Müller";"Tom";"ja";"offen";"";"";"";"";"";"";""`);
  });

  await test.step("the account export contains the guest list and answers", async () => {
    const zip = unzipSync(new Uint8Array(await (await page.request.get("/konto/export")).body()));
    const data = JSON.parse(new TextDecoder().decode(zip["data.json"]));
    const guests = data.weddings[0].guests;
    expect(guests.settings).toMatchObject({ replyBy: "2027-05-01", notify: "each" });
    expect(guests.polls.map((p: { question: string }) => p.question)).toEqual(["Musikwunsch?", "Braucht ihr den Shuttle?"]);
    const weber = guests.households.find((h: { name: string }) => h.name === "Familie Weber");
    expect(weber).toMatchObject({ message: "Wir freuen uns!", requests: [{ name: "Lena", status: "added" }, { name: "Jonas", status: "declined" }] });
    expect(weber.people.find((p: { name: string }) => p.name === "Clara")).toMatchObject({ attending: true, allergies: "Nüsse" });
  });

  await test.step("after the reply-by date the form only shows the answer", async () => {
    await page.goto(`${guestsUrl(editorUrl)}/einstellungen`);
    const settings = page.getByRole("form", { name: "RSVP-Einstellungen" });
    await settings.getByLabel("Antworten bis").fill(berlinDay(-1));
    await settings.getByRole("button", { name: "Einstellungen speichern" }).click();
    await expect(page.getByText("Gespeichert").first()).toBeVisible();
    await asGuest(browser, baseURL!, weberLink, async (guest) => {
      await expect(guest.getByTestId("closed-note")).toContainText("Die Antwortfrist ist vorbei");
      await expect(person(guest, "Clara").getByLabel("Allergien und Unverträglichkeiten")).toBeDisabled();
      await expect(person(guest, "Clara").getByLabel("Allergien und Unverträglichkeiten")).toHaveValue("Nüsse");
      await expect(guest.getByRole("button", { name: /Antwort (senden|ändern)/ })).toHaveCount(0);
    });
  });
});

test("12 months after the wedding the guest data is deleted, after a warning 30 days before", async ({ page, baseURL }) => {
  test.setTimeout(3 * 60_000);
  const email = uniqueEmail("loeschung");
  await login(page, email, "Ida");
  const editorUrl = await createWebsite(page, `ida-${Date.now()}`, "2027-06-12");
  await page.goto(guestsUrl(editorUrl));
  await addHousehold(page, "Familie Kern", [{ name: "Eva" }]);
  const link = await guestLink(page, "Familie Kern");
  const websiteId = weddingIdOf(editorUrl);
  const end = "2028-06-13T00:00:00Z";

  try {
    await test.step("30 days before, the couple is warned by email and on the Gäste page", async () => {
      await setClockOffset(page.request, baseURL!, daysUntil(end) - 20);
      expect((await runGuestJobs(page.request, baseURL!, websiteId)).warned).toEqual([websiteId]);
      await waitForMail(page.request, email, "Eure Gästeliste wird am 13. Juni 2028 gelöscht");
      await login(page, email); // the session from today has expired by then
      await page.goto(guestsUrl(editorUrl));
      await expect(page.getByTestId("deletion-notice")).toContainText("Am 13. Juni 2028 löschen wir die Gästeliste");
    });

    await test.step("after the end, the link stops and the guest list is gone", async () => {
      await setClockOffset(page.request, baseURL!, daysUntil(end) + 1);
      expect((await runGuestJobs(page.request, baseURL!, websiteId)).deleted).toEqual([websiteId]);
      expect((await page.request.get(link)).status()).toBe(404);
      await page.goto(guestsUrl(editorUrl));
      await expect(page.getByTestId("guests-empty")).toBeVisible();
      await expect(page.getByTestId("household")).toHaveCount(0);
    });
  } finally {
    await setClockOffset(page.request, baseURL!, 0);
  }
});
