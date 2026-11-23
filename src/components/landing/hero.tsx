"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronDown, Sparkles, Waves } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DecorativeScene } from "@/components/scene/decorative-scene";

const fadeUp = {
  hidden: { opacity: 0, y: 24, filter: "blur(6px)" },
  show: (i: number) => ({ opacity: 1, y: 0, filter: "blur(0px)", transition: { delay: 0.25 + i * 0.18, duration: 1.1, ease: [0.22, 1, 0.36, 1] as const } }),
};

export function Hero() {
  return (
    <section className="relative isolate h-[100svh] min-h-[600px] w-full overflow-hidden" aria-labelledby="hero-title">
      <div className="absolute inset-0 -z-10">
        <DecorativeScene />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_35%,rgba(5,9,19,0.15),rgba(5,9,19,0.55)_60%,rgba(5,9,19,0.9))]" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-night to-transparent" />
      </div>

      <div className="mx-auto flex h-full max-w-5xl flex-col items-center justify-center px-5 pb-16 text-center">
        <motion.p
          custom={0}
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="mb-5 inline-flex items-center gap-2 rounded-full border border-gold/30 bg-night/40 px-4 py-1.5 text-xs tracking-[0.2em] text-amber backdrop-blur-md sm:text-sm"
        >
          <Sparkles className="size-3.5" /> ลอยกระทงออนไลน์ 2569<span className="hidden sm:inline"> · คืนวันเพ็ญเดือนสิบสอง</span>
        </motion.p>
        <motion.h1
          id="hero-title"
          custom={1}
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="font-display text-[2.1rem] font-light leading-tight text-warm text-glow sm:text-6xl md:text-7xl"
        >
          ส่งคำอธิษฐานของคุณ
          <br />
          <span className="gold-gradient-text font-normal">ให้ลอยไปกับแสงแห่งความหวัง</span>
        </motion.h1>
        <motion.p custom={2} variants={fadeUp} initial="hidden" animate="show" className="mt-5 max-w-2xl text-base leading-relaxed text-warm/75 sm:mt-6 sm:text-lg">
          <span className="sm:hidden">เขียนคำอธิษฐานบนโคม แล้วปล่อยลอยไปพร้อมผู้คนทั่วโลก</span>
          <span className="hidden sm:inline">
            สร้างโคมกระดาษอธิษฐานในแบบของคุณ เขียนคำอวยพร วาดภาพ ใส่รูปที่มีความหมาย แล้วปล่อยลงบนผิวน้ำ
            ลอยเคียงข้างโคมของผู้คนทั่วโลกแบบเรียลไทม์
          </span>
        </motion.p>
        <motion.div custom={3} variants={fadeUp} initial="hidden" animate="show" className="mt-10 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link href="/create">
              <Sparkles /> สร้างโคมอธิษฐาน
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
            <Link href="/festival">
              <Waves /> เข้าสู่เทศกาล
            </Link>
          </Button>
        </motion.div>
      </div>

      <a href="#stats" aria-label="เลื่อนลง" className="absolute bottom-[calc(1.5rem+var(--nf-badge))] left-1/2 -translate-x-1/2 animate-float text-warm/50 hover:text-gold">
        <ChevronDown className="size-7" />
      </a>
    </section>
  );
}
