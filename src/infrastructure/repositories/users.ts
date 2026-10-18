import { eq } from "drizzle-orm";
import type { User, UserRepository } from "@/application/ports";
import type { Database } from "../db/client";
import { users } from "../db/schema";

export class DrizzleUserRepository implements UserRepository {
  constructor(private db: Database) {}

  async findById(id: string): Promise<User | null> {
    return (await this.db.query.users.findFirst({ where: eq(users.id, id) })) ?? null;
  }

  async findByEmail(email: string): Promise<User | null> {
    return (await this.db.query.users.findFirst({ where: eq(users.email, email) })) ?? null;
  }

  async create(email: string): Promise<User> {
    // ON CONFLICT keeps two simultaneous first logins from failing.
    const [created] = await this.db.insert(users).values({ email }).onConflictDoNothing().returning();
    return created ?? (await this.findByEmail(email))!;
  }

  async updateFirstName(id: string, firstName: string): Promise<void> {
    await this.db.update(users).set({ firstName }).where(eq(users.id, id));
  }
}
