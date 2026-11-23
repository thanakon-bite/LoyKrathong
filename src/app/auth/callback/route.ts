import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

/** Email confirmation / magic-link callback (PKCE code exchange) */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/my-lanterns";
  // same-origin paths only ("/\\evil.com" and "//evil.com" resolve to other hosts)
  const resolved = (() => {
    try {
      return new URL(next, url.origin);
    } catch {
      return null;
    }
  })();
  const safeNext =
    next.startsWith("/") && !/[\\\u0000-\u001f]/.test(next) && resolved?.origin === url.origin ? `${resolved.pathname}${resolved.search}` : "/my-lanterns";
  if (code) {
    try {
      const supabase = await getServerSupabase();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL(`${safeNext}${safeNext.includes("?") ? "&" : "?"}linked=1`, url.origin));
    } catch {
      /* fall through */
    }
  }
  return NextResponse.redirect(new URL("/my-lanterns?auth_error=1", url.origin));
}
