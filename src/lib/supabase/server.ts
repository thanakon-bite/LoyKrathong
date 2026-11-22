import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
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

/** Verified user (JWT validated by Supabase Auth), or null. */
export async function getCurrentUser(): Promise<User | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await getServerSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}
