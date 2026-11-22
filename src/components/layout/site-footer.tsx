import Link from "next/link";
import { Logo } from "./logo";

export function SiteFooter() {
  return (
    <footer className="relative border-t border-white/5 bg-night">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-4 py-8 sm:px-6 md:grid-cols-[2fr_1fr_1fr] md:gap-8 md:py-12">
        <div className="col-span-2 space-y-3 md:col-span-1">
          <Logo />
          <p className="hidden max-w-sm text-sm leading-relaxed text-warm/55 md:block">
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
        © {new Date().getFullYear()} ลอยกระทงออนไลน์<span className="hidden sm:inline"> · Floating Wishes Under the Golden Night</span>
      </p>
    </footer>
  );
}
