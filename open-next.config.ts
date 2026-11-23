import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/** OpenNext adapter for Cloudflare Workers – pages are mostly dynamic, so no incremental cache is configured */
export default defineCloudflareConfig({});
