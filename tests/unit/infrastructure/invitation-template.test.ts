import { describe, expect, it } from "vitest";
import { createInvitationTemplate } from "@/infrastructure/mail/invitation-template";

describe("invitation mail", () => {
  const mail = createInvitationTemplate().render({
    link: "https://app.example/einladung?token=abc",
    inviter: "Anna <3",
    weddingTitle: "Anna & Ben",
    role: "admin",
    expiresOn: new Date("2026-11-10T09:00:00Z"),
  });

  it("names the inviter and the wedding and carries the link", () => {
    expect(mail.subject).toContain("Anna & Ben");
    expect(mail.text).toContain("Anna <3");
    expect(mail.text).toContain("https://app.example/einladung?token=abc");
    expect(mail.text).toContain("10. November 2026");
    expect(mail.html).toContain('href="https://app.example/einladung?token=abc"');
  });

  it("escapes names in the HTML", () => {
    expect(mail.html).toContain("Anna &lt;3");
    expect(mail.html).toContain("Anna &amp; Ben");
    expect(mail.html).not.toContain("Anna <3");
  });
});
