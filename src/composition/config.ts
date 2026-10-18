import { z } from "zod";
import { PAID_TIERS } from "@/domain/billing";
import { operatorDetails } from "@/domain/operator";

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

  // Who runs this instance (Impressum, privacy policy). Name, address and email are required for both pages.
  OPERATOR_NAME: z.string().optional(),
  OPERATOR_BUSINESS_NAME: z.string().optional(),
  OPERATOR_ADDRESS: z.string().optional(),
  OPERATOR_EMAIL: z.string().optional(),
  OPERATOR_PHONE: z.string().optional(),
  OPERATOR_VAT_ID: z.string().optional(),
  OPERATOR_VAT_NOTE: z.string().optional(),
  OPERATOR_CONTENT_RESPONSIBLE: z.string().optional(),
  OPERATOR_DISPUTE_RESOLUTION: z.string().optional(),

  // Processors named in the privacy policy.
  PRIVACY_HOSTING_PROVIDER: z.string().optional(),
  PRIVACY_SMTP_PROVIDER: z.string().optional(),
  PRIVACY_STORAGE_PROVIDER: z.string().optional(),

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

export function operatorFromConfig(config: AppConfig) {
  return operatorDetails({
    name: config.OPERATOR_NAME,
    businessName: config.OPERATOR_BUSINESS_NAME,
    address: config.OPERATOR_ADDRESS,
    email: config.OPERATOR_EMAIL,
    phone: config.OPERATOR_PHONE,
    vatId: config.OPERATOR_VAT_ID,
    vatNote: config.OPERATOR_VAT_NOTE,
    contentResponsible: config.OPERATOR_CONTENT_RESPONSIBLE,
    disputeResolution: config.OPERATOR_DISPUTE_RESOLUTION,
  });
}

/** Problems an operator should fix; logged once at startup. The instance runs regardless. */
export function startupWarnings(config: AppConfig): string[] {
  const warnings: string[] = [];
  const { missing } = operatorFromConfig(config);
  if (missing.length > 0) {
    warnings.push(`Legal pages are not configured: set ${missing.join(", ")}. /impressum and /datenschutz say so until then.`);
  }
  const billing = billingProblems(config);
  if (billing.length > 0) warnings.push(`BILLING_ENABLED=true but ${billing.join(", ")} missing: billing stays off.`);
  return warnings;
}
