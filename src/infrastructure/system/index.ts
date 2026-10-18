import { createHash, createHmac, randomBytes } from "node:crypto";
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
  return {
    tokenFor: (householdId) => createHmac("sha256", secret).update(`household:${householdId}`).digest("base64url"),
    hash: (token) => createHash("sha256").update(token).digest("hex"),
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
