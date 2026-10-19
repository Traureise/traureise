import { beforeEach, describe, expect, it } from "vitest";
import { NotFoundError, ValidationError } from "@/application/errors";
import { GetUpload, MAX_UPLOAD_BYTES, UploadImage } from "@/application/uploads";
import { JPEG, createFakes } from "../../fakes";
import { newWedding } from "../../fakes/wedding";

let f: ReturnType<typeof createFakes>;
let anna: string;
let weddingId: string;

beforeEach(async () => {
  f = createFakes();
  anna = (await f.users.create("anna@example.org")).id;
  ({ weddingId } = await newWedding(f.deps, anna));
});

describe("UploadImage", () => {
  it("stores the processed image under a random webp key", async () => {
    const key = await new UploadImage(f.deps).execute(anna, weddingId, { bytes: JPEG, size: JPEG.length, contentType: "image/jpeg" });
    expect(key).toMatch(/^[A-Za-z0-9_-]+\.webp$/);
    expect(f.storage.files.get(key)).toEqual({ bytes: new Uint8Array([1, 2, 3]), contentType: "image/webp" });
    expect(await f.uploads.belongsToWedding(key, weddingId)).toBe(true);
  });

  it("rejects wrong types, oversized and unreadable files", async () => {
    const upload = (input: { bytes: Uint8Array; size: number; contentType: string }) =>
      new UploadImage(f.deps).execute(anna, weddingId, input);
    await expect(upload({ bytes: JPEG, size: 4, contentType: "application/pdf" })).rejects.toMatchObject({ fieldErrors: { file: "invalid_type" } });
    await expect(upload({ bytes: JPEG, size: MAX_UPLOAD_BYTES + 1, contentType: "image/jpeg" })).rejects.toMatchObject({ fieldErrors: { file: "too_large" } });
    await expect(upload({ bytes: new Uint8Array([0, 0]), size: 2, contentType: "image/png" })).rejects.toMatchObject({ fieldErrors: { file: "unreadable" } });
    await expect(upload({ bytes: JPEG, size: 0, contentType: "image/jpeg" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("only lets owners upload", async () => {
    const ben = (await f.users.create("ben@example.org")).id;
    await expect(new UploadImage(f.deps).execute(ben, weddingId, { bytes: JPEG, size: 4, contentType: "image/jpeg" })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("GetUpload", () => {
  it("serves stored files and returns null for unknown or malformed keys", async () => {
    const key = await new UploadImage(f.deps).execute(anna, weddingId, { bytes: JPEG, size: 4, contentType: "image/jpeg" });
    expect((await new GetUpload(f.deps).execute(key))?.contentType).toBe("image/webp");
    expect(await new GetUpload(f.deps).execute("missing.webp")).toBeNull();
    expect(await new GetUpload(f.deps).execute("../secret")).toBeNull();
  });
});
