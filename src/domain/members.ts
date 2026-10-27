/** What a member of a wedding may do: admins also manage members, buy packages and delete the wedding. */
export type Role = "admin" | "editor";

const ROLES: readonly Role[] = ["editor", "admin"];

/** Whether `role` grants at least what `min` grants. */
export function atLeast(role: Role, min: Role): boolean {
  return ROLES.indexOf(role) >= ROLES.indexOf(min);
}
