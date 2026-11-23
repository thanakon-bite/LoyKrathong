import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Sparkles } from "lucide-react";
import { FestivalView } from "@/components/festival/festival-view";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { isSupabaseConfigured } from "@/lib/env";
import { uuidSchema } from "@/lib/security/validation";
import { getActiveLantern } from "@/services/lantern-service";
import { parseClipParams } from "@/lib/share/clip-music";
import { SharedLanternScene } from "@/components/share/shared-lantern-scene";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };
type PageProps = Params & { searchParams: Promise<Record<string, string | string[] | undefined>> };

async function load(id: string) {
  if (!uuidSchema.safeParse(id).success) return undefined;
  if (!isSupabaseConfigured()) return null;
  return getActiveLantern(id).catch(() => null);
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const lantern = await load(id);
  const title = lantern ? `โคมอธิษฐานของ ${lantern.displayName}` : "โคมอธิษฐาน | ลอยกระทงออนไลน์";
  const description = lantern?.wishMessage
    ? `“${lantern.wishMessage.slice(0, 120)}” — มาดูโคมที่กำลังลอยอยู่บนสายน้ำ และปล่อยโคมของคุณเอง`
    : "มาดูโคมอธิษฐานที่กำลังลอยอยู่บนสายน้ำ และปล่อยโคมของคุณเอง ลอยกระทงออนไลน์ 2569";
  return {
    title,
    description,
    alternates: { canonical: `/l/${id}` },
    openGraph: { title, description, url: `/l/${id}`, type: "website", locale: "th_TH", siteName: "ลอยกระทงออนไลน์" },
    twitter: { card: "summary_large_image", title, description },
    // shared lanterns are personal and short-lived – keep them out of search results
    robots: { index: false, follow: true },
  };
}

/** Deep link from a shared postcard (festival focused on this lantern) or a song link (moonlit scene) */
export default async function SharedLanternPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const query = await searchParams;
  const music = parseClipParams((k) => {
    const v = query[k];
    return Array.isArray(v) ? v[0] : v;
  });
  const lantern = await load(id);
  if (lantern === undefined) notFound();

  if (!lantern) {
    return (
      <PageShell footer={false} className="grid place-items-center text-center">
        <div className="max-w-sm">
          <Sparkles className="mx-auto mb-4 size-10 text-gold" />
          <h1 className="font-display text-2xl text-warm">โคมดวงนี้ลอยหายไปกับสายน้ำแล้ว</h1>
          <p className="mt-2 text-warm/60">โคมแต่ละดวงลอยอยู่ 7 วัน แต่คุณยังส่งคำอธิษฐานของคุณเองได้นะ</p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button asChild>
              <Link href="/create">ปล่อยโคมของฉัน</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/festival">ดูโคมที่กำลังลอย</Link>
            </Button>
          </div>
        </div>
      </PageShell>
    );
  }

  // "แนบเพลง" link: a dedicated moonlit scene with only this krathong and the owner's song
  if (music) return <SharedLanternScene lantern={lantern} music={music} />;

  return (
    <Suspense>
      <FestivalView initialFocusId={lantern.id} />
    </Suspense>
  );
}
