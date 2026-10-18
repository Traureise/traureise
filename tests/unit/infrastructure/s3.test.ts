import { DeleteObjectCommand, GetObjectCommand, NoSuchKey, PutObjectCommand } from "@aws-sdk/client-s3";
import { describe, expect, it } from "vitest";
import { S3FileStorage } from "@/infrastructure/storage/s3";

class FakeS3 {
  objects = new Map<string, { body: Uint8Array; type: string }>();
  async send(command: unknown): Promise<unknown> {
    if (command instanceof PutObjectCommand) {
      const { Key, Body, ContentType, Bucket } = command.input;
      expect(Bucket).toBe("hochzeit");
      this.objects.set(Key!, { body: Body as Uint8Array, type: ContentType! });
      return {};
    }
    if (command instanceof GetObjectCommand) {
      const obj = this.objects.get(command.input.Key!);
      if (!obj) throw new NoSuchKey({ message: "missing", $metadata: {} });
      return { Body: { transformToByteArray: async () => obj.body }, ContentType: obj.type };
    }
    if (command instanceof DeleteObjectCommand) {
      this.objects.delete(command.input.Key!);
      return {};
    }
    throw new Error("unexpected command");
  }
}

describe("S3FileStorage", () => {
  it("puts, gets and deletes objects in the configured bucket", async () => {
    const s3 = new FakeS3();
    const storage = new S3FileStorage(s3, "hochzeit");
    await storage.put("a.webp", new Uint8Array([7]), "image/webp");
    expect(await storage.get("a.webp")).toEqual({ bytes: new Uint8Array([7]), contentType: "image/webp" });
    await storage.delete("a.webp");
    expect(await storage.get("a.webp")).toBeNull();
  });
});
