import { zip, type Zippable } from "fflate";
import type { ArchiveEntry, ArchiveWriter } from "@/application/ports";

/** ZIP via fflate. Images are already compressed, so they are stored as they are. */
export class FflateArchiveWriter implements ArchiveWriter {
  zip(entries: ArchiveEntry[]): Promise<Uint8Array> {
    const files: Zippable = Object.fromEntries(entries.map((e) => [e.path, [e.bytes, { level: e.path.endsWith(".json") ? 6 : 0 }]]));
    return new Promise((resolve, reject) => zip(files, (error, data) => (error ? reject(error) : resolve(data))));
  }
}
