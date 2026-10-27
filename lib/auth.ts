import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isUgaEmail } from "@/lib/uga";

export type Profile = {
  id: string;
  email: string;
  name: string;
  pickup_area: string | null;
};

// Returns the signed-in UGA student (and a Supabase client to use for them),
// or null if nobody is signed in, the email isn't @uga.edu, or Supabase
// isn't connected. Call this inside every page and Server Action that needs a
// user; don't rely on proxy.ts alone.
export async function getSignedInUser() {
  // Who's signed in is different on every request. Saying so up front stops
  // Next.js from trying to prerender this, which otherwise trips on the
  // Date.now() that Supabase uses to check whether the session has expired.
  await connection();
  const supabase = await createClient();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email || !isUgaEmail(user.email)) return null;
  return { supabase, user, email: user.email };
}

export async function getProfile(
  supabase: NonNullable<Awaited<ReturnType<typeof getSignedInUser>>>["supabase"],
  userId: string,
): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, name, pickup_area")
    .eq("id", userId)
    .maybeSingle();
  if (error) console.error("profile lookup failed:", error.message);
  return (data as Profile | null) ?? null;
}
