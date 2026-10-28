import { z } from "zod";

/**
 * Server-side environment, validated once on first use.
 * Optional integrations (Stripe, Clover, S3, SMTP) report themselves as
 * "not configured" in the admin dashboard instead of crashing the site.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().optional(),
  APP_URL: z.string().url().default("http://localhost:3000"),
  /** 32+ random bytes, base64. Encrypts MFA secrets and Clover tokens at rest. */
  APP_ENCRYPTION_KEY: z.string().min(32, "APP_ENCRYPTION_KEY must be at least 32 characters"),

  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_AUTOMATIC_TAX: z.enum(["true", "false"]).default("true"),

  CLOVER_ENVIRONMENT: z.enum(["sandbox", "production"]).default("sandbox"),
  CLOVER_APP_ID: z.string().optional(),
  CLOVER_APP_SECRET: z.string().optional(),
  /** Value Clover sends in the X-Clover-Auth header for this app's webhooks. */
  CLOVER_WEBHOOK_AUTH_CODE: z.string().optional(),

  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_PUBLIC_URL: z.string().optional(),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().default("Fine Looks Hair & Beauty <orders@finelooksbeautystore.com>"),
  ALERT_EMAIL: z.string().optional(),
  /** One-time token that allows creating the first owner account at /admin/setup. */
  SETUP_TOKEN: z.string().min(24).optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export const isStripeConfigured = () => Boolean(env().STRIPE_SECRET_KEY && env().STRIPE_WEBHOOK_SECRET);
export const isCloverConfigured = () => Boolean(env().CLOVER_APP_ID && env().CLOVER_APP_SECRET);
export const isS3Configured = () =>
  Boolean(env().S3_BUCKET && env().S3_ACCESS_KEY_ID && env().S3_SECRET_ACCESS_KEY);
export const isSmtpConfigured = () => Boolean(env().SMTP_HOST);
