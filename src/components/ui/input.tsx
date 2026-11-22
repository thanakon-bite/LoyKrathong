import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    ref={ref}
    className={cn(
      "flex h-11 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-base text-warm placeholder:text-warm/35 transition-colors outline-none focus-visible:border-gold/60 focus-visible:ring-2 focus-visible:ring-gold/25 disabled:opacity-50 md:text-sm",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";
export { Input };
