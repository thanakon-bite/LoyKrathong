import { Hero } from "@/components/landing/hero";
import { FestivalStats } from "@/components/landing/festival-stats";
import { HowItWorks } from "@/components/landing/how-it-works";
import { SiteFooter } from "@/components/layout/site-footer";
import { JsonLd } from "@/components/layout/json-ld";
import { publicEnv } from "@/lib/env";
import { SITE, absoluteUrl } from "@/lib/seo";

export default function HomePage() {
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE.name,
      alternateName: "Online Loy Krathong – Floating Wish Lantern Festival",
      url: absoluteUrl("/"),
      inLanguage: "th-TH",
      description: SITE.description,
    },
    {
      "@context": "https://schema.org",
      "@type": "Event",
      name: "ลอยกระทงออนไลน์ 2569",
      description: SITE.description,
      startDate: publicEnv.festivalStart,
      endDate: publicEnv.festivalEnd,
      eventStatus: "https://schema.org/EventScheduled",
      eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
      location: { "@type": "VirtualLocation", url: absoluteUrl("/festival") },
      image: [absoluteUrl("/opengraph-image")],
      isAccessibleForFree: true,
      organizer: { "@type": "Organization", name: SITE.name, url: absoluteUrl("/") },
      offers: { "@type": "Offer", price: "0", priceCurrency: "THB", availability: "https://schema.org/InStock", url: absoluteUrl("/create") },
    },
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: SITE.name,
      url: absoluteUrl("/"),
      applicationCategory: "LifestyleApplication",
      operatingSystem: "Web",
      offers: { "@type": "Offer", price: "0", priceCurrency: "THB" },
    },
  ];

  return (
    <>
      <JsonLd data={jsonLd} />
      <main>
        <Hero />
        <div className="relative bg-night">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(245,185,66,0.06),transparent_60%)]" />
          <FestivalStats />
          <HowItWorks />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
