import { describe, expect, it } from "vitest";
import { moveItem } from "@/domain/ordering";

describe("moveItem", () => {
  const ids = ["a", "b", "c"];

  it("moves an item up or down by one", () => {
    expect(moveItem(ids, "b", "up")).toEqual(["b", "a", "c"]);
    expect(moveItem(ids, "b", "down")).toEqual(["a", "c", "b"]);
  });

  it("leaves the order unchanged at the edges", () => {
    expect(moveItem(ids, "a", "up")).toEqual(ids);
    expect(moveItem(ids, "c", "down")).toEqual(ids);
  });

  it("does not mutate its input and ignores unknown ids", () => {
    const copy = [...ids];
    moveItem(ids, "b", "up");
    expect(ids).toEqual(copy);
    expect(moveItem(ids, "zzz", "up")).toEqual(ids);
  });
});
