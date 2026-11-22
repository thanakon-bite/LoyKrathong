import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "ลอยกระทงออนไลน์ 2569 – ส่งคำอธิษฐานของคุณ ให้ลอยไปกับแสงแห่งความหวัง";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function Lantern({ x, y, s, o }: { x: number; y: number; s: number; o: number }) {
  return (
    <div style={{ position: "absolute", left: x, top: y, width: s, height: s * 1.1, opacity: o, display: "flex" }}>
      <div
        style={{
          position: "absolute",
          inset: -s * 0.6,
          borderRadius: 9999,
          background: "radial-gradient(circle, rgba(245,185,66,0.55), rgba(245,185,66,0) 65%)",
        }}
      />
      <div
        style={{
          width: s,
          height: s * 1.1,
          borderRadius: s * 0.05,
          background: "radial-gradient(ellipse at 50% 100%, #fff6dc 0%, #ffd27a 45%, #d9963c 100%)",
          boxShadow: "0 0 40px rgba(245,185,66,0.8)",
        }}
      />
    </div>
  );
}

export default async function OgImage() {
  const dir = join(process.cwd(), "src/assets/fonts");
  const [thai, latin] = await Promise.all([readFile(join(dir, "kanit-thai-400-normal.woff")), readFile(join(dir, "kanit-latin-400-normal.woff"))]);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(180deg, #050813 0%, #0c1430 52%, #02040a 100%)",
          position: "relative",
          fontFamily: "Kanit",
        }}
      >
        <div style={{ position: "absolute", left: 950, top: 60, width: 70, height: 70, borderRadius: 9999, background: "#fff3d6", boxShadow: "0 0 80px rgba(255,236,200,0.6)" }} />
        <Lantern x={90} y={420} s={110} o={1} />
        <Lantern x={280} y={470} s={70} o={0.9} />
        <Lantern x={980} y={430} s={100} o={1} />
        <Lantern x={850} y={500} s={60} o={0.85} />
        <Lantern x={600} y={520} s={44} o={0.7} />
        <div style={{ fontSize: 30, color: "#ffd27a", letterSpacing: 6, marginBottom: 18 }}>ลอยกระทงออนไลน์ 2569</div>
        <div style={{ fontSize: 64, color: "#fff6e6", textAlign: "center", lineHeight: 1.25, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <span>ส่งคำอธิษฐานของคุณ</span>
          <span style={{ color: "#f5b942" }}>ให้ลอยไปกับแสงแห่งความหวัง</span>
        </div>
        <div style={{ fontSize: 26, color: "rgba(255,246,230,0.7)", marginTop: 26 }}>Floating Wish Lantern Festival · Real-time</div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Kanit", data: thai, weight: 400, style: "normal" },
        { name: "Kanit", data: latin, weight: 400, style: "normal" },
      ],
    },
  );
}
