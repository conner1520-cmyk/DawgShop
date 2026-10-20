import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "./env";

// Pages anyone can open without signing in.
function isPublicPath(pathname: string) {
  return pathname === "/signin" || pathname.startsWith("/auth/");
}

// Copy any refreshed auth cookies onto a redirect so the session isn't lost.
function redirectTo(request: NextRequest, pathname: string, from: NextResponse) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  const res = NextResponse.redirect(url);
  from.cookies.getAll().forEach((c) => res.cookies.set(c));
  return res;
}

export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const env = getSupabaseEnv();

  // Supabase isn't set up yet: skip auth entirely and send people to /signin,
  // which shows the "not connected" notice.
  if (!env) {
    if (isPublicPath(pathname)) return NextResponse.next();
    return redirectTo(request, "/signin", NextResponse.next());
  }

  // Supabase sends sign-in links back to the Site URL (whatever page that is)
  // with ?code=... or ?error_code=.... Only /auth/callback knows how to use
  // them, so forward the query there instead of dropping it on /signin.
  const params = request.nextUrl.searchParams;
  if (!pathname.startsWith("/auth/") && (params.has("code") || params.has("error_code"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/callback";
    return NextResponse.redirect(url);
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(headers ?? {}).forEach(([key, value]) =>
          response.headers.set(key, value),
        );
      },
    },
  });

  // Do not put code between createServerClient and getClaims(): this call
  // refreshes the session cookie when it is about to expire.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);

  if (!signedIn && !isPublicPath(pathname)) {
    return redirectTo(request, "/signin", response);
  }
  if (signedIn && pathname === "/signin") {
    return redirectTo(request, "/", response);
  }
  return response;
}
