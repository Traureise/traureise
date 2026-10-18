import postgres from "postgres";
import { runMigrations } from "../../src/infrastructure/db/migrate";
import { testEnv } from "./env";

/** Recreates the test database and applies the real migrations once per run. */
export default async function setup() {
  const { adminUrl, databaseUrl } = testEnv();
  const name = new URL(databaseUrl).pathname.slice(1);
  const admin = postgres(adminUrl, { max: 1, onnotice: () => {} });
  try {
    await admin.unsafe(`drop database if exists "${name}" with (force)`);
    await admin.unsafe(`create database "${name}"`);
  } finally {
    await admin.end();
  }
  await runMigrations(databaseUrl);
}
