import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ConfigError, publicEnv, serverEnv } from "@/lib/env";

let adminClient: SupabaseClient | null = null;

/**
 * Service-role client. Bypasses RLS – use ONLY inside server code after
 * validating the caller. Never import from a Client Component.
 */
export function getAdminSupabase(): SupabaseClient {
  if (!publicEnv.supabaseUrl) throw new ConfigError("NEXT_PUBLIC_SUPABASE_URL");
  if (!adminClient) {
    adminClient = createClient(publicEnv.supabaseUrl, serverEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
}

export const LANTERN_BUCKET = "lantern-assets";
