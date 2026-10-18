import { container } from "@/composition/container";

/**
 * One-click unsubscribe (RFC 8058): mail clients POST here from the List-Unsubscribe header, without login.
 * Only POST unsubscribes; a GET (a link scanner) changes nothing and goes to the confirmation page.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const done = await container().unsubscribe.execute((await params).token);
  return new Response(null, { status: done ? 200 : 404 });
}

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  return Response.redirect(new URL(`/abmelden/${encodeURIComponent((await params).token)}`, container().appUrl), 303);
}
