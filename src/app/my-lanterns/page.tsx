import { Suspense } from "react";
import type { Metadata } from "next";
import { PageShell } from "@/components/layout/page-shell";
import { MyLanternsView } from "@/components/account/my-lanterns-view";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({ title: "โคมของฉัน", description: "โคมอธิษฐานและประวัติการชำระเงินของคุณ", path: "/my-lanterns", noindex: true });

export default function MyLanternsPage() {
  return (
    <PageShell>
      <header className="mb-8">
        <p className="mb-2 text-sm tracking-[0.2em] text-gold">MY LANTERNS</p>
        <h1 className="font-display text-3xl font-light text-warm sm:text-4xl">โคมของฉัน</h1>
      </header>
      <Suspense>
        <MyLanternsView />
      </Suspense>
    </PageShell>
  );
}
