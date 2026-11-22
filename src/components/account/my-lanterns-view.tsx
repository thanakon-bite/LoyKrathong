"use client";

import { EFFECT_META } from "@/lib/lantern/effects-meta";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertCircle, Eye, Receipt, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/providers/auth-provider";
import { apiFetch } from "@/lib/api-client";
import { LANTERN_DESIGNS } from "@/lib/lantern/designs";
import { formatDateTime, formatTHB } from "@/lib/utils";
import { formatRemaining } from "@/lib/lantern/motion";
import type { LanternStatus, MyLanternSummary } from "@/types/lantern";
import type { PaymentRecord, PaymentStatus } from "@/types/payment";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AccountCard } from "./account-card";
import { MyRiver } from "./my-river";

interface MeResponse {
  lanterns: MyLanternSummary[];
  payments: PaymentRecord[];
  serverTime: string;
}

const LANTERN_STATUS: Record<LanternStatus, { label: string; variant: "success" | "warning" | "muted" | "danger" }> = {
  active: { label: "กำลังลอย", variant: "success" },
  pending_payment: { label: "รอชำระเงิน", variant: "warning" },
  expired: { label: "ลอยในสายน้ำของฉัน", variant: "muted" },
  removed: { label: "ถูกซ่อน", variant: "danger" },
  cancelled: { label: "ยกเลิก", variant: "muted" },
};

const PAYMENT_STATUS: Record<PaymentStatus, { label: string; variant: "success" | "warning" | "muted" | "danger" }> = {
  paid: { label: "ชำระแล้ว", variant: "success" },
  pending: { label: "รอดำเนินการ", variant: "warning" },
  failed: { label: "ไม่สำเร็จ", variant: "danger" },
  cancelled: { label: "ยกเลิก", variant: "muted" },
  expired: { label: "หมดเวลา", variant: "muted" },
  refunded: { label: "คืนเงินแล้ว", variant: "muted" },
};

