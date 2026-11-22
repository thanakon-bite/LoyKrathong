import type { Metadata } from "next";
import { Studio } from "@/components/studio/studio";
import { PageShell } from "@/components/layout/page-shell";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "สร้างโคมอธิษฐาน",
  description: "ออกแบบโคมกระดาษอธิษฐานทรงสี่เหลี่ยมของคุณ เขียนคำอธิษฐาน คำอวยพร วาดภาพ และใส่รูปภาพ พร้อมดูตัวอย่างแบบสดก่อนปล่อยลงสายน้ำ",
  path: "/create",
});

export default function CreatePage() {
  return (
    <PageShell className="max-w-7xl pb-32 lg:pb-24" footer={false}>
      <header className="mb-8">
        <p className="mb-2 text-sm tracking-[0.2em] text-gold">LANTERN STUDIO</p>
        <h1 className="font-display text-3xl font-light text-warm sm:text-4xl">สร้างโคมอธิษฐาน</h1>
        <p className="mt-2 max-w-2xl text-warm/60">ทุกตัวอักษรและลายเส้นของคุณจะปรากฏบนผิวกระดาษของโคมจริง ภายใต้แสงเทียนสีทอง</p>
      </header>
      <Studio />
    </PageShell>
  );
}
