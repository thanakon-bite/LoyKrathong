"use client";

import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      theme="dark"
      position="top-center"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast: "!rounded-2xl !border-gold/20 !bg-[#0e1529]/95 !text-warm !backdrop-blur-xl font-sans",
        },
      }}
    />
  );
}
