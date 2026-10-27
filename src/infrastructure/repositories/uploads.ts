import { and, eq } from "drizzle-orm";
import type { UploadRepository } from "@/application/ports";
import type { Database } from "../db/client";
import { uploads } from "../db/schema";

export class DrizzleUploadRepository implements UploadRepository {
  constructor(private db: Database) {}

  async create(input: { key: string; uploadedBy: string; weddingId: string; contentType: string; size: number }): Promise<void> {
    await this.db.insert(uploads).values(input);
  }

  async belongsToWedding(key: string, weddingId: string): Promise<boolean> {
    const rows = await this.db
      .select({ key: uploads.key })
      .from(uploads)
      .where(and(eq(uploads.key, key), eq(uploads.weddingId, weddingId)));
    return rows.length > 0;
  }

  async listKeysByWedding(weddingId: string): Promise<string[]> {
    const rows = await this.db.select({ key: uploads.key }).from(uploads).where(eq(uploads.weddingId, weddingId));
    return rows.map((r) => r.key);
  }

  async delete(key: string): Promise<void> {
    await this.db.delete(uploads).where(eq(uploads.key, key));
  }
}
