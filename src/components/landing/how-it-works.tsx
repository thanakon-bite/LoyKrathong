import Link from "next/link";
import { Brush, Send, Waves } from "lucide-react";
import { Button } from "@/components/ui/button";

const STEPS = [
  { icon: Brush, title: "ออกแบบโคมของคุณ", body: "เลือกโคมกระดาษทรงสี่เหลี่ยม เขียนคำอธิษฐาน วาดภาพด้วยลายมือ หรือใส่รูปที่มีความหมาย ทุกอย่างปรากฏบนผิวโคมจริงแบบเรียลไทม์" },
  { icon: Send, title: "ปล่อยโคมลงสายน้ำ", body: "แสงเทียนภายในค่อย ๆ สว่างขึ้น โคมของคุณลอยออกจากฝั่งไปบนผิวน้ำ พร้อมเงาสะท้อนสีทองอันอบอุ่น" },
  { icon: Waves, title: "ลอยไปพร้อมผู้คนทั่วโลก", body: "มองเห็นโคมของผู้อื่นที่เพิ่งปล่อยทันที คลิกเพื่ออ่านคำอธิษฐาน โคมแต่ละดวงจะลอยอยู่ 30 นาทีก่อนจางหายไปกับสายน้ำ" },
];

export function HowItWorks() {
  return (
    <section aria-labelledby="how-title" className="relative mx-auto max-w-6xl px-4 pb-24 sm:px-6">
      <div className="mb-12 text-center">
        <p className="mb-3 text-sm tracking-[0.25em] text-gold">FLOATING WISHES UNDER THE GOLDEN NIGHT</p>
        <h2 id="how-title" className="font-display text-3xl font-light text-warm sm:text-4xl">สามขั้นตอนสู่แสงแห่งความหวัง</h2>
      </div>
      <ol className="grid gap-5 md:grid-cols-3">
        {STEPS.map(({ icon: Icon, title, body }, i) => (
          <li key={title} className="relative rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-transparent p-7">
            <span className="absolute right-6 top-5 font-display text-5xl font-light text-white/5">0{i + 1}</span>
            <div className="mb-5 grid size-12 place-items-center rounded-2xl bg-gold/10 text-gold shadow-[0_0_30px_-8px_rgba(245,185,66,0.7)]">
              <Icon className="size-6" />
            </div>
            <h3 className="mb-2 font-display text-xl text-warm">{title}</h3>
            <p className="text-sm leading-relaxed text-warm/60">{body}</p>
          </li>
        ))}
      </ol>
      <div className="mt-14 flex justify-center">
        <Button asChild size="lg">
          <Link href="/create">เริ่มสร้างโคมอธิษฐาน</Link>
        </Button>
      </div>
    </section>
  );
}
