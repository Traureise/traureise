import { beforeEach, describe, expect, it } from "vitest";
import {
  GetCurrentUser,
  Logout,
  MAGIC_LINK_TTL_MS,
  RequestMagicLink,
  UpdateProfile,
  VerifyMagicLink,
} from "@/application/auth";
import { InvalidTokenError, RateLimitedError, ValidationError } from "@/application/errors";
import { createFakes } from "../../fakes";

let f: ReturnType<typeof createFakes>;
beforeEach(() => {
  f = createFakes();
});

const tokenFromMail = () => /token=([^\s"&]+)/.exec(f.mailer.sent.at(-1)!.text)![1]!;

describe("RequestMagicLink", () => {
  it("emails a single-use link and stores only the token hash", async () => {
    await new RequestMagicLink(f.deps).execute({ email: " Anna@Example.org ", ip: "1.2.3.4" });
    expect(f.mailer.sent).toHaveLength(1);
    expect(f.mailer.sent[0]!.to).toBe("anna@example.org");
    expect(f.mailer.sent[0]!.text).toContain("http://localhost:3000/auth/verify?token=token-1");
    expect(f.magicLinks.links[0]!.tokenHash).toBe(f.tokens.hash("token-1"));
    expect(JSON.stringify(f.magicLinks.links)).not.toContain('"token-1"');
    expect(f.magicLinks.links[0]!.expiresAt.getTime() - f.clock.now().getTime()).toBe(MAGIC_LINK_TTL_MS);
  });

  it("rejects invalid email addresses", async () => {
    await expect(new RequestMagicLink(f.deps).execute({ email: "nope", ip: "1.2.3.4" })).rejects.toBeInstanceOf(ValidationError);
    expect(f.mailer.sent).toHaveLength(0);
  });

  it("rate-limits per email address", async () => {
    const request = new RequestMagicLink(f.deps);
    for (let i = 0; i < 5; i++) await request.execute({ email: "anna@example.org", ip: `10.0.0.${i}` });
    await expect(request.execute({ email: "anna@example.org", ip: "10.0.0.99" })).rejects.toBeInstanceOf(RateLimitedError);
    f.clock.advance(15 * 60 * 1000);
    await expect(request.execute({ email: "anna@example.org", ip: "10.0.0.99" })).resolves.toBeUndefined();
  });

  it("rate-limits per IP address", async () => {
    const request = new RequestMagicLink(f.deps);
    for (let i = 0; i < 20; i++) await request.execute({ email: `u${i}@example.org`, ip: "1.1.1.1" });
    await expect(request.execute({ email: "x@example.org", ip: "1.1.1.1" })).rejects.toBeInstanceOf(RateLimitedError);
  });
});

describe("VerifyMagicLink", () => {
  beforeEach(async () => {
    await new RequestMagicLink(f.deps).execute({ email: "anna@example.org", ip: "1.2.3.4" });
  });

  it("creates the account on first login and opens a session", async () => {
    const result = await new VerifyMagicLink(f.deps).execute({ token: tokenFromMail() });
    expect(result.user.email).toBe("anna@example.org");
    expect(result.needsProfile).toBe(true);
    expect(f.users.users).toHaveLength(1);
    expect(f.sessions.sessions[0]!.tokenHash).toBe(f.tokens.hash(result.sessionToken));
  });

  it("logs an existing user in without creating a second account", async () => {
    const existing = await f.users.create("anna@example.org");
    await f.users.updateFirstName(existing.id, "Anna");
    const result = await new VerifyMagicLink(f.deps).execute({ token: tokenFromMail() });
    expect(result.user.id).toBe(existing.id);
    expect(result.needsProfile).toBe(false);
    expect(f.users.users).toHaveLength(1);
  });

  it("accepts each link only once", async () => {
    const token = tokenFromMail();
    await new VerifyMagicLink(f.deps).execute({ token });
    await expect(new VerifyMagicLink(f.deps).execute({ token })).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it("rejects expired and unknown links", async () => {
    const token = tokenFromMail();
    f.clock.advance(MAGIC_LINK_TTL_MS + 1);
    await expect(new VerifyMagicLink(f.deps).execute({ token })).rejects.toBeInstanceOf(InvalidTokenError);
    await expect(new VerifyMagicLink(f.deps).execute({ token: "made-up" })).rejects.toBeInstanceOf(InvalidTokenError);
  });
});

describe("sessions", () => {
  it("resolves the current user until logout or expiry", async () => {
    await new RequestMagicLink(f.deps).execute({ email: "anna@example.org", ip: "1.2.3.4" });
    const { sessionToken } = await new VerifyMagicLink(f.deps).execute({ token: tokenFromMail() });
    const current = new GetCurrentUser(f.deps);
    expect((await current.execute(sessionToken))?.email).toBe("anna@example.org");
    expect(await current.execute("forged")).toBeNull();
    expect(await current.execute(undefined)).toBeNull();

    await new Logout(f.deps).execute(sessionToken);
    expect(await current.execute(sessionToken)).toBeNull();
  });

  it("expires sessions after 30 days", async () => {
    await new RequestMagicLink(f.deps).execute({ email: "anna@example.org", ip: "1.2.3.4" });
    const { sessionToken } = await new VerifyMagicLink(f.deps).execute({ token: tokenFromMail() });
    f.clock.advance(30 * 24 * 60 * 60 * 1000 + 1);
    expect(await new GetCurrentUser(f.deps).execute(sessionToken)).toBeNull();
  });
});

describe("UpdateProfile", () => {
  it("stores a trimmed first name and rejects empty names", async () => {
    const user = await f.users.create("anna@example.org");
    await new UpdateProfile(f.deps).execute(user.id, { firstName: "  Anna " });
    expect(f.users.users[0]!.firstName).toBe("Anna");
    await expect(new UpdateProfile(f.deps).execute(user.id, { firstName: " " })).rejects.toBeInstanceOf(ValidationError);
  });
});
