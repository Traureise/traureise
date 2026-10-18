import { NextResponse, type NextRequest } from "next/server";
import { InvalidTokenError } from "@/application/errors";
import { container } from "@/composition/container";
import { setSessionCookie } from "@/lib/session";

export async function GET(request: NextRequest) {
  const { appUrl, verifyMagicLink } = container();
  const token = request.nextUrl.searchParams.get("token") ?? "";
  try {
    const result = await verifyMagicLink.execute({ token });
    await setSessionCookie(result.sessionToken, result.expiresAt);
    return NextResponse.redirect(new URL(result.needsProfile ? "/willkommen" : "/dashboard", appUrl));
  } catch (error) {
    if (error instanceof InvalidTokenError) return NextResponse.redirect(new URL("/login?error=link", appUrl));
    throw error;
  }
}
