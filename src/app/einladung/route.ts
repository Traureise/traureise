import { NextResponse, type NextRequest } from "next/server";
import { InvalidTokenError, ValidationError } from "@/application/errors";
import { container } from "@/composition/container";
import { getCurrentUser, setSessionCookie } from "@/lib/session";

/** The link in an invitation mail: makes the invited address a member and logs it in. */
export async function GET(request: NextRequest) {
  const { appUrl, acceptInvitation } = container();
  const token = request.nextUrl.searchParams.get("token") ?? "";
  try {
    const result = await acceptInvitation.execute({ token, currentUserId: (await getCurrentUser())?.id ?? null });
    await setSessionCookie(result.sessionToken, result.expiresAt);
    return NextResponse.redirect(new URL(result.needsProfile ? "/willkommen" : `/hochzeiten/${result.weddingId}/hochzeit`, appUrl));
  } catch (error) {
    if (error instanceof InvalidTokenError) return NextResponse.redirect(new URL("/login?error=einladung", appUrl));
    if (error instanceof ValidationError && error.fieldErrors._ === "other_account") {
      return NextResponse.redirect(new URL("/login?error=einladung-konto", appUrl));
    }
    throw error;
  }
}
