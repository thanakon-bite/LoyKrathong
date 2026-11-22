import Link from "next/link";
import { cn } from "@/lib/utils";

export function LanternMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-7", className)}>
      <defs>
        <radialGradient id="lm-glow" cx="50%" cy="80%" r="70%">
          <stop offset="0%" stopColor="#fff3cf" />
          <stop offset="55%" stopColor="#ffd27a" />
          <stop offset="100%" stopColor="#c9852a" />
        </radialGradient>
      </defs>
      <path d="M7 10 L16 7 L25 10 L25 25 L16 28 L7 25 Z" fill="url(#lm-glow)" />
      <path d="M16 13 L25 10 M16 13 L7 10 M16 13 L16 28" stroke="#9a5a12" strokeOpacity=".45" strokeWidth=".8" fill="none" />
      <path d="M4 26 L16 30 L28 26 L16 23 Z" fill="#5a3d22" />
      <circle cx="16" cy="22" r="1.6" fill="#fff" opacity=".9" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("group flex items-center gap-2.5", className)} aria-label="ลอยกระทงออนไลน์ หน้าแรก">
      <LanternMark className="transition-transform duration-500 group-hover:-translate-y-0.5" />
      <span className="font-display text-lg font-medium tracking-wide text-warm">
        ลอยกระทง<span className="text-gold">ออนไลน์</span>
      </span>
    </Link>
  );
}
