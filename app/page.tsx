import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile, getSignedInUser } from "@/lib/auth";
import { signOut } from "./actions";

// One-line success messages, shown from /?notice=<key>.
const NOTICES: Record<string, string> = {
  password_saved: "Password saved.",
};

// Signed-in home. A placeholder until listings land in #5.
export default function HomePage({ searchParams }: PageProps<"/">) {
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
      <Home searchParams={searchParams} />
    </Suspense>
  );
}

// Reads the session cookie, so it renders per request behind Suspense.
async function Home({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const session = await getSignedInUser();
  if (!session) redirect("/signin");
  const profile = await getProfile(session.supabase, session.user.id);
  if (!profile) redirect("/welcome");
  const { notice } = await searchParams;
  const noticeText = typeof notice === "string" && Object.hasOwn(NOTICES, notice) ? NOTICES[notice] : undefined;

  return (
    <>
      <header className="top">
        <div className="toprow">
          <span className="wordmark">DawgShop</span>
          <span className="meta">Hi, {profile.name}</span>
        </div>
      </header>
      {noticeText && (
        <p className="notice" role="status">
          {noticeText}
        </p>
      )}
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
        <Link href="/set-password" className="linkbtn">
          Change password
        </Link>
      </div>
    </>
  );
}
