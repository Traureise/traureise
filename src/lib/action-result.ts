import "server-only";
import { unstable_rethrow } from "next/navigation";
import { NotFoundError, RateLimitedError, ValidationError } from "@/application/errors";
import type { FieldErrors } from "@/domain/result";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; fieldErrors?: FieldErrors; error?: "not_found" | "rate_limited" | "unknown" };

/** Runs a use case and turns domain errors into a serialisable result for forms. */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof ValidationError) return { ok: false, fieldErrors: error.fieldErrors };
    if (error instanceof NotFoundError) return { ok: false, error: "not_found" };
    if (error instanceof RateLimitedError) return { ok: false, error: "rate_limited" };
    console.error(error);
    return { ok: false, error: "unknown" };
  }
}
