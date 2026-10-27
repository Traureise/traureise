/** What a member of a wedding may do: admins also manage members, buy packages and delete the wedding. */
export type Role = "admin" | "editor";

const ROLES: readonly Role[] = ["editor", "admin"];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

/** Whether `role` grants at least what `min` grants. */
export function atLeast(role: Role, min: Role): boolean {
  return ROLES.indexOf(role) >= ROLES.indexOf(min);
}
