import { z } from "zod";
import { text } from "./fields";
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

/** The home section of a website version. Names, date, place and time zone belong to the wedding. */
const homeSchema = z.object({
  welcomeMessage: text(5000),
  hashtag: z
    .string()
    .trim()
    .transform((s) => s.replace(/^#+/, ""))
    .pipe(z.string().max(60, "too_long").regex(/^[\p{L}\p{N}_]*$/u, "invalid_hashtag"))
    .default(""),
  showCountdown: z.boolean().default(false),
});

export type HomeInput = z.infer<typeof homeSchema>;

export function parseHome(input: unknown): Parsed<HomeInput> {
  return parseWith(homeSchema, input);
}
