import { describe, expect, it } from "vitest";
import { createGuestMailTemplates } from "@/infrastructure/mail/guest-templates";
import { hmacGuestLinks } from "@/infrastructure/system";

describe("hmacGuestLinks", () => {
  const links = hmacGuestLinks("a".repeat(40));

  it("derives a stable, unguessable token per household and secret", () => {
    const token = links.tokenFor("0b5c2f8e-1111-4c4c-8888-000000000001");
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(links.tokenFor("0b5c2f8e-1111-4c4c-8888-000000000001")).toBe(token);
    expect(links.tokenFor("0b5c2f8e-1111-4c4c-8888-000000000002")).not.toBe(token);
    expect(hmacGuestLinks("b".repeat(40)).tokenFor("0b5c2f8e-1111-4c4c-8888-000000000001")).not.toBe(token);
  });

  it("stores only a one-way hash", () => {
    const token = links.tokenFor("x");
    expect(links.hash(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(links.hash(token)).not.toContain(token);
  });
});

describe("guest mail templates", () => {
  const mail = createGuestMailTemplates();

  it("tells the couple who answered, escaping what guests wrote", () => {
    const m = mail.answer({ websiteTitle: "Anna & Ben", household: "Familie Weber", coming: ["Clara", "Max"], notComing: ["Ida"], message: "<b>Juhu</b>", requests: ["Lena"], guestsUrl: "http://localhost:3000/websites/1/gaeste" });
    expect(m.subject).toBe("Familie Weber hat geantwortet");
    expect(m.text).toContain("Kommen: Clara und Max");
    expect(m.text).toContain("Kommen nicht: Ida");
    expect(m.text).toContain("Möchten gern mitbringen: Lena");
    expect(m.text).toContain("Nachricht: <b>Juhu</b>");
    expect(m.html).toContain("&lt;b&gt;Juhu&lt;/b&gt;");
    expect(m.html).not.toContain("<b>Juhu");
  });

  it("summarises the day and warns before the deletion", () => {
    const summary = mail.dailySummary({ websiteTitle: "Anna & Ben", households: [{ name: "Weber", coming: 2, notComing: 0 }], totals: { coming: 2, notComing: 0, open: 3 }, guestsUrl: "u" });
    expect(summary.text).toContain("hat 1 Haushalt geantwortet");
    expect(summary.text).toContain("Insgesamt: 2 kommen, 0 kommen nicht, 3 offen.");
    const warning = mail.retentionWarning({ websiteTitle: "Anna & Ben", deleteOn: new Date("2028-06-13T00:00:00Z"), guestsUrl: "u" });
    expect(warning.subject).toBe("Eure Gästeliste wird am 13. Juni 2028 gelöscht");
  });
});
