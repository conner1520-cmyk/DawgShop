import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile, getSignedInUser } from "@/lib/auth";
import { withCoverUrls } from "@/lib/listing-data";
import { fmt, future, money, tileClass, type Listing } from "@/lib/listings";
import { Cover } from "@/components/listing-card";
import { OwnerActions } from "@/components/owner-actions";
import { signOut } from "../actions";

export const metadata: Metadata = { title: "Me - DawgShop" };

const NOTICES: Record<string, string> = {
  deleted: "Listing deleted.",
};

// Your profile, your listings (#7), and account settings.
export default function MePage({ searchParams }: PageProps<"/me">) {
  return (
    <Suspense fallback={<p className="meta pad">Loading your account...</p>}>
      <Me searchParams={searchParams} />
    </Suspense>
  );
}

type MyListing = Pick<Listing, "id" | "title" | "price" | "status" | "available_from" | "photos" | "created_at">;

function StatusBadge({ l }: { l: MyListing }) {
  if (l.status === "sold") return <span className="badge red">Sold</span>;
  if (l.status === "hidden") return <span className="badge gray">Unlisted</span>;
  if (future(l) && l.available_from) return <span className="badge">Available {fmt(l.available_from)}</span>;
  return <span className="badge">Active</span>;
}

// Reads the session cookie, so it renders per request behind Suspense.
async function Me({ searchParams }: { searchParams: PageProps<"/me">["searchParams"] }) {
  const session = await getSignedInUser();
  if (!session) redirect("/signin");
  const profile = await getProfile(session.supabase, session.user.id);
  if (!profile) redirect("/welcome");

  const sp = await searchParams;
  const notice = typeof sp.notice === "string" && Object.hasOwn(NOTICES, sp.notice) ? NOTICES[sp.notice] : undefined;

  // Everything you've posted, including sold and unlisted items.
  const { data, error } = await session.supabase
    .from("listings")
    .select("id, title, price, status, available_from, photos, created_at")
    .eq("seller_id", session.user.id)
    .order("created_at", { ascending: false });
  if (error) console.error("my listings query failed:", error.code, error.message);
  const mine = await withCoverUrls(session.supabase, (data ?? []) as MyListing[]);

  return (
    <>
      <div className="profile">
        <span className="avatar" aria-hidden="true">
          {profile.name.charAt(0).toUpperCase()}
        </span>
        <div>
          <h1 style={{ fontSize: 19, lineHeight: 1.2 }}>{profile.name}</h1>
          {/* From the sign-in session; profiles.email isn't readable. */}
          <div className="meta">{session.email}</div>
          <div className="verified">✓ Verified UGA student</div>
        </div>
      </div>
      <div className="stats">
        <div>
          <b>{mine.filter((l) => l.status === "active").length}</b>
          <span className="meta">Active</span>
        </div>
        <div>
          <b>{mine.filter((l) => l.status === "sold").length}</b>
          <span className="meta">Sold</span>
        </div>
      </div>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}

      <div className="sectionhead">
        <h2>Your listings</h2>
      </div>
      {error ? (
        <p className="err" style={{ padding: "4px 16px" }}>
          Your listings didn&apos;t load. Refresh the page to try again.
        </p>
      ) : mine.length ? (
        mine.map((l) => (
          <div className="mine" key={l.id}>
            <Link href={`/listings/${l.id}`} className={`thumb ${tileClass(l.id)}`} tabIndex={-1} aria-hidden="true">
              <Cover url={l.coverUrl} />
            </Link>
            <div className="rowtext">
              <b>
                <Link href={`/listings/${l.id}`}>{l.title}</Link>
              </b>
              <span className="meta">{money(l.price)}</span> <StatusBadge l={l} />
              <OwnerActions id={l.id} title={l.title} status={l.status} variant="row" />
            </div>
          </div>
        ))
      ) : (
        <div className="empty" style={{ padding: 24 }}>
          <p>You haven&apos;t listed anything yet.</p>
          <Link href="/sell" className="btn primary">
            Post your first item
          </Link>
        </div>
      )}

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
