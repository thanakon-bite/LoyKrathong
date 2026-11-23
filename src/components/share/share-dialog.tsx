"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Download, Eye, ImageIcon, Loader2, Music2, Share2 } from "lucide-react";
import { toast } from "sonner";
import type { PublicLantern } from "@/types/lantern";
import { canvasToBlob, renderPolaroid } from "@/lib/share/polaroid";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { lanternShareUrl, type ClipMusic } from "@/lib/share/clip-music";
import { ClipMusicPicker } from "./clip-music-picker";

interface Props {
  lantern: PublicLantern | null;
  onClose: () => void;
  /** Heading – "ปล่อยโคมสำเร็จ" right after release, otherwise a neutral title */
  justReleased?: boolean;
}

function InstagramIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden {...props}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function FacebookIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H7.8v3h2.6V21h3.1Z" />
    </svg>
  );
}

function LineIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M12 3C6.5 3 2 6.6 2 11c0 3.9 3.5 7.2 8.3 7.9.3.1.8.2.9.5.1.3.1.7 0 1l-.1.9c0 .3-.2 1 .9.5 1.1-.5 6-3.5 8.1-6 1.5-1.6 2-3.2 2-4.8C22 6.6 17.5 3 12 3Zm-3.6 10.5H6.4c-.3 0-.5-.2-.5-.5V9c0-.3.2-.5.5-.5s.5.2.5.5v3.5h1.5c.3 0 .5.2.5.5s-.2.5-.5.5Zm2 -.5c0 .3-.2.5-.5.5s-.5-.2-.5-.5V9c0-.3.2-.5.5-.5s.5.2.5.5v4Zm4.7 0c0 .2-.1.4-.3.5h-.2c-.2 0-.3-.1-.4-.2l-2-2.8V13c0 .3-.2.5-.5.5s-.5-.2-.5-.5V9c0-.2.1-.4.3-.5h.2c.2 0 .3.1.4.2l2 2.8V9c0-.3.2-.5.5-.5s.5.2.5.5v4Zm3.2-2.5c.3 0 .5.2.5.5s-.2.5-.5.5h-1.5v1h1.5c.3 0 .5.2.5.5s-.2.5-.5.5h-2c-.3 0-.5-.2-.5-.5V9c0-.3.2-.5.5-.5h2c.3 0 .5.2.5.5s-.2.5-.5.5h-1.5v1h1.5Z" />
    </svg>
  );
}

/**
 * Share sheet shown after releasing a lantern: a polaroid postcard (story size)
 * plus a deep link (/l/<id>) that opens the festival focused on this lantern.
 */
