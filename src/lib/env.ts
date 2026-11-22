/**
 * Environment access. Public values are inlined at build time by Next.js,
 * so each NEXT_PUBLIC_* variable must be referenced literally.
 */
export const publicEnv = {
  appUrl: (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, ""),
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  stripePublishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "",
  bgmUrl: process.env.NEXT_PUBLIC_BGM_URL || "",
  festivalStart: process.env.NEXT_PUBLIC_FESTIVAL_START || "2026-11-24T18:00:00+07:00",
  festivalEnd: process.env.NEXT_PUBLIC_FESTIVAL_END || "2026-11-25T02:00:00+07:00",
};

/** true only for an absolute http(s) URL, e.g. https://xxxx.supabase.co */
export function isValidHttpUrl(value: string | undefined | null): value is string {
  if (!value) return false;
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

let warned = false;
export const isSupabaseConfigured = () => {
  if (!publicEnv.supabaseUrl || !publicEnv.supabaseAnonKey) return false;
  if (!isValidHttpUrl(publicEnv.supabaseUrl)) {
    if (!warned) {
      warned = true;
      console.error(
        `[config] NEXT_PUBLIC_SUPABASE_URL is not a valid URL: "${publicEnv.supabaseUrl}". ` +
          "Use the Project URL, e.g. https://abcdefghijklmnop.supabase.co",
      );
    }
    return false;
  }
  return true;
};

export class ConfigError extends Error {
  constructor(name: string) {
    super(`Missing required environment variable: ${name}`);
    this.name = "ConfigError";
  }
}

/** Server-only secret accessor. Throws a ConfigError (mapped to HTTP 503) when missing. */
export function serverEnv(name: "SUPABASE_SERVICE_ROLE_KEY" | "STRIPE_SECRET_KEY" | "STRIPE_WEBHOOK_SECRET" | "CRON_SECRET" | "CLAIM_TOKEN_SECRET") {
  if (typeof window !== "undefined") throw new Error("serverEnv() must not be called in the browser");
  const value = process.env[name];
  if (!value) throw new ConfigError(name);
  return value;
}

/** QR-only checkout: PromptPay QR (any Thai bank app) is the only payment method */
export const qrOnlyPayment = () => process.env.NEXT_PUBLIC_PAYMENT_QR_ONLY === "true";
export const promptPayEnabled = () => qrOnlyPayment() || process.env.STRIPE_ENABLE_PROMPTPAY === "true";
export const stripePaymentMethods = (): Array<"card" | "promptpay"> =>
  qrOnlyPayment() ? ["promptpay"] : promptPayEnabled() ? ["card", "promptpay"] : ["card"];
