import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { User } from "@/application/ports";
import { container } from "@/composition/container";

export const SESSION_COOKIE = "traureise_session";

export const getCurrentUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return container().getCurrentUser.execute(token);
});

/** For pages and actions that need a logged-in user. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Like requireUser, but also sends first-time users to the name step. */
export async function requireProfile(): Promise<User & { firstName: string }> {
  const user = await requireUser();
  if (!user.firstName) redirect("/willkommen");
  return user as User & { firstName: string };
}

export async function setSessionCookie(token: string, expires: Date) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // Browsers only send Secure cookies over https (localhost excepted), so follow APP_URL.
    secure: container().appUrl.startsWith("https://"),
    path: "/",
    expires,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function sessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}
