import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { ConfigError, isSupabaseConfigured, publicEnv } from "@/lib/env";

/** Cookie-bound Supabase client for Route Handlers / Server Components (acts as the signed-in user). */
export async function getServerSupabase() {
  if (!isSupabaseConfigured()) throw new ConfigError("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const cookieStore = await cookies();
  return createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component – the proxy refreshes the session instead.
        }
      },
    },
  });
}

export interface AuthUser {
  id: string;
  email: string | null;
  is_anonymous: boolean;
}

/**
 * Verified user from the session JWT, or null.
 * getClaims() verifies the signature locally (no network round-trip) when the project uses
 * asymmetric JWT signing keys, and falls back to asking Supabase Auth otherwise.
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await getServerSupabase();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims as { sub?: string; email?: string; is_anonymous?: boolean } | undefined;
  if (error || !claims?.sub) return null;
  return { id: claims.sub, email: claims.email || null, is_anonymous: Boolean(claims.is_anonymous) };
}
