import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile, getSignedInUser } from "@/lib/auth";
import { LISTING_SELECT, withCoverUrls, type ListingRow } from "@/lib/listing-data";
import { monthLabel, todayISO } from "@/lib/listings";
import { ListingCard } from "@/components/listing-card";
import { LiveRefresh } from "@/components/live-refresh";

export const metadata: Metadata = { title: "Move-in - DawgShop" };

// Move-in: items students are listing now but can hand over later, grouped
// by the month they become available.
export default function MoveInPage() {
  return (
    <>
      <header className="top">
        <h1>Move-in listings</h1>
        <p className="meta" style={{ margin: "4px 0 0" }}>
          Students moving out list things now. Reserve one and pick it up when you get to campus.
        </p>
      </header>
      <Suspense fallback={<p className="meta pad">Loading move-in listings...</p>}>
        <MoveIn />
      </Suspense>
    </>
  );
}

// Reads the session cookie, so it renders per request behind Suspense.
async function MoveIn() {
  const session = await getSignedInUser();
  if (!session) redirect("/signin");
  if (!(await getProfile(session.supabase, session.user.id))) redirect("/welcome");

  const { data, error } = await session.supabase
    .from("listings")
    .select(LISTING_SELECT)
    .eq("status", "active")
    .gt("available_from", todayISO())
    .order("available_from", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) console.error("move-in query failed:", error.code, error.message);
  const listings = await withCoverUrls(session.supabase, (data ?? []) as unknown as ListingRow[]);

  // Group by month, in date order: { "December 2026": [...], ... }
  const groups = new Map<string, typeof listings>();
  for (const l of listings) {
    const key = monthLabel(l.available_from!);
    groups.set(key, [...(groups.get(key) ?? []), l]);
  }

  return (
    <>
      {error ? (
        <div className="empty">
          <h2>Listings didn&apos;t load</h2>
          <p>Check your connection and try again.</p>
          <Link href="/move-in" className="btn secondary">
            Try again
          </Link>
        </div>
      ) : listings.length ? (
        [...groups].map(([month, items]) => (
          <section key={month} aria-label={month}>
            <div className="sectionhead">
              <h2>{month}</h2>
              <span className="meta">
                {items.length} item{items.length > 1 ? "s" : ""}
              </span>
            </div>
            <div className="grid" style={{ paddingTop: 8 }}>
              {items.map((l) => (
                <ListingCard key={l.id} listing={l} />
              ))}
            </div>
          </section>
        ))
      ) : (
        <div className="empty">
          <h2>No move-in listings yet</h2>
          <p>When someone lists an item for a later date, it shows up here.</p>
          <Link href="/sell" className="btn primary">
            List something for later
          </Link>
        </div>
      )}
      <LiveRefresh />
    </>
  );
}
