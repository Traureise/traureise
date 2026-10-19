import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { addItem, openSection } from "./editor";
import { weddingIdOf } from "./weddings";

/** Adds a schedule item (an event guests can answer for). */
export async function addEvent(page: Page, editorUrl: string, name: string, date: string, time: string) {
  await openSection(page, editorUrl, "Tagesablauf");
  await addItem(page, { Art: { select: "Feier" }, Name: name, "Beginn (Datum)": date, "Beginn (Uhrzeit)": time });
}

/** The guest list of the wedding a website editor URL belongs to. */
export const guestsUrl = (editorUrl: string) => `/hochzeiten/${weddingIdOf(editorUrl)}/gaeste`;
export { weddingIdOf };

export const household = (page: Page, name: string) => page.getByTestId("household").filter({ has: page.getByRole("heading", { name, exact: true }) });

/** Adds a household from the Gäste page; `events` limits the invitation to those events. */
export async function addHousehold(
  page: Page,
  name: string,
  people: { name: string; child?: boolean }[],
  events?: { uninvite: string[] },
  extra: { email?: string; personalLine?: string } = {},
) {
  await page.getByRole("button", { name: "Haushalt hinzufügen" }).click();
  const form = page.getByRole("form", { name: "Neuer Haushalt" });
  await form.getByLabel("Name des Haushalts").fill(name);
  for (const [i, person] of people.entries()) {
    if (i > 0) await form.getByRole("button", { name: "Person hinzufügen" }).click();
    await form.getByLabel(`Person ${i + 1}`, { exact: true }).fill(person.name);
    if (person.child) await form.getByTestId("household-person").nth(i).getByLabel("Kind").check();
  }
  for (const event of events?.uninvite ?? []) await form.getByLabel(event, { exact: true }).uncheck();
  if (extra.email) await form.getByLabel("E-Mail-Adresse (optional)").fill(extra.email);
  if (extra.personalLine) await form.getByLabel("Persönliche Zeile für die Dankeskarte (optional)").fill(extra.personalLine);
  await form.getByRole("button", { name: "Speichern" }).click();
  await expect(form).toBeHidden();
  await expect(household(page, name)).toBeVisible();
}

/** The personal link behind "Link kopieren" (read from the button, so no clipboard is needed). */
export async function guestLink(page: Page, name: string): Promise<string> {
  const link = await household(page, name).getByRole("button", { name: "Link kopieren" }).getAttribute("data-link");
  expect(link).toMatch(/\/antwort\/[A-Za-z0-9_-]{43}$/);
  return link!;
}

/** Test hooks of the E2E stack (TEST_HOOKS=true). */
export async function setClockOffset(request: APIRequestContext, baseURL: string, offsetDays: number) {
  const res = await request.post(`${baseURL}/api/test/clock`, { data: { offsetDays } });
  expect(res.ok()).toBe(true);
}

export async function runGuestJobs(request: APIRequestContext, baseURL: string, weddingId: string) {
  const res = await request.post(`${baseURL}/api/test/jobs`, { data: { weddingId } });
  expect(res.ok()).toBe(true);
  return (await res.json()) as { deleted: string[]; warned: string[]; summaries: string[] };
}

/** Whole days from now until the given instant, rounded up. */
export const daysUntil = (iso: string) => Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
