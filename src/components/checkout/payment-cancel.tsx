"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2, Undo2 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useLanternDraft } from "@/hooks/use-lantern-draft";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function PaymentCancel() {
  const paymentId = useSearchParams().get("payment_id");
  const { renewRequestId } = useLanternDraft();
  const [state, setState] = useState<"working" | "cancelled" | "paid" | "error">(paymentId ? "working" : "cancelled");

  useEffect(() => {
    if (!paymentId) return;
    apiFetch<{ status: string }>("/api/checkout/cancel", { method: "POST", json: { paymentId } })
      .then(({ status }) => {
        if (status === "paid") setState("paid");
        else {
          renewRequestId();
          setState("cancelled");
        }
      })
      .catch(() => setState("error"));
  }, [paymentId, renewRequestId]);

  return (
    <Card className="mx-auto max-w-lg py-12 text-center">
      {state === "working" ? (
        <Loader2 className="mx-auto mb-5 size-12 animate-spin text-gold" />
      ) : (
        <Undo2 className="mx-auto mb-5 size-12 text-amber" />
      )}
      <h1 className="font-display text-2xl text-warm">
        {state === "paid" ? "รายการนี้ชำระเงินแล้ว" : state === "error" ? "ยกเลิกรายการไม่สำเร็จ" : "ยกเลิกการชำระเงินแล้ว"}
      </h1>
      <p className="mt-2 text-warm/60">
        {state === "paid"
          ? "โคมของคุณถูกปล่อยเรียบร้อยแล้ว"
          : state === "error"
            ? "เกิดข้อผิดพลาดระหว่างยกเลิก รายการที่ไม่ชำระจะหมดอายุอัตโนมัติภายใน 30 นาที และไม่มีการเรียกเก็บเงิน"
            : "ไม่มีการเรียกเก็บเงิน โคมที่คุณออกแบบไว้ยังอยู่ สามารถแก้ไขหรือเลือกแพ็กเกจอื่นได้"}
      </p>
      <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
        {state === "paid" ? (
          <Button asChild>
            <Link href="/my-lanterns">ดูโคมของฉัน</Link>
          </Button>
        ) : (
          <>
            <Button asChild variant="outline">
              <Link href="/create">กลับไปแก้ไขโคม</Link>
            </Button>
            <Button asChild>
              <Link href="/checkout">เลือกแพ็กเกจอีกครั้ง</Link>
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}
