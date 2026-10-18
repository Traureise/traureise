import { NextResponse, type NextRequest } from "next/server";

// Cheap first gate: no session cookie, no private pages. Pages still verify the session itself.
export function proxy(request: NextRequest) {
  if (!request.cookies.has("traureise_session")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/dashboard/:path*", "/websites/:path*", "/willkommen"] };