export function ShareDialog({ lantern, onClose, justReleased }: Props) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [rendering, setRendering] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<"postcard" | "music">("postcard");
  const [music, setMusic] = useState<ClipMusic | null>(null);

  // the festival replaces lantern objects on every realtime update / resync – only a different lantern
  // (by id) may reset the sheet, otherwise a picked song vanishes and the heavy postcard re-renders mid-use
  const lanternId = lantern?.id ?? null;
  const latestLantern = useRef(lantern);
  useEffect(() => {
    latestLantern.current = lantern;
  });

  const shareUrl = useMemo(
    () => (lanternId && typeof window !== "undefined" ? lanternShareUrl(window.location.origin, lanternId, mode === "music" ? music : null) : ""),
    [lanternId, mode, music],
  );
  const withMusic = mode === "music" && !!music;
  const shareText = lantern
    ? `ฉันปล่อยโคมอธิษฐานลอยกระทง 2569 แล้ว ✨ มาดูโคมของ ${lantern.displayName} ลอยอยู่บนสายน้ำ${withMusic ? " 🎵 เปิดเสียงด้วยนะ" : ""}`
    : "";

  useEffect(() => {
    const lantern = latestLantern.current;
    if (!lanternId || !lantern) return;
    let cancelled = false;
    let url: string | null = null;
    setRendering(true);
    renderPolaroid(lantern, { host: window.location.host })
      .then((canvas) => canvasToBlob(canvas))
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setImageUrl(url);
        setFile(new File([blob], `loykrathong-${lantern.id.slice(0, 8)}.png`, { type: "image/png" }));
      })
      .catch(() => toast.error("สร้างโปสการ์ดไม่สำเร็จ แต่ยังแชร์ลิงก์ได้"))
      .finally(() => !cancelled && setRendering(false));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
      setImageUrl(null);
      setFile(null);
      setCopied(false);
      setMode("postcard");
      setMusic(null);
    };
  }, [lanternId]);

  const canShareFile = typeof navigator !== "undefined" && !!file && !!navigator.canShare?.({ files: [file] });

  const download = () => {
    if (!imageUrl || !file) return;
    const a = document.createElement("a");
    a.href = imageUrl;
    a.download = file.name;
    a.click();
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("คัดลอกลิงก์แล้ว");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("คัดลอกไม่สำเร็จ");
    }
  };

  /** Instagram has no web share URL – stories are shared as an image via the system share sheet */
  const shareInstagram = async () => {
    if (!file) return;
    if (canShareFile) {
      try {
        await navigator.share({ files: [file], title: "โคมอธิษฐานของฉัน", text: `${shareText}\n${shareUrl}` });
        void navigator.clipboard?.writeText(shareUrl).catch(() => undefined);
        toast.info("เลือก Instagram → Story แล้วเพิ่มสติกเกอร์ลิงก์ (คัดลอกลิงก์ไว้ให้แล้ว)");
      } catch {
        /* user cancelled */
      }
    } else {
      download();
      void navigator.clipboard?.writeText(shareUrl).catch(() => undefined);
      toast.info("บันทึกรูปแล้ว เปิด Instagram บนมือถือ → Story → เลือกรูปนี้ แล้วเพิ่มสติกเกอร์ลิงก์ (คัดลอกลิงก์ไว้ให้แล้ว)", { duration: 7000 });
    }
  };

  const shareNative = async () => {
    try {
      await navigator.share(file && canShareFile ? { files: [file], text: `${shareText}\n${shareUrl}` } : { title: "โคมอธิษฐานของฉัน", text: shareText, url: shareUrl });
    } catch {
      /* cancelled */
    }
  };

  const open = (url: string) => window.open(url, "_blank", "noopener,noreferrer,width=640,height=720");
  const enc = encodeURIComponent;

  return (
    <Dialog open={!!lantern} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[94dvh] max-w-md gap-3 overflow-y-auto p-4 sm:p-6">
        <DialogHeader className="pr-8">
          <DialogTitle>{justReleased ? "ปล่อยโคมสำเร็จแล้ว ✨" : "แชร์โคมดวงนี้"}</DialogTitle>
          <DialogDescription>
            {mode === "music" ? "แนบเพลงจาก YouTube 15 วินาที เพื่อนเปิดลิงก์แล้วเห็นกระทงของคุณลอยใต้แสงจันทร์พร้อมเพลง" : "ส่งโปสการ์ดให้เพื่อน แตะลิงก์แล้วเจอโคมของคุณทันที"}
          </DialogDescription>
        </DialogHeader>

        <div role="tablist" aria-label="รูปแบบการแชร์" className="grid grid-cols-2 gap-1 rounded-full bg-white/5 p-1">
          {(
            [
              ["postcard", ImageIcon, "โปสการ์ด"],
              ["music", Music2, "แนบเพลง"],
            ] as const
          ).map(([m, Icon, label]) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={cn("flex items-center justify-center gap-1.5 rounded-full py-1.5 text-sm transition", mode === m ? "bg-gold text-night" : "text-warm/65 hover:text-warm")}
            >
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </div>

        {mode === "music" && <ClipMusicPicker value={music} onChange={setMusic} />}
        {withMusic && (
          <a
            href={shareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 rounded-full border border-gold/30 py-2 text-xs text-gold transition hover:bg-gold/10"
          >
            <Eye className="size-3.5" /> ดูตัวอย่างหน้าที่เพื่อนจะเห็น
          </a>
        )}

        <div className={cn("relative mx-auto aspect-[9/16] h-[46dvh] max-h-[460px] overflow-hidden rounded-2xl bg-white/5", mode === "music" && "hidden")}>
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- local blob URL
            <img src={imageUrl} alt="โปสการ์ดโคมอธิษฐาน" className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full place-items-center text-sm text-warm/50">
              {rendering ? <Loader2 className="size-6 animate-spin text-gold" /> : "—"}
            </div>
          )}
        </div>

        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "Story", icon: InstagramIcon, onClick: shareInstagram, cls: "from-[#f58529] via-[#dd2a7b] to-[#8134af] text-white", disabled: !file },
            { label: "Facebook", icon: FacebookIcon, onClick: () => open(`https://www.facebook.com/sharer/sharer.php?u=${enc(shareUrl)}`), cls: "from-[#1877f2] to-[#1877f2] text-white" },
            { label: "LINE", icon: LineIcon, onClick: () => open(`https://line.me/R/share?text=${enc(`${shareText}\n${shareUrl}`)}`), cls: "from-[#06c755] to-[#06c755] text-white" },
            { label: copied ? "คัดลอกแล้ว" : "ลิงก์", icon: copied ? Check : Copy, onClick: copyLink, cls: "from-white/10 to-white/10 text-warm" },
          ].map(({ label, icon: Icon, onClick, cls, disabled }) => (
            <button
              key={label}
              type="button"
              onClick={onClick}
              disabled={disabled}
              className="flex flex-col items-center gap-1.5 rounded-xl py-1 text-[11px] text-warm/75 transition hover:text-warm disabled:opacity-40"
            >
              <span className={cn("grid size-11 place-items-center rounded-full bg-gradient-to-br shadow-lg", cls)}>
                <Icon className="size-5" />
              </span>
              {label}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={download} disabled={!file}>
            <Download /> บันทึกรูป
          </Button>
          {typeof navigator !== "undefined" && "share" in navigator && (
            <Button className="flex-1" onClick={shareNative}>
              <Share2 /> แชร์อื่น ๆ
            </Button>
          )}
        </div>
        <p className="text-center text-[11px] text-warm/40">
          {withMusic ? "Story จะใช้รูปโปสการ์ด + สติกเกอร์ลิงก์ (มีเพลง) · " : ""}ลิงก์เปิดดูโคมได้ 7 วัน ตลอดเวลาที่โคมยังลอยอยู่
        </p>
      </DialogContent>
    </Dialog>
  );
}
