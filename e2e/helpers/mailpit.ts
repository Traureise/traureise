import { expect, type APIRequestContext } from "@playwright/test";

export const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://localhost:8025";

type MailpitMessage = { ID: string; To: { Address: string }[]; Created: string };

/** Waits for the newest email to `to` sent after `since` and returns the first link to /auth/verify in it. */
export async function fetchMagicLink(request: APIRequestContext, to: string, since: Date): Promise<string> {
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const res = await request.get(`${MAILPIT_URL}/api/v1/search`, { params: { query: `to:"${to}"` } });
        const { messages } = (await res.json()) as { messages: MailpitMessage[] };
        const fresh = messages.filter((m) => new Date(m.Created) >= new Date(since.getTime() - 1000));
        if (fresh.length === 0) return undefined;
        const msg = await (await request.get(`${MAILPIT_URL}/api/v1/message/${fresh[0]!.ID}`)).json();
        link = /https?:\/\/[^\s"<>]+\/auth\/verify\?token=[A-Za-z0-9_-]+/.exec(msg.Text as string)?.[0];
        return link;
      },
      { timeout: 15_000, message: `magic link email to ${to}` },
    )
    .toBeTruthy();
  return link!;
}
