import { z } from "zod";
import { PAID_TIERS } from "@/domain/billing";

/** An http(s) link, or unset (an empty value counts as unset). */
const legalUrl = z.preprocess((v) => (v === "" ? undefined : v), z.url({ protocol: /^https?$/ }).optional());

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
  // Signs the guests' personal links. Changing it makes every link already sent stop working.
  APP_SECRET: z.string().optional(),
  // Retention and daily summaries run in the app every this many minutes; 0 turns them off (tests).
  GUEST_JOBS_INTERVAL_MINUTES: z.coerce.number().int().nonnegative().default(15),
  // Card emails and reminders: at most this many per job pass, with this pause between two (SMTP rate limit).
  MAIL_BATCH_SIZE: z.coerce.number().int().positive().default(50),
  MAIL_SEND_INTERVAL_MS: z.coerce.number().int().nonnegative().default(1000),
  // Font files for card exports (fontsource packages); the Docker image ships them.
  CARD_FONTS_DIR: z.string().default("./node_modules/@fontsource"),
  // Testing only: /api/test/clock moves the app's clock and /api/test/jobs runs the guest jobs.
  TEST_HOOKS: z.stringbool().default(false),
  // Linked in the footer (AGPL § 13). Point it at your own source if you run a modified version.
  SOURCE_CODE_URL: z.url().default("https://github.com/Traureise/traureise"),

  // Where the operator's own Impressum, privacy policy and terms are; Traureise only links them (ADR 0027).
  IMPRINT_URL: legalUrl,
  PRIVACY_URL: legalUrl,
  TERMS_URL: legalUrl,

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
export const PLACEHOLDER_SECRET = "change-me";
/** Used only when APP_SECRET is missing, with a loud warning: anyone who knows it can compute links from a database dump. */
export const FALLBACK_SECRET = "traureise-insecure-default-secret";

export function appSecret(config: AppConfig): string {
  return config.APP_SECRET ?? FALLBACK_SECRET;
}

export function startupWarnings(config: AppConfig): string[] {
  const warnings: string[] = [];
  if (!config.APP_SECRET || config.APP_SECRET === PLACEHOLDER_SECRET || config.APP_SECRET.length < 32) {
    warnings.push("APP_SECRET is missing, the placeholder or shorter than 32 characters: set a long random value (openssl rand -base64 48) before sending guest links.");
  }
  if (config.TEST_HOOKS) warnings.push("TEST_HOOKS=true lets anyone move this instance's clock and delete guest data. Never use it outside tests.");
  if (!config.IMPRINT_URL || !config.PRIVACY_URL) {
    warnings.push("No Impressum or privacy policy: set IMPRINT_URL and PRIVACY_URL before running a public instance.");
  }
  const billing = billingProblems(config);
  if (billing.length > 0) warnings.push(`BILLING_ENABLED=true but ${billing.join(", ")} missing: billing stays off.`);
  return warnings;
}
