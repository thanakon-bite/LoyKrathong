import type { Metadata, Viewport } from "next";
import "@fontsource/noto-sans-thai/400.css";
import "@fontsource/noto-sans-thai/500.css";
import "@fontsource/noto-sans-thai/700.css";
import "@fontsource/kanit/300.css";
import "@fontsource/kanit/400.css";
import "@fontsource/kanit/500.css";
import "@fontsource/sriracha/400.css";
import "@fontsource/charm/700.css";
import "@fontsource/mali/500.css";
import "@fontsource/noto-serif-thai/500.css";
import "./globals.css";
import { AuthProvider } from "@/components/providers/auth-provider";
import { AudioProvider } from "@/components/providers/audio-provider";
import { SiteHeader } from "@/components/layout/site-header";
import { Toaster } from "@/components/ui/sonner";
import { publicEnv } from "@/lib/env";
import { SITE } from "@/lib/seo";

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.appUrl),
  title: { default: SITE.title, template: `%s | ${SITE.name}` },
  description: SITE.description,
  keywords: SITE.keywords,
  applicationName: SITE.name,
  authors: [{ name: SITE.name }],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: SITE.locale,
    url: "/",
    siteName: SITE.name,
    title: SITE.title,
    description: SITE.description,
  },
  twitter: { card: "summary_large_image", title: SITE.title, description: SITE.description },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" } },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#050913",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" suppressHydrationWarning>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-gold focus:px-4 focus:py-2 focus:text-night">
          ข้ามไปยังเนื้อหา
        </a>
        <AuthProvider>
          <AudioProvider>
            <SiteHeader />
            <div id="main">{children}</div>
            <Toaster />
          </AudioProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
