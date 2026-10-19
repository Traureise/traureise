import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Clock, GuestLinks, TokenGenerator } from "@/application/ports";

export const systemClock: Clock = { now: () => new Date() };

export const cryptoTokens: TokenGenerator = {
  generate: () => randomBytes(32).toString("base64url"),
  hash: (token) => createHash("sha256").update(token).digest("hex"),
};

/**
 * Personal links: HMAC-SHA256 of the household id with the instance secret, so the couple can copy a link
 * any time while the database holds only its SHA-256 hash.
 */
export function hmacGuestLinks(secret: string): GuestLinks {
  const sign = (purpose: string, householdId: string) => createHmac("sha256", secret).update(`${purpose}:${householdId}`).digest("base64url");
  return {
    tokenFor: (householdId) => sign("household", householdId),
    hash: (token) => createHash("sha256").update(token).digest("hex"),
    // "<household id>.<signature>": verifiable without a stored token, and a different purpose than the personal link.
    unsubscribeTokenFor: (householdId) => `${householdId}.${sign("unsubscribe", householdId)}`,
    verifyUnsubscribe(token) {
      const [householdId, signature] = token.split(".");
      if (!householdId || !signature || !/^[0-9a-f-]{36}$/.test(householdId)) return null;
      const expected = Buffer.from(sign("unsubscribe", householdId));
      const given = Buffer.from(signature);
      return given.length === expected.length && timingSafeEqual(given, expected) ? householdId : null;
    },
  };
}

const CLOCK_OFFSET = Symbol.for("traureise.testClockOffsetMs");
type ClockGlobal = typeof globalThis & { [CLOCK_OFFSET]?: number };

/**
 * Testing only (TEST_HOOKS=true): the system clock plus an offset that /api/test/clock sets. The offset lives
 * on globalThis because route handlers, pages and instrumentation can each load their own copy of this module.
 */
export const adjustableClock = {
  now: () => new Date(Date.now() + ((globalThis as ClockGlobal)[CLOCK_OFFSET] ?? 0)),
  setOffset(ms: number) {
    (globalThis as ClockGlobal)[CLOCK_OFFSET] = ms;
  },
} satisfies Clock & { setOffset(ms: number): void };
