import "server-only";
import { ApiError } from "@/lib/api";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { log } from "./logger";

/**
 * Database-backed fixed-window rate limiter (works across serverless instances).
 * Fails open if the database call itself fails, so an outage of the limiter does not take the site down.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number, message = "ทำรายการถี่เกินไป กรุณารอสักครู่แล้วลองใหม่") {
  const { data, error } = await getAdminSupabase().rpc("check_rate_limit", {
    p_key: key.slice(0, 200),
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    await log("warn", "rate-limit", error.message, { key });
    return;
  }
  if (data === false) throw new ApiError(429, "rate_limited", message);
}
