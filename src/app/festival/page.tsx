import { Suspense } from "react";
import type { Metadata } from "next";
import { FestivalView } from "@/components/festival/festival-view";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "เทศกาลลอยโคม – ชมโคมที่กำลังลอยแบบ Real-time",
  description: "ชมโคมอธิษฐานจากผู้คนทั่วโลกที่กำลังลอยอยู่บนผิวน้ำแบบ Real-time คลิกที่โคมเพื่ออ่านคำอธิษฐานและคำอวยพร",
  path: "/festival",
});

export default function FestivalPage() {
  return (
    <Suspense>
      <FestivalView />
    </Suspense>
  );
}
