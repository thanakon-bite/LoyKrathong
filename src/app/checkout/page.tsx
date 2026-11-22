import type { Metadata } from "next";
import { CheckoutView } from "@/components/checkout/checkout-view";
import { PageShell } from "@/components/layout/page-shell";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "ปล่อยโคมและชำระเงิน",
  description: "เลือกแพ็กเกจและปล่อยโคมอธิษฐานของคุณ",
  path: "/checkout",
  noindex: true,
});

export default function CheckoutPage() {
  return (
    <PageShell className="max-w-6xl" footer={false}>
      <header className="mb-8">
        <p className="mb-2 text-sm tracking-[0.2em] text-gold">RELEASE YOUR LANTERN</p>
        <h1 className="font-display text-3xl font-light text-warm sm:text-4xl">ปล่อยโคมอธิษฐาน</h1>
      </header>
      <CheckoutView />
    </PageShell>
  );
}
