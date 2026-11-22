import Link from "next/link";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <PageShell footer={false} className="grid place-items-center text-center">
      <div>
        <p className="font-display text-7xl font-light text-gold text-glow">404</p>
        <h1 className="mt-4 font-display text-2xl text-warm">หน้านี้ลอยหายไปกับสายน้ำแล้ว</h1>
        <p className="mt-2 text-warm/60">ไม่พบหน้าที่คุณกำลังค้นหา</p>
        <Button asChild className="mt-6">
          <Link href="/">กลับหน้าแรก</Link>
        </Button>
      </div>
    </PageShell>
  );
}
