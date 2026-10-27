import { describe, expect, it } from "vitest";
import { atLeast } from "@/domain/members";

describe("atLeast", () => {
  it("ranks admin above editor", () => {
    expect(atLeast("admin", "editor")).toBe(true);
    expect(atLeast("editor", "admin")).toBe(false);
    expect(atLeast("editor", "editor")).toBe(true);
  });
});
