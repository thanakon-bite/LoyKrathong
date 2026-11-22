import { Suspense } from "react";
import type { Metadata } from "next";
import { PageShell } from "@/components/layout/page-shell";
import { PaymentCancel } from "@/components/checkout/payment-cancel";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({ title: "ยกเลิกการชำระเงิน", description: "ยกเลิกการชำระเงิน", path: "/payment/cancel", noindex: true });

export default function PaymentCancelPage() {
  return (
    <PageShell footer={false} className="flex items-center">
      <Suspense>
        <PaymentCancel />
      </Suspense>
    </PageShell>
  );
}
