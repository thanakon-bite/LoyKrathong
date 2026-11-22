import { escapeJsonForHtml } from "@/lib/security/sanitize";

export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return (
    <script
      type="application/ld+json"
      // JSON is escaped so user-controlled values can never close the script tag
      dangerouslySetInnerHTML={{ __html: escapeJsonForHtml(JSON.stringify(data)) }}
    />
  );
}
