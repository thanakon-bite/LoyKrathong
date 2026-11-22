import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isSupabaseConfigured } from "@/lib/env";
import { uuidSchema } from "@/lib/security/validation";
import { getActiveLantern } from "@/services/lantern-service";

export const alt = "โปสการ์ดโคมอธิษฐาน ลอยกระทงออนไลน์";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Satori can't break Thai lines on its own – insert zero-width spaces between words */
function breakable(text: string) {
  const seg = new Intl.Segmenter("th", { granularity: "word" });
  return Array.from(seg.segment(text), (s) => s.segment).join("​");
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lantern = uuidSchema.safeParse(id).success && isSupabaseConfigured() ? await getActiveLantern(id).catch(() => null) : null;
  const dir = join(process.cwd(), "src/assets/fonts");
  const [kanitThai, kanitLatin, handThai, handLatin] = await Promise.all([
    readFile(join(dir, "kanit-thai-400-normal.woff")),
    readFile(join(dir, "kanit-latin-400-normal.woff")),
    readFile(join(dir, "sriracha-thai-400-normal.woff")),
    readFile(join(dir, "sriracha-latin-400-normal.woff")),
  ]);
  const wish = lantern?.wishMessage || lantern?.blessingMessage || "ขอให้ทุกคำอธิษฐานเป็นจริง";
  const name = lantern?.displayName ?? "ลอยกระทงออนไลน์";
  const light = lantern?.color ?? "#F5B942";
  const offering = lantern?.offering ?? 0;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0b1230 0%, #1a1838 60%, #2a1a2a 100%)",
          fontFamily: "Kanit",
          position: "relative",
        }}
      >
        {[
          [80, 90, 120],
          [1050, 80, 90],
          [980, 520, 140],
          [160, 520, 100],
          [600, 40, 70],
        ].map(([x, y, r], i) => (
          <div
            key={i}
            style={{ position: "absolute", left: x - r, top: y - r, width: r * 2, height: r * 2, borderRadius: 9999, background: "radial-gradient(circle, rgba(255,200,110,0.25), rgba(255,200,110,0) 70%)" }}
          />
        ))}
        {/* polaroid */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: 470,
            padding: 22,
            paddingBottom: 18,
            background: "#fbf7ee",
            borderRadius: 10,
            boxShadow: "0 30px 60px rgba(0,0,0,0.5)",
            transform: "rotate(-3deg)",
            marginRight: 40,
          }}
        >
          <div
            style={{
              display: "flex",
              position: "relative",
              width: 426,
              height: 380,
              background: "linear-gradient(180deg, #060a18 0%, #18224a 38%, #101a3c 39%, #03050d 100%)",
              alignItems: "flex-end",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            <div style={{ position: "absolute", right: 60, top: 40, width: 46, height: 46, borderRadius: 9999, background: "#fff4dc", boxShadow: "0 0 40px rgba(255,236,200,0.7)" }} />
            <div style={{ position: "absolute", left: 113, bottom: 10, width: 200, height: 200, borderRadius: 9999, background: `radial-gradient(circle, ${light}AA, ${light}00 70%)` }} />
            <div
              style={{
                display: "flex",
                width: 150,
                height: 165,
                marginBottom: 70,
                borderRadius: 6,
                background: `radial-gradient(ellipse at 50% 100%, #fff7e2 0%, ${light} 55%, #c98a3a 100%)`,
                boxShadow: `0 0 60px ${light}`,
                alignItems: "center",
                justifyContent: "center",
                padding: 14,
                fontFamily: "Sriracha",
                fontSize: 17,
                color: "#5b2d0c",
                textAlign: "center",
                lineHeight: 1.3,
              }}
            >
              {breakable(wish.slice(0, 40))}
            </div>
            <div style={{ position: "absolute", left: 128, bottom: 52, width: 170, height: 22, background: "#5a3d22", borderRadius: 3 }} />
            {offering > 0 && (
              <div
                style={{
                  position: "absolute",
                  top: 22,
                  left: 0,
                  right: 0,
                  display: "flex",
                  justifyContent: "center",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", padding: "6px 18px 6px 8px", borderRadius: 9999, background: "rgba(14,18,40,0.9)", border: "2px solid #ffd27a", boxShadow: "0 0 30px rgba(245,185,66,0.7)", fontSize: 26, color: "#ffe7a3" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: 9999, background: "radial-gradient(circle at 35% 35%, #fff3c4, #f5b942 55%, #b9781c)", color: "#7a4a0c", fontSize: 22, marginRight: 10 }}>฿</div>
                  {`฿${offering.toLocaleString("th-TH")}`}
                </div>
              </div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", padding: "14px 10px 0" }}>
            <div style={{ fontFamily: "Sriracha", fontSize: 30, color: "#3b2a1c", lineHeight: 1.3, textAlign: "center", justifyContent: "center", display: "flex" }}>
              {breakable(wish.length > 46 ? `${wish.slice(0, 45)}…` : wish)}
            </div>
            <div style={{ fontFamily: "Sriracha", fontSize: 22, color: "#7a5233", alignSelf: "flex-end", marginTop: 6 }}>{`— ${name}`}</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 520 }}>
          <div style={{ fontSize: 28, color: "#ffd27a", letterSpacing: 4 }}>ลอยกระทงออนไลน์ 2569</div>
          <div style={{ fontSize: 52, color: "#fff6e6", lineHeight: 1.25, marginTop: 12, display: "flex" }}>{breakable(lantern ? `โคมอธิษฐานของ ${name}` : "ส่งคำอธิษฐานลอยไปกับสายน้ำ")}</div>
          <div style={{ fontSize: 26, color: "rgba(255,246,230,0.7)", marginTop: 18, display: "flex" }}>
            {lantern ? "แตะเพื่อดูโคมที่กำลังลอยอยู่บนสายน้ำ ✨" : "ร่วมส่งคำอธิษฐานลอยไปกับสายน้ำ ✨"}
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Kanit", data: kanitThai, weight: 400, style: "normal" },
        { name: "Kanit", data: kanitLatin, weight: 400, style: "normal" },
        { name: "Sriracha", data: handThai, weight: 400, style: "normal" },
        { name: "Sriracha", data: handLatin, weight: 400, style: "normal" },
      ],
    },
  );
}
