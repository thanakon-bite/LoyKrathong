import { SiteFooter } from "./site-footer";
import { cn } from "@/lib/utils";

/** Standard content page: starry gradient background + footer */
export function PageShell({ children, className, footer = true }: { children: React.ReactNode; className?: string; footer?: boolean }) {
  return (
    <>
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,#14204a_0%,#070c1d_45%,#050913_100%)]" />
      <div className="pointer-events-none fixed inset-x-0 bottom-0 -z-10 h-1/2 bg-[radial-gradient(ellipse_at_bottom,rgba(245,185,66,0.10),transparent_70%)]" />
      <main className={cn("mx-auto min-h-dvh w-full max-w-6xl px-4 pb-24 pt-24 sm:px-6", className)}>{children}</main>
      {footer && <SiteFooter />}
    </>
  );
}
