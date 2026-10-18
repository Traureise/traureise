import "server-only";
import { sql } from "drizzle-orm";
import { createDatabase } from "@/infrastructure/db/client";
import { loadConfig } from "./config";

function build() {
  const config = loadConfig();
  const { db } = createDatabase(config.DATABASE_URL);
  return {
    config,
    async healthCheck(): Promise<boolean> {
      try {
        await db.execute(sql`select 1`);
        return true;
      } catch {
        return false;
      }
    },
  };
}

let instance: ReturnType<typeof build> | undefined;

export function container() {
  instance ??= build();
  return instance;
}
