import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isValidHttpUrl } from "@/lib/env";

/**
 * Runs ONLY for /admin pages: refreshes the session cookie and does an optimistic redirect to the
 * login page (real authorization happens server-side on every request).
 * Public pages and API routes skip the proxy entirely, so they never wait for an extra auth round-trip
 * (the browser client keeps the session fresh by itself).
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let response = NextResponse.next({ request });
  // misconfigured env must not take the whole site down – API routes report "not_configured" instead
  if (!key || !isValidHttpUrl(url)) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet, headers) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  let data: Awaited<ReturnType<typeof supabase.auth.getClaims>>["data"] = null;
  try {
    ({ data } = await supabase.auth.getClaims());
  } catch {
    // Supabase unreachable – continue without a session
  }
  const path = request.nextUrl.pathname;
  if (path.startsWith("/admin") && path !== "/admin/login") {
    const claims = data?.claims as { is_anonymous?: boolean } | undefined;
    if (!claims || claims.is_anonymous) {
      const login = request.nextUrl.clone();
      login.pathname = "/admin/login";
      return NextResponse.redirect(login);
    }
  }
  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/admin"],
};
