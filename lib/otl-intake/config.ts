/**
 * Intake pipeline configuration (Phase 1 Step 6). Every name is prefixed OTL_INTAKE_ / TURNSTILE_
 * so nothing collides with the storefront's own Blob store or Upstash database:
 *   - lib/redis.ts falls back to UPSTASH_REDIS_REST_*, so the outbox must NOT use those names.
 *   - the public shop store owns BLOB_READ_WRITE_TOKEN / BLOB_STORE_ID.
 * Values are never logged.
 */

/** Cloudflare's documented always-pass test keys, used outside Production (D-29). */
const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";
const TURNSTILE_TEST_SECRET = "1x0000000000000000000000000000000AA";

export interface IntakeConfig {
  blobToken: string;
  upstashUrl: string;
  upstashToken: string;
  hmacSecret: string;
  hookUrl: string;
  cfAccessClientId: string | null;
  cfAccessClientSecret: string | null;
  turnstileSecret: string;
}

const isProduction = () => process.env.VERCEL_ENV === "production";

/** Public key for the browser widget. */
export function turnstileSiteKey(): string {
  return (isProduction() && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) || TURNSTILE_TEST_SITE_KEY;
}

const REQUIRED = [
  "OTL_INTAKE_BLOB_READ_WRITE_TOKEN",
  "OTL_INTAKE_UPSTASH_REST_URL",
  "OTL_INTAKE_UPSTASH_REST_TOKEN",
  "OTL_INTAKE_HMAC_SECRET",
  "OTL_INTAKE_HOOK_URL",
] as const;

/** Names (never values) of required variables that are missing. */
export function missingIntakeEnv(): string[] {
  const missing: string[] = REQUIRED.filter((n) => !process.env[n]);
  if (isProduction() && !process.env.TURNSTILE_SECRET_KEY) missing.push("TURNSTILE_SECRET_KEY");
  return missing;
}

/** Full config, or null when the intake isn't set up on this deployment yet. */
export function intakeConfig(): IntakeConfig | null {
  if (missingIntakeEnv().length) return null;
  const env = process.env;
  return {
    blobToken: env.OTL_INTAKE_BLOB_READ_WRITE_TOKEN!,
    upstashUrl: env.OTL_INTAKE_UPSTASH_REST_URL!,
    upstashToken: env.OTL_INTAKE_UPSTASH_REST_TOKEN!,
    hmacSecret: env.OTL_INTAKE_HMAC_SECRET!,
    hookUrl: env.OTL_INTAKE_HOOK_URL!,
    cfAccessClientId: env.CF_ACCESS_CLIENT_ID || null,
    cfAccessClientSecret: env.CF_ACCESS_CLIENT_SECRET || null,
    turnstileSecret: isProduction() ? env.TURNSTILE_SECRET_KEY! : TURNSTILE_TEST_SECRET,
  };
}
