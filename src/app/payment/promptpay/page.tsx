import { Suspense } from "react";
import type { Metadata } from "next";
import { PageShell } from "@/components/layout/page-shell";
import { PromptPayPayment } from "@/components/checkout/promptpay-payment";
import { Skeleton } from "@/components/ui/skeleton";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({ title: "สแกนจ่ายพร้อมเพย์", description: "ชำระเงินด้วย QR พร้อมเพย์และแนบสลิป", path: "/payment/promptpay", noindex: true });

export default function PromptPayPage() {
  return (
    <PageShell footer={false} className="max-w-md pt-20 sm:pt-24">
      <h1 className="mb-3 font-display text-xl font-light text-warm sm:text-2xl">สแกนจ่ายด้วยพร้อมเพย์</h1>
      <Suspense fallback={<Skeleton className="h-[75svh] rounded-3xl" />}>
        <PromptPayPayment />
      </Suspense>
    </PageShell>
  );
}
