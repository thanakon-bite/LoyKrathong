"use client";

import { motion, useInView, useMotionValue, animate } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Flame, HeartHandshake, ScrollText, Waves } from "lucide-react";
import { useFestivalStats } from "@/hooks/use-festival-stats";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/utils";

function Counter({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const mv = useMotionValue(0);
  const [display, setDisplay] = useState("0");
  useEffect(() => mv.on("change", (v) => setDisplay(formatNumber(Math.round(v)))), [mv]);
  useEffect(() => {
    if (!inView) return;
    const controls = animate(mv, value, { duration: 1.6, ease: "easeOut" });
    return () => controls.stop();
  }, [inView, value, mv]);
  return <span ref={ref}>{display}</span>;
}

export function FestivalStats() {
  const { stats, loading, error } = useFestivalStats();
  const items = [
    { icon: Flame, label: "โคมที่ถูกปล่อยทั้งหมด", value: stats?.totalLanterns },
    { icon: HeartHandshake, label: "ผู้ร่วมกิจกรรม", value: stats?.totalParticipants },
    { icon: ScrollText, label: "คำอธิษฐาน", value: stats?.totalWishes },
    { icon: Waves, label: "กำลังลอยอยู่ตอนนี้", value: stats?.activeLanterns, live: true },
  ];

  return (
    <section id="stats" aria-labelledby="stats-title" className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <h2 id="stats-title" className="sr-only">สถิติเทศกาล</h2>
      <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
        {items.map(({ icon: Icon, label, value, live }, i) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1, duration: 0.7 }}
            className="group relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl sm:p-7"
          >
            <div className="absolute -right-8 -top-8 size-28 rounded-full bg-gold/10 blur-2xl transition group-hover:bg-gold/20" />
            <Icon className="mb-4 size-6 text-gold" />
            <div className="font-display text-3xl font-light text-warm sm:text-4xl">
              {loading ? <Skeleton className="h-9 w-24" /> : value == null ? "—" : <Counter value={value} />}
            </div>
            <p className="mt-2 flex items-center gap-2 text-sm text-warm/60">
              {live && <span className="size-2 animate-pulse rounded-full bg-emerald-400" aria-hidden />}
              {label}
            </p>
          </motion.div>
        ))}
      </div>
      {error && <p className="mt-4 text-center text-sm text-warm/45">ไม่สามารถโหลดสถิติได้ในขณะนี้</p>}
    </section>
  );
}
