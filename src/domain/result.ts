export type FieldErrors = Record<string, string>;

export type Parsed<T> = { ok: true; value: T } | { ok: false; fieldErrors: FieldErrors };

import type { z } from "zod";

/** Runs a zod schema and flattens issues into `{ field: code }` (first issue per field). */
export function parseWith<S extends z.ZodType>(schema: S, input: unknown): Parsed<z.infer<S>> {
  const result = schema.safeParse(input);
  if (result.success) return { ok: true, value: result.data };
  const fieldErrors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "_";
    fieldErrors[key] ??= issue.message;
  }
  return { ok: false, fieldErrors };
}
