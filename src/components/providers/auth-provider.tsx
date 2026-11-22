"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getBrowserSupabase } from "@/lib/supabase/client";

interface AuthState {
  user: User | null;
  /** true until the initial session check is done */
  loading: boolean;
  configured: boolean;
  /** Returns a session, creating an anonymous (guest) one if needed */
  ensureSession: () => Promise<User>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = getBrowserSupabase();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const pending = useRef<Promise<User> | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setUser(data.user ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  const ensureSession = useCallback(async () => {
    if (!supabase) throw new Error("ระบบยังไม่ได้ตั้งค่า Supabase");
    if (pending.current) return pending.current;
    pending.current = (async () => {
      const { data } = await supabase.auth.getUser();
      if (data.user) return data.user;
      const { data: anon, error } = await supabase.auth.signInAnonymously();
      if (error || !anon.user) throw new Error(error?.message ?? "ไม่สามารถสร้างเซสชันผู้เยี่ยมชมได้");
      setUser(anon.user);
      return anon.user;
    })().finally(() => {
      pending.current = null;
    });
    return pending.current;
  }, [supabase]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null);
  }, [supabase]);

  const value = useMemo(
    () => ({ user, loading, configured: Boolean(supabase), ensureSession, signOut }),
    [user, loading, supabase, ensureSession, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
