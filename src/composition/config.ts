import { z } from "zod";
import { PAID_TIERS } from "@/domain/billing";

const schema = z.object({
  APP_URL: z.url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1),
  SMTP_HOST: z.string().default("localhost"),
  SMTP_PORT: z.coerce.number().int().default(1025),
  SMTP_SECURE: z.stringbool().default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().default("Traureise <no-reply@traureise.localhost>"),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./data/uploads"),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.stringbool().default(true),
  THEMES_DIR: z.string().default("./themes"),
  // Linked in the footer (AGPL § 13). Point it at your own source if you run a modified version.
  SOURCE_CODE_URL: z.url().default("https://github.com/Traureise/traureise"),

  // The operator's own Impressum, privacy policy and terms as Markdown files; Traureise ships none of the texts.
  IMPRINT_FILE: z.string().optional(),
  PRIVACY_FILE: z.string().optional(),
  TERMS_FILE: z.string().optional(),

  // Billing: off unless enabled and every Creem setting is present.
  BILLING_ENABLED: z.stringbool().default(false),
  CREEM_API_URL: z.url().default("https://api.creem.io"),
  CREEM_API_KEY: z.string().optional(),
  CREEM_WEBHOOK_SECRET: z.string().optional(),
  CREEM_PRODUCT_RSVP: z.string().optional(),
  CREEM_PRODUCT_INVITATIONS: z.string().optional(),
  CREEM_PRODUCT_COMPLETE: z.string().optional(),
  PRICE_RSVP_EUR: z.coerce.number().int().nonnegative().default(49),
  PRICE_INVITATIONS_EUR: z.coerce.number().int().nonnegative().default(139),
  PRICE_COMPLETE_EUR: z.coerce.number().int().nonnegative().default(149),
  // Testing only: sells tiers whose features are not built yet (comma-separated, e.g. "rsvp").
  BILLING_TEST_UNLOCK_TIERS: z
    .string()
    .default("")
    .transform((s) => s.split(",").map((t) => t.trim()).filter(Boolean))
    .pipe(z.array(z.enum(PAID_TIERS))),
});

export type AppConfig = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  // Empty strings from .env files mean "not set".
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== ""));
  return schema.parse(cleaned);
}

/** Billing is effectively on only when switched on and Creem is fully configured. */
export function billingProblems(config: AppConfig): string[] {
  if (!config.BILLING_ENABLED) return [];
  const required = ["CREEM_API_KEY", "CREEM_WEBHOOK_SECRET"] as const;
  return required.filter((key) => !config[key]);
}


/** Problems an operator should fix; logged once at startup. The instance runs regardless. */
export function startupWarnings(config: AppConfig): string[] {
  const warnings: string[] = [];
  if (!config.IMPRINT_FILE || !config.PRIVACY_FILE) {
    warnings.push("No Impressum or privacy policy: set IMPRINT_FILE and PRIVACY_FILE before running a public instance.");
  }
  const billing = billingProblems(config);
  if (billing.length > 0) warnings.push(`BILLING_ENABLED=true but ${billing.join(", ")} missing: billing stays off.`);
  return warnings;
}
