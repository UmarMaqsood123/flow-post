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

/** 32 random bytes, base64 or base64url encoded. */
const isEncryptionKey = (key: string) =>
  /^[A-Za-z0-9+/_-]{43}=?$/.test(key) && Buffer.from(key, "base64").length === 32;

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
    OPENAI_BASE_URL: z.url().default("https://api.openai.com/v1"),
    /**
     * AI provider used by services/ai.service.ts:
     * - `openai`: OpenAI's Responses API (paid).
     * - `openai-compatible`: any service speaking OpenAI's Chat Completions API —
     *   Groq, Gemini's compatibility endpoint, OpenRouter, Ollama, LM Studio.
     * - `none`: AI features are switched off.
     */
    AI_PROVIDER: z.enum(["openai", "openai-compatible", "none"]).default("openai"),
    /** For `openai-compatible`: e.g. https://api.groq.com/openai/v1 */
    AI_BASE_URL: optionalString,
    /** Optional: local runtimes like Ollama need no key. */
    AI_API_KEY: optionalString,
    AI_MODEL: optionalString,
    /** `json_object` is the fallback for models that can't enforce a schema. */
    AI_STRUCTURED_MODE: z.enum(["json_schema", "json_object"]).default("json_schema"),
    /** Name recorded on usage records and logs, e.g. "groq". */
    AI_PROVIDER_LABEL: optionalString,
    // Per attempt; retries use exponential backoff and honor Retry-After.
    AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300_000).default(60_000),
    AI_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
    // Upper bound per request; prompts may ask for less.
    AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(256).max(32_000).default(16_000),
    // Publishing worker (BullMQ over Redis)
    PUBLISH_CONCURRENCY: z.coerce.number().int().min(1).max(50).default(5),
    /**
     * Video uploads read the whole file into memory, so each worker process sends at
     * most this many at once (others wait). Size worker memory for this × the largest video.
     */
    PUBLISH_VIDEO_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(2),
    PUBLISH_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
    /** First retry delay; it doubles on each further attempt. */
    PUBLISH_BACKOFF_MS: z.coerce.number().int().min(1000).max(3_600_000).default(60_000),
    /** A claimed job older than this is treated as left behind by a crashed worker. */
    PUBLISH_LOCK_TIMEOUT_MS: z.coerce.number().int().min(30_000).max(3_600_000).default(300_000),
    /**
     * How long the worker waits for in-flight publishes when stopping. Video uploads
     * take minutes; the orchestrator's grace period (e.g. terminationGracePeriodSeconds)
     * must be at least this long.
     */
    WORKER_SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(15_000).max(3_600_000).default(300_000),
    /** How often the worker sweeps for abandoned jobs and missing queue entries. */
    PUBLISH_RECOVERY_INTERVAL_MS: z.coerce
      .number()
      .int()
      .min(10_000)
      .max(3_600_000)
      .default(60_000),

    /** How often the worker sweeps for workspaces whose metrics are stale. */
    ANALYTICS_COLLECTION_INTERVAL_MS: z.coerce
      .number()
      .int()
      .min(60_000)
      .max(86_400_000)
      .default(3_600_000),

    /** How often the worker plans and writes Autopilot posts. */
    AUTOPILOT_SWEEP_INTERVAL_MS: z.coerce
      .number()
      .int()
      .min(30_000)
      .max(3_600_000)
      .default(300_000),

    STRIPE_SECRET_KEY: optionalString,
    STRIPE_WEBHOOK_SECRET: optionalString,
    /** Stripe price ids for each paid plan. Yearly prices are optional. */
    STRIPE_PRICE_CREATOR_MONTHLY: optionalString,
    STRIPE_PRICE_CREATOR_YEARLY: optionalString,
    STRIPE_PRICE_PRO_MONTHLY: optionalString,
    STRIPE_PRICE_PRO_YEARLY: optionalString,
    STRIPE_PRICE_AGENCY_MONTHLY: optionalString,
    STRIPE_PRICE_AGENCY_YEARLY: optionalString,
    /** Days a past-due subscription keeps its plan while Stripe retries the payment. */
    BILLING_GRACE_DAYS: z.coerce.number().int().min(0).max(30).default(7),
    /**
     * The plan for accounts without a paid subscription. FREE in production;
     * self-hosted installs without Stripe can set a higher plan.
     */
    BILLING_DEFAULT_PLAN: z.enum(["FREE", "CREATOR", "PRO", "AGENCY"]).default("FREE"),
    /** How often the worker re-reads subscriptions from Stripe, in case a webhook was missed. */
    BILLING_SYNC_INTERVAL_MS: z.coerce
      .number()
      .int()
      .min(60_000)
      .max(86_400_000)
      .default(21_600_000),
    LINKEDIN_CLIENT_ID: optionalString,
    LINKEDIN_CLIENT_SECRET: optionalString,
    // A second LinkedIn app for Company Pages. LinkedIn only grants the Community
    // Management API to an app with no other products, so it can't be the one above.
    LINKEDIN_PAGES_CLIENT_ID: optionalString,
    LINKEDIN_PAGES_CLIENT_SECRET: optionalString,
    META_APP_ID: optionalString,
    META_APP_SECRET: optionalString,
    // Instagram Login (no Facebook Page needed). These are the Instagram app id
    // and secret from the Meta app's "API setup with Instagram login" page, not
    // META_APP_ID/META_APP_SECRET.
    INSTAGRAM_APP_ID: optionalString,
    INSTAGRAM_APP_SECRET: optionalString,
    TIKTOK_CLIENT_KEY: optionalString,
    TIKTOK_CLIENT_SECRET: optionalString,
    GOOGLE_CLIENT_ID: optionalString,
    GOOGLE_CLIENT_SECRET: optionalString,
    // TikTok rejects redirect URIs with a query string, and requires HTTPS.
    TIKTOK_REDIRECT_URI: optionalString,
    // Google OAuth client for the YouTube Data API.
    GOOGLE_REDIRECT_URI: optionalString,

    // Social integrations: key that encrypts OAuth tokens at rest (AES-256-GCM).
    TOKEN_ENCRYPTION_KEY: optionalString,
    // Old keys that still decrypt existing tokens during a rotation (comma-separated).
    TOKEN_ENCRYPTION_PREVIOUS_KEYS: z
      .string()
      .default("")
      .transform((value) =>
        value
          .split(",")
          .map((key) => key.trim())
          .filter(Boolean),
      ),
    SOCIAL_OAUTH_STATE_TTL_MINUTES: z.coerce.number().int().min(1).max(60).default(10),
    /** How often the worker renews tokens that expire unless refreshed (Instagram Login). */
    SOCIAL_TOKEN_REFRESH_INTERVAL_MS: z.coerce
      .number()
      .int()
      .min(60_000)
      .max(86_400_000)
      .default(21_600_000),

    // LinkedIn app (products: "Sign In with LinkedIn using OpenID Connect" + "Share on LinkedIn").
    // Must exactly match a redirect URL registered on the app's Auth tab.
    LINKEDIN_REDIRECT_URI: optionalString,
    // Versioned REST API header (YYYYMM). LinkedIn supports each version for at least a year.
    LINKEDIN_API_VERSION: z
      .string()
      .regex(/^\d{6}$/, "LINKEDIN_API_VERSION must be in YYYYMM format")
      .default("202608"),

    // Meta app (Business type, using Facebook Login for Business). One app covers
    // both platforms, but each has its own callback path, so each redirect URI is
    // registered and configured separately.
    META_FACEBOOK_REDIRECT_URI: optionalString,
    // Instagram's callback serves both Instagram Login and Facebook Login, so
    // register it on both the Facebook Login and the Instagram login settings.
    META_INSTAGRAM_REDIRECT_URI: optionalString,
    META_GRAPH_VERSION: z
      .string()
      .regex(/^v\d+\.\d+$/, "META_GRAPH_VERSION must look like v26.0")
      .default("v26.0"),
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
    if (value.NODE_ENV === "production") {
      // Behind a load balancer, trust proxy 0 makes every client share the
      // balancer's IP, so one noisy client rate-limits everyone.
      if (value.TRUST_PROXY < 1) {
        ctx.addIssue({
          code: "custom",
          path: ["TRUST_PROXY"],
          message:
            "TRUST_PROXY must be the number of proxies in front of the API (at least 1) in production",
        });
      }
      // Per-process counters multiply every limit by the number of instances.
      if (value.RATE_LIMIT_STORE !== "redis") {
        ctx.addIssue({
          code: "custom",
          path: ["RATE_LIMIT_STORE"],
          message: "RATE_LIMIT_STORE must be redis in production",
        });
      }
      const insecure = [value.FRONTEND_URL, ...value.CORS_ORIGINS].filter(
        (url) => !url.startsWith("https://"),
      );
      if (insecure.length > 0) {
        ctx.addIssue({
          code: "custom",
          path: ["CORS_ORIGINS"],
          message: `FRONTEND_URL and CORS_ORIGINS must be https:// in production (got ${insecure.join(", ")})`,
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
    if (value.TOKEN_ENCRYPTION_KEY && !isEncryptionKey(value.TOKEN_ENCRYPTION_KEY)) {
      ctx.addIssue({
        code: "custom",
        path: ["TOKEN_ENCRYPTION_KEY"],
        message: "TOKEN_ENCRYPTION_KEY must be 32 random bytes, base64-encoded",
      });
    }
    if (value.TOKEN_ENCRYPTION_PREVIOUS_KEYS.some((key) => !isEncryptionKey(key))) {
      ctx.addIssue({
        code: "custom",
        path: ["TOKEN_ENCRYPTION_PREVIOUS_KEYS"],
        message: "Each previous key must be 32 random bytes, base64-encoded",
      });
    }
    /**
     * A social integration is all-or-nothing: half-configured credentials fail
     * at connect time, which is much harder to diagnose than a boot error.
     */
    const requireCredentialGroup = (
      label: string,
      keys: readonly (keyof typeof value)[],
      redirectKey: keyof typeof value,
    ) => {
      if (!keys.some((key) => value[key])) return;
      for (const key of keys) {
        if (!value[key]) {
          ctx.addIssue({
            code: "custom",
            path: [key as string],
            message: `${String(key)} is required to enable ${label} (set all of ${keys.join(", ")})`,
          });
        }
      }
      const redirectUri = value[redirectKey];
      if (typeof redirectUri !== "string" || !redirectUri) return;
      let redirect: URL | null = null;
      try {
        redirect = new URL(redirectUri);
      } catch {
        ctx.addIssue({
          code: "custom",
          path: [redirectKey as string],
          message: `${String(redirectKey)} must be an absolute URL`,
        });
      }
      if (redirect && value.NODE_ENV === "production" && redirect.protocol !== "https:") {
        ctx.addIssue({
          code: "custom",
          path: [redirectKey as string],
          message: `${String(redirectKey)} must use HTTPS in production`,
        });
      }
    };

    // Billing needs the key, the webhook secret and at least the monthly prices together.
    const billingKeys = [
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "STRIPE_PRICE_CREATOR_MONTHLY",
      "STRIPE_PRICE_PRO_MONTHLY",
      "STRIPE_PRICE_AGENCY_MONTHLY",
    ] as const;
    if (billingKeys.some((key) => value[key])) {
      for (const key of billingKeys) {
        if (!value[key]) {
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: `${key} is required to enable Stripe billing (set all of ${billingKeys.join(", ")})`,
          });
        }
      }
    }

    // LinkedIn works with the profile app, the Pages app, or both; they share the callback.
    if (value.LINKEDIN_PAGES_CLIENT_ID || value.LINKEDIN_PAGES_CLIENT_SECRET) {
      requireCredentialGroup(
        "LinkedIn Company Pages",
        ["LINKEDIN_PAGES_CLIENT_ID", "LINKEDIN_PAGES_CLIENT_SECRET", "LINKEDIN_REDIRECT_URI"],
        "LINKEDIN_REDIRECT_URI",
      );
    }
    if (
      value.LINKEDIN_CLIENT_ID ||
      value.LINKEDIN_CLIENT_SECRET ||
      (value.LINKEDIN_REDIRECT_URI && !value.LINKEDIN_PAGES_CLIENT_ID)
    ) {
      requireCredentialGroup(
        "LinkedIn",
        ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET", "LINKEDIN_REDIRECT_URI"],
        "LINKEDIN_REDIRECT_URI",
      );
    }
    // One Meta app serves both, but each platform needs its own callback URL.
    requireCredentialGroup(
      "Facebook",
      ["META_APP_ID", "META_APP_SECRET", "META_FACEBOOK_REDIRECT_URI"],
      "META_FACEBOOK_REDIRECT_URI",
    );
    // Instagram works with either login, or both: Instagram Login needs the
    // Instagram app pair, Facebook Login the Meta app pair.
    if (value.INSTAGRAM_APP_ID || value.INSTAGRAM_APP_SECRET) {
      requireCredentialGroup(
        "Instagram login",
        ["INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET", "META_INSTAGRAM_REDIRECT_URI"],
        "META_INSTAGRAM_REDIRECT_URI",
      );
    } else {
      requireCredentialGroup(
        "Instagram",
        ["META_APP_ID", "META_APP_SECRET", "META_INSTAGRAM_REDIRECT_URI"],
        "META_INSTAGRAM_REDIRECT_URI",
      );
    }
    requireCredentialGroup(
      "TikTok",
      ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET", "TIKTOK_REDIRECT_URI"],
      "TIKTOK_REDIRECT_URI",
    );
    requireCredentialGroup(
      "YouTube",
      ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI"],
      "GOOGLE_REDIRECT_URI",
    );
    if (value.AI_PROVIDER === "openai-compatible") {
      for (const key of ["AI_BASE_URL", "AI_MODEL"] as const) {
        if (!value[key]) {
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: `${key} is required when AI_PROVIDER=openai-compatible`,
          });
        }
      }
    }
    if (value.NODE_ENV === "production" && !value.TOKEN_ENCRYPTION_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["TOKEN_ENCRYPTION_KEY"],
        message: "TOKEN_ENCRYPTION_KEY is required in production",
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
