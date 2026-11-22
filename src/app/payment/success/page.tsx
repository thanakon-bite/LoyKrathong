import { Suspense } from "react";
import type { Metadata } from "next";
import { PageShell } from "@/components/layout/page-shell";
import { PaymentSuccess } from "@/components/checkout/payment-success";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({ title: "ชำระเงินสำเร็จ", description: "ยืนยันการชำระเงิน", path: "/payment/success", noindex: true });

export default function PaymentSuccessPage() {
  return (
    <PageShell footer={false} className="flex items-center">
      <Suspense>
        <PaymentSuccess />
      </Suspense>
    </PageShell>
  );
}
