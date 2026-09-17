import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Integration files each start their own in-memory MongoDB; run them one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    // Applied before any module loads, so src/config/env.ts validates these values.
    env: {
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      MONGO_URI: "mongodb://127.0.0.1:27017/unused-replaced-by-memory-server",
      REDIS_URL: "redis://127.0.0.1:6379",
      JWT_ACCESS_SECRET: "test-only-secret-with-at-least-thirty-two-characters",
      EMAIL_PROVIDER: "memory",
      STORAGE_PROVIDER: "memory",
      STORAGE_PUBLIC_BASE_URL: "https://storage.flowpost.test",
      UPLOAD_MAX_FILE_SIZE_MB: "1",
      UPLOAD_MAX_VIDEO_SIZE_MB: "2",
      UPLOAD_MAX_FILES: "3",
      // Fixed test-only key (32 bytes of 0x07). Never use outside tests.
      TOKEN_ENCRYPTION_KEY: "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=",
      RATE_LIMIT_STORE: "memory",
      // Tests give each client its own X-Forwarded-For IP so per-IP limits stay isolated.
      TRUST_PROXY: "1",
      FRONTEND_URL: "http://localhost:5173",
      CORS_ORIGINS: "http://localhost:5173",
      // Blank out real credentials from a local .env so tests never call external
      // APIs, and so a configured developer machine doesn't change what the
      // provider tests see. Empty strings read as "not configured".
      LINKEDIN_CLIENT_ID: "",
      LINKEDIN_CLIENT_SECRET: "",
      LINKEDIN_REDIRECT_URI: "",
      META_APP_ID: "",
      META_APP_SECRET: "",
      META_FACEBOOK_REDIRECT_URI: "",
      META_INSTAGRAM_REDIRECT_URI: "",
      TIKTOK_CLIENT_KEY: "",
      TIKTOK_CLIENT_SECRET: "",
      TIKTOK_REDIRECT_URI: "",
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: "",
      GOOGLE_REDIRECT_URI: "",
      OPENAI_API_KEY: "",
      OPENAI_MODEL: "",
      AI_PROVIDER: "openai",
      // Billing: tests swap in a fake Stripe gateway, so these never reach Stripe.
      // Accounts without a subscription get Agency so feature tests aren't limited;
      // billing tests set plans explicitly.
      STRIPE_SECRET_KEY: "sk_test_not_used",
      STRIPE_WEBHOOK_SECRET: "whsec_test_secret",
      STRIPE_PRICE_CREATOR_MONTHLY: "price_creator_month",
      STRIPE_PRICE_CREATOR_YEARLY: "price_creator_year",
      STRIPE_PRICE_PRO_MONTHLY: "price_pro_month",
      STRIPE_PRICE_PRO_YEARLY: "",
      STRIPE_PRICE_AGENCY_MONTHLY: "price_agency_month",
      STRIPE_PRICE_AGENCY_YEARLY: "price_agency_year",
      BILLING_DEFAULT_PLAN: "AGENCY",
    },
  },
});
