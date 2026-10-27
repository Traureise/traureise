import { isValidEmail, normalizeEmail } from "@/domain/email";
import { requiredText } from "@/domain/fields";
import { parseWith } from "@/domain/result";
import { z } from "zod";
import type { Deps } from "./deps";
import { InvalidTokenError, RateLimitedError, ValidationError } from "./errors";
import type { User } from "./ports";

export const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_EMAIL = 5;
const MAX_PER_IP = 20;

export class RequestMagicLink {
  constructor(private deps: Deps) {}

  async execute(input: { email: string; ip: string }): Promise<void> {
    const { rateLimiter, clock, tokens, magicLinks, mailer, mailTemplate, appUrl } = this.deps;
    const email = normalizeEmail(input.email);
    if (!isValidEmail(email)) throw new ValidationError({ email: "invalid_email" });

    const now = clock.now();
    const ipAllowed = await rateLimiter.hit(`magic-link:ip:${input.ip}`, MAX_PER_IP, RATE_WINDOW_MS, now);
    const emailAllowed = await rateLimiter.hit(`magic-link:email:${email}`, MAX_PER_EMAIL, RATE_WINDOW_MS, now);
    if (!ipAllowed || !emailAllowed) throw new RateLimitedError();

    const token = tokens.generate();
    await magicLinks.create({ email, tokenHash: tokens.hash(token), expiresAt: new Date(now.getTime() + MAGIC_LINK_TTL_MS) });
    const link = `${appUrl}/auth/verify?token=${encodeURIComponent(token)}`;
    await mailer.send({ to: email, ...mailTemplate.render(link, MAGIC_LINK_TTL_MS / 60_000) });
  }
}

export type LoginResult = { user: User; sessionToken: string; expiresAt: Date; needsProfile: boolean };

/** Logs `user` in: stores a new session (only its hash) and returns its token. */
export async function startSession(deps: Deps, user: User, now: Date): Promise<LoginResult> {
  const sessionToken = deps.tokens.generate();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await deps.sessions.create({ userId: user.id, tokenHash: deps.tokens.hash(sessionToken), expiresAt });
  return { user, sessionToken, expiresAt, needsProfile: !user.firstName };
}

export class VerifyMagicLink {
  constructor(private deps: Deps) {}

  async execute(input: { token: string }): Promise<LoginResult> {
    const { magicLinks, users, tokens, clock } = this.deps;
    const now = clock.now();
    const link = await magicLinks.findByHash(tokens.hash(input.token));
    if (!link || link.usedAt || link.expiresAt <= now) throw new InvalidTokenError();
    if (!(await magicLinks.markUsed(link.id, now))) throw new InvalidTokenError();

    const user = (await users.findByEmail(link.email)) ?? (await users.create(link.email));
    return startSession(this.deps, user, now);
  }
}

export class GetCurrentUser {
  constructor(private deps: Deps) {}

  async execute(sessionToken: string | undefined): Promise<User | null> {
    if (!sessionToken) return null;
    const session = await this.deps.sessions.findByHash(this.deps.tokens.hash(sessionToken));
    if (!session || session.expiresAt <= this.deps.clock.now()) return null;
    return this.deps.users.findById(session.userId);
  }
}

export class Logout {
  constructor(private deps: Deps) {}

  async execute(sessionToken: string | undefined): Promise<void> {
    if (sessionToken) await this.deps.sessions.deleteByHash(this.deps.tokens.hash(sessionToken));
  }
}

const profileSchema = z.object({ firstName: requiredText(60) });

export class UpdateProfile {
  constructor(private deps: Deps) {}

  async execute(userId: string, input: { firstName: string }): Promise<void> {
    const parsed = parseWith(profileSchema, input);
    if (!parsed.ok) throw new ValidationError(parsed.fieldErrors);
    await this.deps.users.updateFirstName(userId, parsed.value.firstName);
  }
}
