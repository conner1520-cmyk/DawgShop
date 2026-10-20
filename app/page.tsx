import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getProfile, getSignedInUser } from "@/lib/auth";
import { signOut } from "./actions";

// Signed-in home. A placeholder until listings land in #5.
export default function HomePage() {
  return (
    <Suspense
      fallback={
        <header className="top">
          <div className="toprow">
            <span className="wordmark">DawgShop</span>
          </div>
        </header>
      }
    >
      <Home />
    </Suspense>
  );
}

// Reads the session cookie, so it renders per request behind Suspense.
async function Home() {
  const session = await getSignedInUser();
  if (!session) redirect("/signin");
  const profile = await getProfile(session.supabase, session.user.id);
  if (!profile) redirect("/welcome");

  return (
    <>
      <header className="top">
        <div className="toprow">
          <span className="wordmark">DawgShop</span>
          <span className="meta">Hi, {profile.name}</span>
        </div>
      </header>
      <div className="empty">
        <h2>Listings are coming soon</h2>
        <p>Soon you&apos;ll be able to browse and post furniture, textbooks, and dorm gear from other UGA students.</p>
      </div>
      <div className="profile">
        <span className="avatar" aria-hidden="true">
          {profile.name.charAt(0).toUpperCase()}
        </span>
        <div>
          <h2>{profile.name}</h2>
          <div className="meta">{session.email}</div>
          <div className="verified">✓ Verified UGA student</div>
        </div>
      </div>
      <div className="footer">
        <form action={signOut}>
          <button className="btn secondary" type="submit">
            Sign out
          </button>
        </form>
      </div>
    </>
  );
}
