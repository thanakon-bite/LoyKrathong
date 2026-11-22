import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl shadow-[0_20px_60px_-30px_rgba(0,0,0,0.8)]", className)}
      {...props}
    />
  );
}
