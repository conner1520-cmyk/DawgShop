"use server";

import { redirect } from "next/navigation";
import type { AuthError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { NOT_CONNECTED_MESSAGE } from "@/lib/supabase/env";
import { afterSignIn } from "@/lib/post-login";
import {
  CODE_FORMAT_ERROR,
  EMAIL_SHAPE_ERROR,
  NOT_UGA_ERROR,
  isSignInCode,
  normalizeEmail,
  ugaEmailError,
} from "@/lib/uga";

export type ActionResult = { ok: true; email: string } | { ok: false; error: string };

const isRateLimit = (e: AuthError) => (e.code ?? "").startsWith("over_") || e.status === 429;
// supabase-js also labels 5xx responses as AuthRetryableFetchError, so only
// treat a missing status (the request never got a response) as a network error.
const isNetwork = (e: AuthError) => !e.status;
const NETWORK_ERROR = "We couldn't reach the sign-in service. Check your connection and try again.";

// Step 1: email a sign-in code. We don't send a magic link because UGA's
// Microsoft 365 Safe Links scanner opens links in incoming mail, which uses up
// a one-time link before the student can click it.
export async function sendSignInCode(rawEmail: string): Promise<ActionResult> {
  // Check again on the server: never trust the browser's validation alone.
  const email = normalizeEmail(typeof rawEmail === "string" ? rawEmail : "");
  const invalid = ugaEmailError(email);
  if (invalid) return { ok: false, error: invalid };

  const supabase = await createClient();
  if (!supabase) return { ok: false, error: NOT_CONNECTED_MESSAGE };

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });

  if (error) {
    console.error("signInWithOtp failed:", error.code, error.status, error.message);
    // Project-wide hourly email cap (2/hour on Supabase's built-in sender).
    if (error.code === "over_email_send_rate_limit") {
      return { ok: false, error: "DawgShop has sent too many emails this hour. Try again later." };
    }
    if (isRateLimit(error)) {
      return { ok: false, error: "Too many codes were sent recently. Wait a minute, then try again." };
    }
    if (error.code === "email_address_invalid") return { ok: false, error: EMAIL_SHAPE_ERROR };
    if (isNetwork(error)) return { ok: false, error: NETWORK_ERROR };
    return { ok: false, error: "We couldn't send your code. Try again in a minute." };
  }
  return { ok: true, email };
}

// Step 2: check the code. On success this redirects to /welcome or /.
export async function verifySignInCode(rawEmail: string, rawCode: string): Promise<ActionResult> {
  const email = normalizeEmail(typeof rawEmail === "string" ? rawEmail : "");
  const invalid = ugaEmailError(email);
  if (invalid) return { ok: false, error: invalid };

  const token = typeof rawCode === "string" ? rawCode.trim() : "";
  if (!isSignInCode(token)) return { ok: false, error: CODE_FORMAT_ERROR };

  const supabase = await createClient();
  if (!supabase) return { ok: false, error: NOT_CONNECTED_MESSAGE };

  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) {
    console.error("verifyOtp failed:", error.code, error.status, error.message);
    if (isRateLimit(error)) return { ok: false, error: "Too many tries. Wait a minute and send a new code." };
    if (isNetwork(error)) return { ok: false, error: NETWORK_ERROR };
    return { ok: false, error: "That code didn't work. Check it, or send a new one." };
  }

  const result = await afterSignIn(supabase);
  if (!result.ok) {
    return {
      ok: false,
      error: result.reason === "not_uga" ? NOT_UGA_ERROR : "We couldn't finish signing you in. Send a new code.",
    };
  }
  redirect(result.next);
}
