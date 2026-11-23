import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  getServerSupabase: async () => ({ auth: { exchangeCodeForSession: async () => ({ error: null }) } }),
}));

const { GET } = await import("@/app/auth/callback/route");
const go = async (next: string) => {
  const res = await GET(new Request(`https://x.app/auth/callback?code=abc&next=${encodeURIComponent(next)}`));
  return new URL(res.headers.get("location")!);
};

describe("auth callback redirect", () => {
  it("keeps same-origin paths", async () => {
    const u = await go("/festival?x=1");
    expect(u.origin).toBe("https://x.app");
    expect(u.pathname).toBe("/festival");
  });
  it("never leaves the site", async () => {
    for (const n of ["/\evil.com", "//evil.com", "https://evil.com", "/\/evil.com", "/\t/evil.com"]) {
      const u = await go(n);
      expect(u.origin, n).toBe("https://x.app");
    }
  });
});
