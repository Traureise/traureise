import { runMigrations } from "./migrate";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
await runMigrations(url, process.env.MIGRATIONS_DIR ?? "./drizzle");
console.log("Database migrations applied");
