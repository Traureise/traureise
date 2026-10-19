import { checkUpload } from "@/domain/images";
import type { Deps } from "./deps";
import { ValidationError } from "./errors";
import { loadOwnedWedding } from "./owned";
import type { StoredFile } from "./ports";

export { ACCEPTED_IMAGE_TYPES, MAX_UPLOAD_BYTES } from "@/domain/images";
const KEY_PATTERN = /^[A-Za-z0-9_-]+\.(webp|jpg|png)$/;

export class UploadImage {
  constructor(private deps: Deps) {}

  /** Validates, re-encodes (stripping EXIF) and stores an image for the wedding; returns its storage key. */
  async execute(userId: string, weddingId: string, file: { bytes: Uint8Array; size: number; contentType: string }): Promise<string> {
    await loadOwnedWedding(this.deps, userId, weddingId);
    const problem = checkUpload(file);
    if (problem) throw new ValidationError({ file: problem });

    let processed;
    try {
      processed = await this.deps.images.process(file.bytes);
    } catch {
      throw new ValidationError({ file: "unreadable" });
    }
    const key = `${this.deps.tokens.generate()}.${processed.extension}`;
    await this.deps.storage.put(key, processed.bytes, processed.contentType);
    await this.deps.uploads.create({ key, ownerId: userId, weddingId, contentType: processed.contentType, size: processed.bytes.length });
    return key;
  }
}

export class GetUpload {
  constructor(private deps: Deps) {}

  async execute(key: string): Promise<StoredFile | null> {
    if (!KEY_PATTERN.test(key)) return null;
    return this.deps.storage.get(key);
  }
}
