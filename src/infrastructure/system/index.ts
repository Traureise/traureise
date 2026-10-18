import { createHash, randomBytes } from "node:crypto";
import type { Clock, TokenGenerator } from "@/application/ports";

export const systemClock: Clock = { now: () => new Date() };

export const cryptoTokens: TokenGenerator = {
  generate: () => randomBytes(32).toString("base64url"),
  hash: (token) => createHash("sha256").update(token).digest("hex"),
};
