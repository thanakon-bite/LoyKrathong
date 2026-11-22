"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="grid min-h-dvh place-items-center px-4 text-center">
      <div>
        <h1 className="font-display text-2xl text-warm">เกิดข้อผิดพลาดบางอย่าง</h1>
        <p className="mt-2 text-warm/60">กรุณาลองใหม่อีกครั้ง หากยังพบปัญหาโปรดติดต่อผู้ดูแล</p>
        {error.digest && <p className="mt-1 font-mono text-xs text-warm/30">ref: {error.digest}</p>}
        <Button className="mt-6" onClick={reset}>
          ลองใหม่
        </Button>
      </div>
    </main>
  );
}
