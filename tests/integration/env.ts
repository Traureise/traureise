import { existsSync } from "node:fs";

/** Connection settings for tests running on the host against the Compose services. */
export function testEnv() {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const user = process.env.POSTGRES_USER ?? "traureise";
  const password = process.env.POSTGRES_PASSWORD ?? "traureise";
  const port = process.env.POSTGRES_PORT ?? "5432";
  const server = `postgres://${user}:${encodeURIComponent(password)}@localhost:${port}`;
  return {
    adminUrl: `${server}/postgres`,
    databaseUrl: process.env.TEST_DATABASE_URL ?? `${server}/traureise_test`,
    smtpPort: Number(process.env.MAILPIT_SMTP_PORT ?? 1025),
    mailpitUrl: `http://localhost:${process.env.MAILPIT_UI_PORT ?? 8025}`,
  };
}
