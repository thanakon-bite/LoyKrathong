"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, Sparkles, X } from "lucide-react";
import { Logo } from "./logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/festival", label: "เข้าสู่เทศกาล" },
  { href: "/my-lanterns", label: "โคมของฉัน" },
  { href: "/about", label: "เกี่ยวกับเทศกาล" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (pathname.startsWith("/admin")) return null;
  const overlay = pathname === "/festival";

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-40 transition-all duration-500",
        scrolled || open ? "bg-night/70 backdrop-blur-xl border-b border-white/5" : "bg-gradient-to-b from-night/70 to-transparent",
        overlay && "bg-gradient-to-b from-night/80 to-transparent border-none backdrop-blur-0",
      )}
    >
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6" aria-label="เมนูหลัก">
        <Logo />
        <div className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-full px-4 py-2 text-sm text-warm/70 transition hover:text-warm",
                pathname === item.href && "text-gold",
              )}
            >
              {item.label}
            </Link>
          ))}
          <Button asChild size="sm" className="ml-2">
            <Link href="/create">สร้างโคมอธิษฐาน</Link>
          </Button>
        </div>
        {pathname !== "/festival" && (
          <Link
            href="/festival"
            className="ml-auto mr-1 flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/15 px-3 py-1.5 text-xs font-medium text-gold shadow-[0_0_18px_-6px_rgba(245,185,66,0.8)] md:hidden"
          >
            <Sparkles className="size-3.5" /> เทศกาล
          </Link>
        )}
        <button
          type="button"
          className="rounded-full p-2 text-warm md:hidden"
          aria-label={open ? "ปิดเมนู" : "เปิดเมนู"}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <X className="size-6" /> : <Menu className="size-6" />}
        </button>
      </nav>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-white/5 md:hidden"
          >
            <div className="flex flex-col gap-1 px-4 pb-5 pt-2">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn("rounded-2xl px-4 py-3 text-base text-warm/80", pathname === item.href && "bg-white/5 text-gold")}
                >
                  {item.label}
                </Link>
              ))}
              <Button asChild size="lg" className="mt-2">
                <Link href="/create" onClick={() => setOpen(false)}>
                  สร้างโคมอธิษฐาน
                </Link>
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
