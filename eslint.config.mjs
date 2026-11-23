import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  { ignores: [".next/**", ".netlify/**", ".open-next/**", ".wrangler/**", "cloudflare/**", "node_modules/**", "next-env.d.ts"] },
];
export default config;
