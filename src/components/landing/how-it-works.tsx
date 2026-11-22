import Link from "next/link";
import { Brush, Send, Waves } from "lucide-react";
import { Button } from "@/components/ui/button";

const STEPS = [
  { icon: Brush, title: "ออกแบบโคมของคุณ", body: "เลือกโคมกระดาษทรงสี่เหลี่ยม เขียนคำอธิษฐาน วาดภาพด้วยลายมือ หรือใส่รูปที่มีความหมาย ทุกอย่างปรากฏบนผิวโคมจริงแบบเรียลไทม์" },
  { icon: Send, title: "ปล่อยโคมลงสายน้ำ", body: "แสงเทียนภายในค่อย ๆ สว่างขึ้น โคมของคุณลอยออกจากฝั่งไปบนผิวน้ำ พร้อมเงาสะท้อนสีทองอันอบอุ่น" },
  { icon: Waves, title: "ลอยไปพร้อมผู้คนทั่วโลก", body: "มองเห็นโคมของผู้อื่นที่เพิ่งปล่อยทันที คลิกเพื่ออ่านคำอธิษฐาน โคมแต่ละดวงจะลอยอยู่ 7 วันก่อนจางหายไปกับสายน้ำ" },
];

export function HowItWorks() {
  return (
    <section aria-labelledby="how-title" className="relative mx-auto max-w-6xl px-4 pb-16 sm:px-6 sm:pb-24">
      <div className="mb-6 text-center sm:mb-12">
        <p className="mb-3 hidden text-sm tracking-[0.25em] text-gold sm:block">FLOATING WISHES UNDER THE GOLDEN NIGHT</p>
        <h2 id="how-title" className="font-display text-2xl font-light text-warm sm:text-4xl">3 ขั้นตอนง่าย ๆ</h2>
      </div>
      <ol className="grid gap-3 md:grid-cols-3 md:gap-5">
        {STEPS.map(({ icon: Icon, title, body }, i) => (
          <li
            key={title}
            className="relative flex items-center gap-4 rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-transparent p-4 md:block md:rounded-3xl md:p-7"
          >
            <span className="absolute right-6 top-5 hidden font-display text-5xl font-light text-white/5 md:block">0{i + 1}</span>
            <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gold/10 text-gold shadow-[0_0_30px_-8px_rgba(245,185,66,0.7)] md:mb-5 md:size-12">
              <Icon className="size-5 md:size-6" />
            </div>
            <h3 className="font-display text-lg text-warm md:mb-2 md:text-xl">
              <span className="mr-1 text-gold md:hidden">{i + 1}.</span>
              {title}
            </h3>
            <p className="hidden text-sm leading-relaxed text-warm/60 md:block">{body}</p>
          </li>
        ))}
      </ol>
      <div className="mt-8 flex justify-center sm:mt-14">
        <Button asChild size="lg">
          <Link href="/create">เริ่มสร้างโคมอธิษฐาน</Link>
        </Button>
      </div>
    </section>
  );
}
