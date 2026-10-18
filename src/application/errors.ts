import type { FieldErrors } from "@/domain/result";

export class AppError extends Error {}

export class ValidationError extends AppError {
  constructor(readonly fieldErrors: FieldErrors) {
    super("validation failed");
  }
}

/** Unknown id, or a resource that belongs to someone else (we do not reveal which). */
export class NotFoundError extends AppError {}

export class RateLimitedError extends AppError {}

export class InvalidTokenError extends AppError {}

export class InvalidSignatureError extends AppError {}

/** The feature needs a paid tier the website does not have (the UI links to /preise). */
export class LockedError extends AppError {}
