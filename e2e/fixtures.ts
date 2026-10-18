import { test as base, expect } from "@playwright/test";

/** Hosts the app is allowed to talk to: the instance itself, nothing else. */
export function isAllowedUrl(rawUrl: string, baseURL: string): boolean {
  const url = new URL(rawUrl);
  if (["data:", "blob:", "about:"].includes(url.protocol)) return true;
  return url.host === new URL(baseURL).host;
}

type Fixtures = { thirdPartyRequests: string[] };

/**
 * Every test records requests to foreign hosts and fails if there were any.
 * This enforces "no runtime dependency on third-party services" across all E2E flows.
 */
export const test = base.extend<Fixtures>({
  thirdPartyRequests: [
    async ({ context, baseURL }, use) => {
      const foreign: string[] = [];
      context.on("request", (request) => {
        if (!isAllowedUrl(request.url(), baseURL!)) foreign.push(request.url());
      });
      await use(foreign);
      expect(foreign, "requests to third-party hosts").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
