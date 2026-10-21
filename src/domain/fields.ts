import { z } from "zod";

/** Shared zod building blocks for form input. Error messages are codes resolved via i18n. */
export const text = (max: number) => z.string().trim().max(max, "too_long").default("");
export const requiredText = (max: number) => z.string().trim().min(1, "required").max(max, "too_long");

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "invalid_date")
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
  }, "invalid_date");

export const time24 = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "invalid_time");

/** Empty string or null → null. */
export const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === "" || v === undefined || (typeof v === "string" && v.trim() === "") ? null : v), schema.nullable());

/** Accepts "example.org" or "https://example.org"; stores a full http(s) URL. */
export const webUrl = z.preprocess(
  (v) => (typeof v === "string" && v.trim() && !/^[a-z][a-z0-9+.-]*:/i.test(v.trim()) ? `https://${v.trim()}` : v),
  z.string().trim().max(500, "too_long").refine((s) => {
    try {
      const u = new URL(s);
      return (u.protocol === "https:" || u.protocol === "http:") && u.hostname.includes(".");
    } catch {
      return false;
    }
  }, "invalid_url"),
);

export const imageKey = z.string().regex(/^[a-zA-Z0-9_-]+\.(webp|jpg|png)$/, "invalid_image");

/** A place picked on the map: both coordinates or neither (the error goes on `latitude`). */
export const latitude = optional(z.coerce.number("invalid_option").min(-90, "invalid_option").max(90, "invalid_option")).default(null);
export const longitude = optional(z.coerce.number("invalid_option").min(-180, "invalid_option").max(180, "invalid_option")).default(null);
export const bothOrNeither = (p: { latitude: number | null; longitude: number | null }) => (p.latitude === null) === (p.longitude === null);
export const bothOrNeitherError = { path: ["latitude"], message: "invalid_option" };
