import { container } from "@/composition/container";

export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const file = await container().getUpload.execute(key);
  if (!file) return new Response(null, { status: 404 });
  return new Response(Buffer.from(file.bytes), {
    headers: {
      "Content-Type": file.contentType,
      // Keys are random and never reused, so files can be cached forever.
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
