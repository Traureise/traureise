import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;

export function createDatabase(url: string, max = 10): { db: Database; close: () => Promise<void> } {
  const client = postgres(url, { max, onnotice: () => {} });
  return { db: drizzle(client, { schema }), close: () => client.end() };
}
