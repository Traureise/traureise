import { getTranslations } from "next-intl/server";

export default async function HomePage() {
  const t = await getTranslations("app");
  return <main>{t("name")}</main>;
}
