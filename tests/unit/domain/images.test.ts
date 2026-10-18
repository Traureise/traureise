import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_BYTES, checkUpload } from "@/domain/images";

describe("checkUpload", () => {
  it("accepts common image types up to 10 MB", () => {
    expect(checkUpload({ size: MAX_UPLOAD_BYTES, contentType: "image/jpeg" })).toBeNull();
    expect(checkUpload({ size: 1, contentType: "image/avif" })).toBeNull();
  });

  it("names the problem otherwise", () => {
    expect(checkUpload({ size: 1, contentType: "application/pdf" })).toBe("invalid_type");
    expect(checkUpload({ size: 0, contentType: "image/png" })).toBe("empty");
    expect(checkUpload({ size: MAX_UPLOAD_BYTES + 1, contentType: "image/png" })).toBe("too_large");
  });
});
