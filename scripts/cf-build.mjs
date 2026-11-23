// Cloudflare build without baking secrets into the Worker.
// OpenNext copies .env files into the bundle (.open-next/cloudflare/next-env.mjs), so .env.local is moved
// aside during the build and only the public NEXT_PUBLIC_* values are passed in. Secrets live in Worker
// secrets (`wrangler secret bulk`).  Usage: node scripts/cf-build.mjs [--app-url=https://…]
import { execSync } from "node:child_process";
import { existsSync, readFileSync, renameSync } from "node:fs";

const ENV = ".env.local";
const HIDDEN = ".env.local.cf-build-hidden";
const arg = process.argv.find((a) => a.startsWith("--app-url="));

const publicVars = {};
if (existsSync(ENV)) {
  for (const line of readFileSync(ENV, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(NEXT_PUBLIC_[A-Z0-9_]+)\s*=(.*)$/);
    if (m) publicVars[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}
if (arg) publicVars.NEXT_PUBLIC_APP_URL = arg.slice("--app-url=".length);
if (!publicVars.NEXT_PUBLIC_APP_URL || publicVars.NEXT_PUBLIC_APP_URL.includes("localhost")) {
  console.error("Set the public site URL: node scripts/cf-build.mjs --app-url=https://<worker>.workers.dev");
  process.exit(1);
}

if (existsSync(ENV)) renameSync(ENV, HIDDEN);
try {
  execSync("npx opennextjs-cloudflare build", { stdio: "inherit", env: { ...process.env, ...publicVars } });
} finally {
  if (existsSync(HIDDEN)) renameSync(HIDDEN, ENV);
}
