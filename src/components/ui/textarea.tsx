import * as React from "react";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "flex min-h-20 w-full resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-base text-warm placeholder:text-warm/35 outline-none transition-colors focus-visible:border-gold/60 focus-visible:ring-2 focus-visible:ring-gold/25 disabled:opacity-50 md:text-sm",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";
export { Textarea };
