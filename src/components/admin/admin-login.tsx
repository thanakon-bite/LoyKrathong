"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LockKeyhole } from "lucide-react";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AdminLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = getBrowserSupabase();
    if (!supabase) {
      setError("ยังไม่ได้ตั้งค่า Supabase");
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setError("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
      return;
    }
    router.replace("/admin");
    router.refresh();
  };

  return (
    <Card className="mx-auto w-full max-w-sm space-y-5 p-7">
      <div className="text-center">
        <LockKeyhole className="mx-auto mb-3 size-8 text-gold" />
        <h1 className="font-display text-2xl text-warm">ผู้ดูแลระบบ</h1>
        <p className="mt-1 text-sm text-warm/55">เข้าสู่ระบบด้วยบัญชีที่มีสิทธิ์ Admin หรือ Moderator</p>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="admin-email">อีเมล</Label>
          <Input id="admin-email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="admin-password">รหัสผ่าน</Label>
          <Input id="admin-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />} เข้าสู่ระบบ
        </Button>
      </form>
    </Card>
  );
}
