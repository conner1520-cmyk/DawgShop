import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { afterSignIn } from "@/lib/post-login";
import type { LinkErrorKey } from "@/app/signin/link-errors";

// Fallback for sign-in links (?code=...). DawgShop signs in with an emailed code
// today, but this keeps a link option working and still enforces @uga.edu.
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const code = request.nextUrl.searchParams.get("code");
  const go = (path: string) => NextResponse.redirect(new URL(path, origin));
  const fail = (key: LinkErrorKey) => go(`/signin?error=${key}`);

  const supabase = await createClient();
  if (!supabase) return go("/signin");

  // No code usually means Supabase rejected an expired or already-used link
  // (it redirects here with ?error=...&error_code=otp_expired instead).
  if (!code) return fail("expired");

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("exchangeCodeForSession failed:", error.code, error.message);
    // The PKCE verifier cookie only exists in the browser that asked for the link.
    if (error.code === "bad_code_verifier" || /code verifier/i.test(error.message)) {
      return fail("other_device");
    }
    return fail("expired");
  }

  const result = await afterSignIn(supabase);
  if (!result.ok) return fail(result.reason === "not_uga" ? "not_uga" : "failed");
  return go(result.next);
}
