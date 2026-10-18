import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FileStorage, StoredFile } from "@/application/ports";

const SAFE_KEY = /^[A-Za-z0-9_-]+\.[a-z0-9]+$/;
const TYPES: Record<string, string> = { webp: "image/webp", jpg: "image/jpeg", png: "image/png" };

/** Stores files in a directory (a Docker volume in production). Keys are flat, validated file names. */
export class LocalFileStorage implements FileStorage {
  constructor(private dir: string) {}

  private pathFor(key: string): string {
    if (!SAFE_KEY.test(key)) throw new Error(`invalid storage key: ${key}`);
    return path.join(this.dir, key);
  }

  async put(key: string, bytes: Uint8Array, _contentType: string): Promise<void> {
    void _contentType; // derived from the key extension on read
    await mkdir(this.dir, { recursive: true });
    await writeFile(this.pathFor(key), bytes);
  }

  async get(key: string): Promise<StoredFile | null> {
    try {
      const bytes = await readFile(this.pathFor(key));
      return { bytes: new Uint8Array(bytes), contentType: TYPES[key.split(".").pop()!] ?? "application/octet-stream" };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }
}
