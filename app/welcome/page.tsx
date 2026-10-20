import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getProfile, getSignedInUser } from "@/lib/auth";
import { firstName } from "@/lib/uga";
import { WelcomeForm } from "./welcome-form";

export const metadata: Metadata = { title: "Welcome - DawgShop" };

// First-time profile, shown right after a student's first sign-in.
export default function WelcomePage() {
  return (
    <>
      <header className="top">
        <span className="wordmark">DawgShop</span>
      </header>
      <div className="pad">
        <h1 style={{ marginTop: 8 }}>Welcome to DawgShop</h1>
        <Suspense fallback={<p className="meta">Loading your account...</p>}>
          <Welcome />
        </Suspense>
      </div>
    </>
  );
}

// Reads the session cookie, so it renders per request behind Suspense.
async function Welcome() {
  const session = await getSignedInUser();
  if (!session) redirect("/signin");
  if (await getProfile(session.supabase, session.user.id)) redirect("/");

  return (
    <>
      <p className="meta" style={{ margin: "6px 0 0" }}>
        Signed in as {session.email}. Tell other students who you are.
      </p>
      <WelcomeForm defaultName={firstName(session.email)} />
    </>
  );
}