function Remaining({ expiresAt, offset }: { expiresAt: string; offset: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = Date.parse(expiresAt) - (now + offset);
  return <span className="tabular-nums">{ms > 0 ? `ลอยอีก ${formatRemaining(ms)}` : formatRemaining(ms)}</span>;
}

export function MyLanternsView() {
  const { user, loading: authLoading, configured } = useAuth();
  const params = useSearchParams();
  const [data, setData] = useState<MeResponse | null>(null);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [riverKey, setRiverKey] = useState(0);
  const [serverNow, setServerNow] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const t0 = Date.now();
      const res = await apiFetch<MeResponse>("/api/me");
      setOffset(Date.parse(res.serverTime) + (Date.now() - t0) / 2 - Date.now());
      setData(res);
      setServerNow(Date.parse(res.serverTime));
      setRiverKey((k) => k + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch once the session is known
    if (user) void load();
  }, [user, load]);

  useEffect(() => {
    if (params.get("linked")) toast.success("ยืนยันอีเมลเรียบร้อย โคมของคุณถูกบันทึกไว้ในบัญชีแล้ว");
    if (params.get("auth_error")) toast.error("ลิงก์ยืนยันไม่ถูกต้องหรือหมดอายุ");
  }, [params]);

  if (authLoading) return <Skeleton className="h-64" />;

  if (!user || !configured) {
    return (
      <Card className="mx-auto max-w-lg py-12 text-center">
        <Sparkles className="mx-auto mb-4 size-10 text-gold" />
        <h2 className="font-display text-2xl text-warm">ยังไม่มีโคมของคุณ</h2>
        <p className="mt-2 text-warm/60">เมื่อคุณปล่อยโคม โคมจะแสดงที่นี่ตลอดช่วงเซสชันของคุณ</p>
        <Button asChild className="mt-6">
          <Link href="/create">สร้างโคมดวงแรก</Link>
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      <AccountCard onChanged={load} />

      {riverKey > 0 && <MyRiver userId={user.id} reloadKey={riverKey} />}

      <section aria-labelledby="mine-title" className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 id="mine-title" className="font-display text-2xl text-warm">โคมของฉัน</h2>
          <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} /> รีเฟรช
          </Button>
        </div>
        {error && (
          <Card className="flex items-center gap-3 text-sm text-red-200">
            <AlertCircle className="size-5" /> {error}
          </Card>
        )}
        {!data && !error && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
        )}
        {data && data.lanterns.length === 0 && (
          <Card className="py-10 text-center text-warm/60">
            ยังไม่มีโคมในเซสชันนี้ ·{" "}
            <Link href="/create" className="text-gold underline">
              สร้างโคม
            </Link>
          </Card>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {data?.lanterns.map((l) => {
            const s = LANTERN_STATUS[l.status];
            const d = LANTERN_DESIGNS[l.design];
            return (
              <Card key={l.id} className="flex gap-4">
                <div
                  aria-hidden
                  className="h-16 w-14 shrink-0 rounded-md"
                  style={{ background: `radial-gradient(ellipse at 50% 100%, #fff4d6, ${l.color} 55%, ${d?.paper ?? "#e9c27a"})`, boxShadow: l.status === "active" ? `0 0 24px -2px ${l.color}` : "none", opacity: l.status === "active" ? 1 : 0.45 }}
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={s.variant}>{s.label}</Badge>
                    {l.offering > 0 && <span className="rounded-full bg-gold/90 px-2 py-0.5 text-xs font-semibold text-night">🪙 ฿{l.offering.toLocaleString("th-TH")}</span>}
                    {l.effects.length > 0 && <span className="text-xs text-warm/55">{l.effects.map((e) => EFFECT_META[e].emoji).join(" ")}</span>}
                    {!l.effects.length && !l.offering && l.packageName && <span className="text-xs text-warm/45">{l.packageName}</span>}
                  </div>
                  <p className="truncate text-warm">{l.displayName}</p>
                  {l.wishMessage && <p className="line-clamp-2 text-sm text-warm/60">{l.wishMessage}</p>}
                  <p className="text-xs text-warm/45">
                    {l.status === "active" && l.expiresAt ? <Remaining expiresAt={l.expiresAt} offset={offset} /> : formatDateTime(l.createdAt)}
                  </p>
                  {l.status === "active" && l.expiresAt && Date.parse(l.expiresAt) > serverNow && (
                    <Button asChild size="sm" variant="outline" className="mt-2">
                      <Link href={`/festival?focus=${l.id}`}>
                        <Eye /> ดูในเทศกาล
                      </Link>
                    </Button>
                  )}
                  {l.status === "pending_payment" && (
                    <p className="text-xs text-amber">ระบบจะปล่อยโคมอัตโนมัติเมื่อได้รับการยืนยันการชำระเงิน</p>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="pay-title" className="space-y-4">
        <h2 id="pay-title" className="flex items-center gap-2 font-display text-2xl text-warm">
          <Receipt className="size-6 text-gold" /> ประวัติการชำระเงิน
        </h2>
        {data && data.payments.length === 0 && <Card className="text-sm text-warm/55">ยังไม่มีรายการชำระเงิน</Card>}
        {data && data.payments.length > 0 && (
          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[540px] text-left text-sm">
              <thead className="text-xs text-warm/50">
                <tr className="border-b border-white/5">
                  <th className="px-5 py-3 font-normal">วันที่</th>
                  <th className="px-5 py-3 font-normal">แพ็กเกจ</th>
                  <th className="px-5 py-3 font-normal">ช่องทาง</th>
                  <th className="px-5 py-3 font-normal">ยอด</th>
                  <th className="px-5 py-3 font-normal">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((p) => (
                  <tr key={p.id} className="border-b border-white/5 last:border-0">
                    <td className="px-5 py-3 text-warm/70">{formatDateTime(p.createdAt)}</td>
                    <td className="px-5 py-3 text-warm">{p.packageName}</td>
                    <td className="px-5 py-3 capitalize text-warm/70">{p.paymentMethod ?? "—"}</td>
                    <td className="px-5 py-3 text-warm">{formatTHB(p.amount, p.currency)}</td>
                    <td className="px-5 py-3">
                      <Badge variant={PAYMENT_STATUS[p.paymentStatus].variant}>{PAYMENT_STATUS[p.paymentStatus].label}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>
    </div>
  );
}
