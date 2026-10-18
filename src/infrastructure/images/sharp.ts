import sharp from "sharp";
import type { ImageProcessor, ProcessedImage } from "@/application/ports";

const MAX_EDGE = 2400;

/** Re-encodes uploads as WebP. sharp drops EXIF/XMP/ICC metadata unless asked to keep it. */
export class SharpImageProcessor implements ImageProcessor {
  async process(bytes: Uint8Array): Promise<ProcessedImage> {
    const output = await sharp(bytes, { failOn: "error", limitInputPixels: 50_000_000 })
      .rotate() // apply EXIF orientation before the metadata is dropped
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
    return { bytes: new Uint8Array(output), contentType: "image/webp", extension: "webp" };
  }
}
