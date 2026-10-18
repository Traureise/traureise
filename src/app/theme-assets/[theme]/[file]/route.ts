import { readFile } from "node:fs/promises";
import { container } from "@/composition/container";

const TYPES: Record<string, string> = { svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", webp: "image/webp" };

export async function GET(_request: Request, { params }: { params: Promise<{ theme: string; file: string }> }) {
  const { theme, file } = await params;
  const filePath = container().themes.assetPath(theme, file);
  if (!filePath) return new Response(null, { status: 404 });
  return new Response(await readFile(filePath), {
    headers: {
      "Content-Type": TYPES[file.split(".").pop()!] ?? "application/octet-stream",
      "Cache-Control": "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
    },
  });
}
