import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
let supabaseHost = "";
try {
  supabaseHost = supabaseUrl ? new URL(supabaseUrl).host : "";
} catch {
  supabaseHost = "";
}

const isDev = process.env.NODE_ENV !== "production";

/**
 * Public site URL (SEO, canonical, Stripe redirects). Falls back to the URL Netlify provides at build time
 * (process.env.URL), so a deploy without NEXT_PUBLIC_APP_URL still links to itself instead of localhost.
 */
const appUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.URL || "http://localhost:3000").replace(/\/$/, "");

/**
 * Supabase origins allowed by the CSP. *.supabase.co is always allowed so the policy
 * keeps working even if the env var was missing/invalid when the server started;
 * a custom Supabase domain (if any) is added from NEXT_PUBLIC_SUPABASE_URL.
 */
const supabaseHttp = ["https://*.supabase.co", ...(supabaseHost && !supabaseHost.endsWith(".supabase.co") ? [`https://${supabaseHost}`] : [])].join(" ");
/** Cloudflare R2 (lantern images): presigned PUT from the browser + presigned GET for <img>/canvas */
const r2Http = "https://*.r2.cloudflarestorage.com";
const supabaseWs = ["wss://*.supabase.co", ...(supabaseHost && !supabaseHost.endsWith(".supabase.co") ? [`wss://${supabaseHost}`] : [])].join(" ");

/**
 * Content-Security-Policy
 * - ไม่โหลด Stripe.js ฝั่ง Client (ใช้ Redirect ไป Stripe Checkout) จึงไม่ต้องเปิด js.stripe.com
 * - อนุญาต Supabase (REST/Storage/Realtime wss) เฉพาะ Project ที่ตั้งค่าไว้
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "frame-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabaseHttp} ${r2Http}`,
  "font-src 'self' data:",
  `media-src 'self' blob: ${supabaseHttp} ${r2Http}`,
  `connect-src 'self' ${supabaseHttp} ${supabaseWs} ${r2Http}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://checkout.stripe.com",
  "object-src 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self)" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  env: { NEXT_PUBLIC_APP_URL: isDev && !process.env.NEXT_PUBLIC_APP_URL ? "http://localhost:3000" : appUrl },
  images: {
    remotePatterns: supabaseHost
      ? [{ protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/**" }]
      : [],
  },
  serverExternalPackages: ["sharp"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
