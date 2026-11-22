import type { Metadata } from "next";
import { publicEnv } from "@/lib/env";

export const SITE = {
  name: "ลอยกระทงออนไลน์",
  title: "ลอยกระทงออนไลน์ 2569 | สร้างโคมอธิษฐานและปล่อยคำอธิษฐานไปกับสายน้ำ",
  description:
    "ร่วมลอยกระทงออนไลน์ สร้างโคมอธิษฐานในแบบของคุณ เขียนคำอวยพร วาดรูป ใส่ภาพ และปล่อยโคมลอยไปบนสายน้ำ พร้อมชมโคมจากผู้คนทั่วโลกแบบ Real-time",
  keywords: [
    "ลอยกระทงออนไลน์",
    "ลอยกระทง 2569",
    "ลอยโคมออนไลน์",
    "เขียนคำอธิษฐาน",
    "Online Loy Krathong",
    "Floating Lantern Festival",
    "Online Wish Lantern",
  ],
  locale: "th_TH",
};

export const absoluteUrl = (path = "/") => `${publicEnv.appUrl}${path.startsWith("/") ? path : `/${path}`}`;

/** Per-page metadata with canonical URL + OG/Twitter */
export function pageMetadata(opts: { title: string; description: string; path: string; noindex?: boolean }): Metadata {
  return {
    title: opts.title,
    description: opts.description,
    alternates: { canonical: opts.path },
    openGraph: {
      title: opts.title,
      description: opts.description,
      url: opts.path,
      siteName: SITE.name,
      locale: SITE.locale,
      type: "website",
    },
    twitter: { card: "summary_large_image", title: opts.title, description: opts.description },
    robots: opts.noindex ? { index: false, follow: false } : undefined,
  };
}
