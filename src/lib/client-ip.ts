import "server-only";
import { headers } from "next/headers";

/** The address the nearest reverse proxy saw (it appends the last X-Forwarded-For entry). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",").at(-1)?.trim() || h.get("x-real-ip") || "unknown";
}
