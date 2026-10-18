import { test as base, expect, type BrowserContext } from "@playwright/test";

/** Hosts the app is allowed to talk to: the instance itself, nothing else. */
export function isAllowedUrl(rawUrl: string, baseURL: string): boolean {
  const url = new URL(rawUrl);
  if (["data:", "blob:", "about:"].includes(url.protocol)) return true;
  return url.host === new URL(baseURL).host;
}

/** Collects every browser request in `context` that goes to a host other than the app. */
export function recordForeignRequests(context: BrowserContext, baseURL: string): string[] {
  const foreign: string[] = [];
  context.on("request", (request) => {
    if (!isAllowedUrl(request.url(), baseURL)) foreign.push(request.url());
  });
  return foreign;
}

type Fixtures = { thirdPartyRequests: string[]; clientAddress: string };

const randomIp = () => `10.${[0, 0, 0].map(() => Math.floor(Math.random() * 250) + 1).join(".")}`;

export const test = base.extend<Fixtures>({
  /**
   * Every test records requests to foreign hosts and fails if there were any.
   * This enforces "no runtime requests to third-party services" across all E2E flows.
   */
  thirdPartyRequests: [
    async ({ context, baseURL }, use) => {
      const foreign = recordForeignRequests(context, baseURL!);
      await use(foreign);
      expect(foreign, "requests to third-party hosts").toEqual([]);
    },
    { auto: true },
  ],
  /** Each test appears to come from its own address, so login rate limits never couple tests. */
  clientAddress: [
    async ({ context }, use) => {
      const ip = randomIp();
      await context.setExtraHTTPHeaders({ "x-forwarded-for": ip });
      await use(ip);
    },
    { auto: true },
  ],
});

export { expect };
