import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { LOCALE_COOKIE, defaultLocale, locales } from "./config";
import { resolveLocale } from "./resolve";

export default getRequestConfig(async () => {
  const locale = resolveLocale((await cookies()).get(LOCALE_COOKIE)?.value, (await headers()).get("accept-language"), locales, defaultLocale);
  return {
    locale,
    timeZone: "Europe/Berlin",
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
