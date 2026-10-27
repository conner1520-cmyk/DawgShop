import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile, getSignedInUser } from "@/lib/auth";
import { hasPassword } from "@/lib/auth-errors";
import { SetPasswordForm } from "./set-password-form";

export const metadata: Metadata = { title: "Password - DawgShop" };

// Set or change your password. Reached from:
//   - a code sign-in by a student who has no password yet (/set-password)
//   - "Forgot password?" after the code is verified (/set-password?reset=1)
//   - "Change password" on the home page
// Signed-out visitors are sent to /signin by proxy.ts (and again below).
export default function SetPasswordPage({ searchParams }: PageProps<"/set-password">) {
  return (
    <>
      <header className="top">
        <span className="wordmark">DawgShop</span>
      </header>
      <div className="pad">
        <Suspense fallback={<p className="meta">Loading your account...</p>}>
          <SetPassword searchParams={searchParams} />
        </Suspense>
      </div>
    </>
  );
}

// Reads the session cookie and ?reset=, so it renders per request behind Suspense.
async function SetPassword({ searchParams }: { searchParams: PageProps<"/set-password">["searchParams"] }) {
  const session = await getSignedInUser();
  if (!session) redirect("/signin");
  // New students set their password on /welcome along with their profile.
  if (!(await getProfile(session.supabase, session.user.id))) redirect("/welcome");

  const reset = (await searchParams).reset === "1";
  // Passwords are required, so only offer a way out to students who already have one.
  const canCancel = await hasPassword(session.supabase);

  return (
    <>
      <h1 style={{ marginTop: 8 }}>{reset ? "Choose a new password" : "Create a password"}</h1>
      <p className="meta" style={{ margin: "6px 0 0" }}>
        Set a password so next time you can sign in without waiting for a code.
      </p>
      <SetPasswordForm />
      {canCancel && (
        <div className="signin-links">
          <Link href="/" className="linkbtn">
            Cancel
          </Link>
        </div>
      )}
    </>
  );
}
