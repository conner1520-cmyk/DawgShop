import type { SupabaseClient } from "@supabase/supabase-js";
import { isUgaEmail } from "@/lib/uga";

export type PostLoginResult = { ok: true; next: "/" | "/welcome" } | { ok: false; reason: "no_user" | "not_uga" };

// Runs right after a session is created (code verified or link opened).
// Signs out anyone who isn't @uga.edu and decides where to send the student.
export async function afterSignIn(supabase: SupabaseClient): Promise<PostLoginResult> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "no_user" };

  // The database trigger already blocks non-UGA sign-ups. This is a second guard.
  if (!isUgaEmail(user.email)) {
    await supabase.auth.signOut();
    return { ok: false, reason: "not_uga" };
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (error) console.error("profile lookup failed:", error.message);

  return { ok: true, next: profile ? "/" : "/welcome" };
}
