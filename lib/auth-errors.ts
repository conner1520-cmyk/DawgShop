import type { AuthError, SupabaseClient } from "@supabase/supabase-js";

// Shared helpers for turning Supabase Auth errors into plain language.
// (They live here because a "use server" file can only export async functions.)

export const isRateLimit = (e: AuthError) => (e.code ?? "").startsWith("over_") || e.status === 429;

// supabase-js also labels 5xx responses as AuthRetryableFetchError, so only
// treat a missing status (the request never got a response) as a network error.
export const isNetwork = (e: AuthError) => !e.status;

export const NETWORK_ERROR = "We couldn't reach the sign-in service. Check your connection and try again.";

export const REAUTH_ERROR = "For security, sign in with a code again to set your password.";

/** Message for a failed supabase.auth.updateUser({ password }). */
export function passwordUpdateError(e: AuthError): string {
  switch (e.code) {
    case "weak_password":
      return "That password is too easy to guess. Try a longer one.";
    case "same_password":
      return "That's already your password. Choose a different one.";
    case "reauthentication_needed":
    case "reauthentication_not_valid":
    case "session_not_found":
    case "session_expired":
      return REAUTH_ERROR;
  }
  if (isRateLimit(e)) return "Too many tries. Wait a minute, then try again.";
  if (isNetwork(e)) return NETWORK_ERROR;
  return "We couldn't save your password. Try again in a minute.";
}

/**
 * Does the signed-in student have a password? Uses public.has_password()
 * from supabase/migrations/0002_passwords.sql.
 *
 * If the call fails (for example, the migration hasn't been run yet), this
 * logs it and answers "yes", so nobody gets stuck being sent to
 * /set-password over and over.
 */
export async function hasPassword(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.rpc("has_password");
  if (error) {
    console.error("has_password rpc failed:", error.code, error.message);
    return true;
  }
  return data !== false;
}
