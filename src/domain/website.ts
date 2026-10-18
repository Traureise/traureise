import { z } from "zod";
import { isoDate, optional, requiredText, text } from "./fields";
import { parseWith, type Parsed } from "./result";

export const DEFAULT_TIMEZONE = "Europe/Berlin";

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("de-DE", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const homeSchema = z.object({
  title: requiredText(120),
  weddingDate: optional(isoDate).default(null),
  location: optional(z.string().trim().max(200, "too_long")).default(null),
  welcomeMessage: text(5000),
  hashtag: z
    .string()
    .trim()
    .transform((s) => s.replace(/^#+/, ""))
    .pipe(z.string().max(60, "too_long").regex(/^[\p{L}\p{N}_]*$/u, "invalid_hashtag"))
    .default(""),
  showCountdown: z.boolean().default(false),
  timezone: z.string().refine(isValidTimeZone, "invalid_timezone").default(DEFAULT_TIMEZONE),
});

export type HomeInput = z.infer<typeof homeSchema>;

export function parseHome(input: unknown): Parsed<HomeInput> {
  return parseWith(homeSchema, input);
}
