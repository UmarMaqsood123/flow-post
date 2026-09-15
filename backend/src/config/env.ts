import "dotenv/config";
import { z } from "zod";

/** Treats empty strings (e.g. `KEY=` in .env) as undefined. */
const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined));

const booleanString = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(5000),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),
    JSON_BODY_LIMIT: z.string().default("1mb"),

    CORS_ORIGINS: z
      .string()
      .default("http://localhost:5173")
      .transform((value) =>
        value
          .split(",")
          .map((origin) => origin.trim())
          .filter(Boolean),
      ),
    FRONTEND_URL: z.url().default("http://localhost:5173"),

    RATE_LIMIT_WINDOW_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(15 * 60 * 1000),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
    // `redis` shares counters across API instances; `memory` is per-process.
    RATE_LIMIT_STORE: z.enum(["memory", "redis"]).default("memory"),

    MONGO_URI: z.string().min(1, "MONGO_URI is required"),
    REDIS_URL: z.string().min(1, "REDIS_URL is required"),

    // Authentication
    JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
    JWT_ISSUER: z.string().default("flowpost-api"),
    JWT_AUDIENCE: z.string().default("flowpost-app"),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(15 * 60),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
    // Reusing a just-rotated refresh token within this window (e.g. an aborted response or
    // parallel tabs) gets a new token instead of revoking the session. 0 disables it.
    REFRESH_TOKEN_REUSE_GRACE_SECONDS: z.coerce.number().int().min(0).max(60).default(10),
    EMAIL_VERIFICATION_TTL_HOURS: z.coerce.number().int().positive().default(24),
    PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(60),
    WORKSPACE_INVITATION_TTL_DAYS: z.coerce.number().int().positive().default(7),

    // File storage: `oci` uploads to Oracle Cloud Object Storage (same setup as jobs-viewer),
    // `memory` keeps files in the process (tests), `none` disables uploads.
    STORAGE_PROVIDER: z.enum(["none", "memory", "oci"]).default("none"),
    OCI_TENANCY_OCID: optionalString,
    OCI_USER_OCID: optionalString,
    OCI_FINGERPRINT: optionalString,
    OCI_REGION: optionalString,
    OCI_NAMESPACE: optionalString,
    OCI_BUCKET: optionalString,
    // API signing key: inline PEM (newlines may be escaped as \n) or a path outside the source tree.
    OCI_PRIVATE_KEY: optionalString,
    OCI_PRIVATE_KEY_PATH: optionalString,
    OCI_PRIVATE_KEY_PASSPHRASE: optionalString,
    // Public base URL for stored objects (e.g. a CDN). Defaults to the bucket's object URL.
    STORAGE_PUBLIC_BASE_URL: optionalString,
    UPLOAD_MAX_FILE_SIZE_MB: z.coerce.number().int().min(1).max(100).default(10),
    UPLOAD_MAX_VIDEO_SIZE_MB: z.coerce.number().int().min(1).max(1024).default(100),
    UPLOAD_MAX_FILES: z.coerce.number().int().min(1).max(20).default(10),
    COOKIE_DOMAIN: optionalString,
    COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).default("lax"),

    // Email delivery: `console` logs emails (dev), `memory` captures them (tests), `smtp` sends.
    EMAIL_PROVIDER: z.enum(["console", "memory", "smtp"]).default("console"),
    EMAIL_FROM: z.string().default("FlowPost <no-reply@flowpost.local>"),
    SMTP_HOST: optionalString,
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_SECURE: booleanString,
    SMTP_USER: optionalString,
    SMTP_PASS: optionalString,

    // Third-party integrations — optional until their features are built.
    OPENAI_API_KEY: optionalString,
    OPENAI_MODEL: optionalString,
    STRIPE_SECRET_KEY: optionalString,
    STRIPE_WEBHOOK_SECRET: optionalString,
    LINKEDIN_CLIENT_ID: optionalString,
    LINKEDIN_CLIENT_SECRET: optionalString,
    META_APP_ID: optionalString,
    META_APP_SECRET: optionalString,
    TIKTOK_CLIENT_KEY: optionalString,
    TIKTOK_CLIENT_SECRET: optionalString,
    GOOGLE_CLIENT_ID: optionalString,
    GOOGLE_CLIENT_SECRET: optionalString,
  })
  .superRefine((value, ctx) => {
    if (value.STORAGE_PROVIDER === "oci") {
      const requiredOciKeys = [
        "OCI_TENANCY_OCID",
        "OCI_USER_OCID",
        "OCI_FINGERPRINT",
        "OCI_REGION",
        "OCI_NAMESPACE",
        "OCI_BUCKET",
      ] as const;
      for (const key of requiredOciKeys) {
        if (!value[key]) {
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: `${key} is required when STORAGE_PROVIDER=oci`,
          });
        }
      }
      if (!value.OCI_PRIVATE_KEY && !value.OCI_PRIVATE_KEY_PATH) {
        ctx.addIssue({
          code: "custom",
          path: ["OCI_PRIVATE_KEY"],
          message: "Set OCI_PRIVATE_KEY or OCI_PRIVATE_KEY_PATH when STORAGE_PROVIDER=oci",
        });
      }
    }
    if (value.NODE_ENV === "production" && value.STORAGE_PROVIDER === "memory") {
      ctx.addIssue({
        code: "custom",
        path: ["STORAGE_PROVIDER"],
        message: "STORAGE_PROVIDER=memory is for tests only",
      });
    }
    if (value.EMAIL_PROVIDER === "smtp" && !value.SMTP_HOST) {
      ctx.addIssue({
        code: "custom",
        path: ["SMTP_HOST"],
        message: "SMTP_HOST is required when EMAIL_PROVIDER=smtp",
      });
    }
    if (value.NODE_ENV === "production" && value.EMAIL_PROVIDER !== "smtp") {
      ctx.addIssue({
        code: "custom",
        path: ["EMAIL_PROVIDER"],
        message: "EMAIL_PROVIDER must be smtp in production",
      });
    }
    // Browsers reject SameSite=None cookies that are not Secure (Secure is on only in production).
    if (value.COOKIE_SAME_SITE === "none" && value.NODE_ENV !== "production") {
      ctx.addIssue({
        code: "custom",
        path: ["COOKIE_SAME_SITE"],
        message: "COOKIE_SAME_SITE=none requires NODE_ENV=production (Secure cookies)",
      });
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Logger depends on env, so fail fast with console output.
  // eslint-disable-next-line no-console
  console.error(`❌ Invalid environment variables:\n${z.prettifyError(parsed.error)}`);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;

export const isProduction = env.NODE_ENV === "production";
export const isDevelopment = env.NODE_ENV === "development";
export const isTest = env.NODE_ENV === "test";
