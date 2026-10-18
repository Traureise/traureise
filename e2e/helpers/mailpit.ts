import { expect, type APIRequestContext } from "@playwright/test";

export const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://localhost:8025";

type Summary = { ID: string };

async function messagesTo(request: APIRequestContext, to: string): Promise<Summary[]> {
  const res = await request.get(`${MAILPIT_URL}/api/v1/search`, { params: { query: `to:"${to}"` } });
  return ((await res.json()) as { messages: Summary[] }).messages;
}

/** Starts watching an inbox; `next()` waits for the next email and returns its magic link. */
export async function watchInbox(request: APIRequestContext, to: string) {
  const before = (await messagesTo(request, to)).length;
  return {
    async nextMagicLink(): Promise<string> {
      let link: string | undefined;
      await expect
        .poll(
          async () => {
            const messages = await messagesTo(request, to);
            if (messages.length <= before) return undefined;
            const msg = await (await request.get(`${MAILPIT_URL}/api/v1/message/${messages[0]!.ID}`)).json();
            link = /https?:\/\/\S+\/auth\/verify\?token=[A-Za-z0-9_%-]+/.exec(msg.Text as string)?.[0];
            return link;
          },
          { timeout: 15_000, message: `magic link email to ${to}` },
        )
        .toBeTruthy();
      return link!;
    },
  };
}
