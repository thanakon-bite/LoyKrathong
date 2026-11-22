"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, LogOut, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const CLAIM_KEY = "loykrathong:claim-token";

/**
 * Guests can keep their lanterns by:
 *  1) "บันทึกเข้าบัญชีใหม่" – converts the anonymous user into a registered one (same user id → lanterns stay)
 *  2) "มีบัญชีอยู่แล้ว" – signs in to an existing account, then moves the guest lanterns with a signed claim token
 */
export function AccountCard({ onChanged }: { onChanged: () => void }) {
  const { user, signOut } = useAuth();
  const [email, setEmail] = useState("");
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const claimed = useRef(false);

  // after signing in to an existing account: move guest lanterns
  useEffect(() => {
    if (!user || user.is_anonymous || claimed.current) return;
    let token: string | null = null;
    try {
      token = localStorage.getItem(CLAIM_KEY);
    } catch {
      /* ignore */
    }
    if (!token) return;
    claimed.current = true;
    apiFetch<{ moved: number }>("/api/account/claim", { method: "POST", json: { token } })
      .then(({ moved }) => {
        if (moved > 0) toast.success(`ย้ายโคม ${moved} ดวงเข้าบัญชีเรียบร้อย`);
        onChanged();
      })
      .catch((e: Error) => toast.error(e.message))
      .finally(() => {
        try {
          localStorage.removeItem(CLAIM_KEY);
        } catch {
          /* ignore */
        }
      });
  }, [user, onChanged]);

  if (!user) return null;

  if (!user.is_anonymous) {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ShieldCheck className="size-6 text-emerald-300" />
          <div>
            <p className="text-sm text-warm">บัญชีของคุณ</p>
            <p className="text-xs text-warm/55">{user.email}</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void signOut().then(onChanged)}>
          <LogOut /> ออกจากระบบ
        </Button>
      </Card>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = getBrowserSupabase();
    if (!supabase || !email) return;
    setBusy(true);
    const redirect = `${location.origin}/auth/callback?next=/my-lanterns`;
    try {
      if (mode === "new") {
        const { error } = await supabase.auth.updateUser({ email }, { emailRedirectTo: redirect });
        if (error) throw error;
      } else {
        const { token } = await apiFetch<{ token: string }>("/api/account/claim-token", { method: "POST" });
        localStorage.setItem(CLAIM_KEY, token);
        const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect, shouldCreateUser: false } });
        if (error) throw error;
      }
      setSent(true);
    } catch (err) {
      toast.error((err as Error).message || "ส่งอีเมลไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-4">
      <div>
        <p className="font-display text-lg text-warm">เก็บโคมของคุณไว้ในบัญชี</p>
        <p className="mt-1 text-sm text-warm/60">
          ตอนนี้คุณใช้งานแบบผู้เยี่ยมชม โคมจะผูกกับเบราว์เซอร์นี้เท่านั้น ยืนยันอีเมลเพื่อกลับมาดูโคมได้จากทุกอุปกรณ์
        </p>
      </div>
      {sent ? (
        <p className="flex items-center gap-2 rounded-2xl bg-emerald-500/10 p-3 text-sm text-emerald-200">
          <Mail className="size-4" /> ส่งลิงก์ยืนยันไปที่ {email} แล้ว กรุณาเปิดอีเมลบนอุปกรณ์นี้
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <div className="flex gap-2 text-xs">
            <button type="button" onClick={() => setMode("new")} className={mode === "new" ? "text-gold underline underline-offset-4" : "text-warm/55"}>
              สมัครด้วยอีเมลใหม่
            </button>
            <span className="text-warm/30">|</span>
            <button type="button" onClick={() => setMode("existing")} className={mode === "existing" ? "text-gold underline underline-offset-4" : "text-warm/55"}>
              มีบัญชีอยู่แล้ว
            </button>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="acc-email">อีเมล</Label>
            <div className="flex gap-2">
              <Input id="acc-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <Mail />} ส่งลิงก์
              </Button>
            </div>
          </div>
        </form>
      )}
    </Card>
  );
}
