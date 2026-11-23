// Google Search Console ownership file. Served by a route (not /public): Cloudflare's asset handler
// redirects "*.html" to the extension-less path, and the verifier wants a plain 200.
export const dynamic = "force-static";

export function GET() {
  return new Response("google-site-verification: googlef89222e115e0cda8.html", {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
