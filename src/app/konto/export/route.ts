import { container } from "@/composition/container";
import { getCurrentUser } from "@/lib/session";

/** Downloads everything stored about the logged-in user (DSGVO Art. 15 and 20). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  const { filename, bytes } = await container().exportAccount.execute(user.id);
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
