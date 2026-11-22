import Link from "next/link";
import { Logo } from "./logo";

export function SiteFooter() {
  return (
    <footer className="relative border-t border-white/5 bg-night">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[2fr_1fr_1fr]">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-sm text-sm leading-relaxed text-warm/55">
            ส่งคำอธิษฐานของคุณให้ลอยไปกับแสงแห่งความหวัง ร่วมปล่อยโคมอธิษฐานออนไลน์กับผู้คนทั่วโลกในคืนวันเพ็ญเดือนสิบสอง
          </p>
        </div>
        <div>
          <h2 className="mb-3 text-sm font-medium text-warm">เทศกาล</h2>
          <ul className="space-y-2 text-sm text-warm/55">
            <li><Link className="hover:text-gold" href="/create">สร้างโคมอธิษฐาน</Link></li>
            <li><Link className="hover:text-gold" href="/festival">ชมโคมที่กำลังลอย</Link></li>
            <li><Link className="hover:text-gold" href="/my-lanterns">โคมของฉัน</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="mb-3 text-sm font-medium text-warm">ข้อมูล</h2>
          <ul className="space-y-2 text-sm text-warm/55">
            <li><Link className="hover:text-gold" href="/about">เกี่ยวกับเทศกาล</Link></li>
            <li><Link className="hover:text-gold" href="/privacy">นโยบายความเป็นส่วนตัว</Link></li>
            <li><Link className="hover:text-gold" href="/terms">ข้อกำหนดการใช้งาน</Link></li>
          </ul>
        </div>
      </div>
      <p className="border-t border-white/5 py-5 text-center text-xs text-warm/35">
        © {new Date().getFullYear()} ลอยกระทงออนไลน์ · Floating Wishes Under the Golden Night
      </p>
    </footer>
  );
}
