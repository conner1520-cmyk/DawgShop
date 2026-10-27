"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NOT_CONNECTED_MESSAGE } from "@/lib/supabase/env";
import { afterSignIn } from "@/lib/post-login";
import { NETWORK_ERROR, hasPassword, isNetwork, isRateLimit } from "@/lib/auth-errors";
import { PASSWORD_REQUIRED_ERROR } from "@/lib/password";
import {
  CODE_FORMAT_ERROR,
  EMAIL_SHAPE_ERROR,
  NOT_UGA_ERROR,
  isSignInCode,
  normalizeEmail,
  ugaEmailError,
} from "@/lib/uga";

export type ActionResult = { ok: true; email: string } | { ok: false; error: string };

/** Why the student is using the emailed code: making an account, or forgot password. */
export type CodeIntent = "signup" | "reset";

export type PasswordSignInResult = { ok: false; field: "email" | "password" | "form"; error: string };

const SIGNIN_FAILED = "We couldn't finish signing you in. Try again.";

// Default sign-in: email and password. On success this redirects.
export async function signInWithPassword(rawEmail: string, rawPassword: string): Promise<PasswordSignInResult> {
  // Check again on the server: never trust the browser's validation alone.
  const email = normalizeEmail(typeof rawEmail === "string" ? rawEmail : "");
  const invalid = ugaEmailError(email);
  if (invalid) return { ok: false, field: "email", error: invalid };

  // Don't apply the 8-character rule here. Just make sure something was typed.
  // (Never trim passwords: spaces can be part of them.)
  const password = typeof rawPassword === "string" ? rawPassword : "";
  if (!password) return { ok: false, field: "password", error: PASSWORD_REQUIRED_ERROR };

  const supabase = await createClient();
  if (!supabase) return { ok: false, field: "form", error: NOT_CONNECTED_MESSAGE };

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    console.error("signInWithPassword failed:", error.code, error.status, error.message);
    // Same message whether or not the account exists, so this form can't be
    // used to find out who has a DawgShop account.
    if (error.code === "invalid_credentials") {
      return {
        ok: false,
        field: "form",
        error: "That email and password don't match. Try again, or use Forgot password.",
      };
    }
    if (error.code === "email_not_confirmed") {
      return { ok: false, field: "form", error: "Finish creating your account first: tap Create your account." };
    }
    if (isRateLimit(error)) return { ok: false, field: "form", error: "Too many tries. Wait a minute, then try again." };
    if (isNetwork(error)) return { ok: false, field: "form", error: NETWORK_ERROR };
    return { ok: false, field: "form", error: "We couldn't sign you in. Try again in a minute." };
  }

  const result = await afterSignIn(supabase);
  if (!result.ok) {
    return { ok: false, field: "form", error: result.reason === "not_uga" ? NOT_UGA_ERROR : SIGNIN_FAILED };
  }
  redirect(result.next);
}

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

// Step 2: check the code. On success this redirects:
//   no profile yet          -> /welcome (name, pickup spot, and a password)
//   intent "reset"          -> /set-password?reset=1 (forgot password)
//   profile but no password -> /set-password (students from before passwords existed)
//   otherwise               -> /
export async function verifySignInCode(
  rawEmail: string,
  rawCode: string,
  rawIntent?: CodeIntent,
): Promise<ActionResult> {
  const intent: CodeIntent = rawIntent === "reset" ? "reset" : "signup";

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
  if (result.next === "/welcome") redirect("/welcome");
  if (intent === "reset") redirect("/set-password?reset=1");
  if (!(await hasPassword(supabase))) redirect("/set-password");
  redirect("/");
}
