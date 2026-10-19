import { redirect } from "next/navigation";
import { container } from "@/composition/container";
import { requireProfile } from "@/lib/session";

export const dynamic = "force-dynamic";

/** The most recently used wedding's home; without a wedding, the Hochzeit form. */
export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ kauf?: string }> }) {
  const user = await requireProfile();
  const wedding = await container().getRecentWedding.execute(user.id);
  const { kauf } = await searchParams;
  redirect(wedding ? `/hochzeiten/${wedding.id}${kauf ? `?kauf=${encodeURIComponent(kauf)}` : ""}` : "/hochzeiten/neu");
}
