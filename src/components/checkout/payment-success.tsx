"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useLanternDraft } from "@/hooks/use-lantern-draft";
import type { CheckoutStatus } from "@/types/payment";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type View = "verifying" | "paid" | "failed" | "timeout" | "invalid";

/**
 * Never trusts the redirect itself: polls our backend, which only marks the payment
 * as paid after the verified Stripe webhook.
 */
export function PaymentSuccess() {
  const params = useSearchParams();
  const router = useRouter();
  const sessionId = params.get("session_id");
  const { reset } = useLanternDraft();
  const [view, setView] = useState<View>(sessionId ? "verifying" : "invalid");
  const [status, setStatus] = useState<CheckoutStatus | null>(null);
  const resetDone = useRef(false);

  useEffect(() => {
    if (!sessionId) return;
    let stopped = false;
    let tries = 0;
    const poll = async () => {
      tries++;
      try {
        const { status } = await apiFetch<{ status: CheckoutStatus }>(`/api/checkout/status?session_id=${encodeURIComponent(sessionId)}`);
        if (stopped) return;
        setStatus(status);
        if (status.paymentStatus === "paid" && status.lanternStatus === "active") {
          setView("paid");
          if (!resetDone.current) {
            resetDone.current = true;
            reset();
          }
          setTimeout(() => router.push(`/festival?released=${status.lanternId}`), 1500);
          return;
        }
        if (["failed", "cancelled", "expired"].includes(status.paymentStatus)) {
          setView("failed");
          return;
        }
      } catch {
        /* keep polling */
      }
      if (tries >= 45) setView("timeout");
      else setTimeout(poll, tries < 10 ? 1500 : 3000);
    };
    void poll();
    return () => {
      stopped = true;
    };
  }, [sessionId, reset, router]);

  return (
    <Card className="mx-auto max-w-lg py-12 text-center">
      {view === "verifying" && (
        <>
          <Loader2 className="mx-auto mb-5 size-12 animate-spin text-gold" />
          <h1 className="font-display text-2xl text-warm">กำลังยืนยันการชำระเงิน</h1>
          <p className="mt-2 text-warm/60">ระบบกำลังรอการยืนยันจาก Stripe โดยปกติใช้เวลาไม่กี่วินาที กรุณาอย่าปิดหน้านี้</p>
        </>
      )}
      {view === "paid" && (
        <>
          <CheckCircle2 className="mx-auto mb-5 size-14 text-emerald-300" />
          <h1 className="font-display text-2xl text-warm">ชำระเงินสำเร็จ</h1>
          <p className="mt-2 text-warm/60">โคมของคุณถูกปล่อยลงสายน้ำแล้ว กำลังพาไปชมโคมของคุณ…</p>
          <Button asChild className="mt-6">
            <Link href={`/festival?released=${status?.lanternId ?? ""}`}>ไปชมโคมของฉัน</Link>
          </Button>
        </>
      )}
      {view === "failed" && (
        <>
          <XCircle className="mx-auto mb-5 size-14 text-red-300" />
          <h1 className="font-display text-2xl text-warm">การชำระเงินไม่สำเร็จ</h1>
          <p className="mt-2 text-warm/60">ยังไม่มีการเรียกเก็บเงิน คุณสามารถลองชำระใหม่ได้ โคมที่ออกแบบไว้ยังอยู่</p>
          <Button asChild className="mt-6">
            <Link href="/checkout">ลองอีกครั้ง</Link>
          </Button>
        </>
      )}
      {view === "timeout" && (
        <>
          <Clock className="mx-auto mb-5 size-14 text-amber" />
          <h1 className="font-display text-2xl text-warm">ยังไม่ได้รับการยืนยัน</h1>
          <p className="mt-2 text-warm/60">การชำระเงินบางช่องทางอาจใช้เวลานานขึ้น โคมจะถูกปล่อยอัตโนมัติเมื่อระบบได้รับการยืนยัน ตรวจสอบสถานะได้ที่ “โคมของฉัน”</p>
          <Button asChild className="mt-6">
            <Link href="/my-lanterns">ไปที่โคมของฉัน</Link>
          </Button>
        </>
      )}
      {view === "invalid" && (
        <>
          <XCircle className="mx-auto mb-5 size-14 text-warm/40" />
          <h1 className="font-display text-2xl text-warm">ไม่พบรายการชำระเงิน</h1>
          <Button asChild className="mt-6">
            <Link href="/">กลับหน้าแรก</Link>
          </Button>
        </>
      )}
    </Card>
  );
}
