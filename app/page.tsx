import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile, getSignedInUser } from "@/lib/auth";
import { anyActive, browseHref, parseFilters, searchText, type Filters } from "@/lib/browse";
import { LISTING_SELECT, withCoverUrls, type ListingRow } from "@/lib/listing-data";
import { CATEGORIES } from "@/lib/listings";
import { ListingCard } from "@/components/listing-card";
import { LiveRefresh } from "@/components/live-refresh";
import { BrowseControls } from "./browse-controls";

// One-line success messages, shown from /?notice=<key>.
const NOTICES: Record<string, string> = {
  password_saved: "Password saved.",
};

const LIMIT = 100;

// Browse: every active listing, newest first, with search and filters (#5).
export default function BrowsePage({ searchParams }: PageProps<"/">) {
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
      <Browse searchParams={searchParams} />
    </Suspense>
  );
}

// Reads the session cookie and the URL, so it renders per request behind Suspense.
async function Browse({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const session = await getSignedInUser();
  if (!session) redirect("/signin");
  const profile = await getProfile(session.supabase, session.user.id);
  if (!profile) redirect("/welcome");

  const sp = await searchParams;
  const filters = parseFilters(sp);
  const notice = typeof sp.notice === "string" && Object.hasOwn(NOTICES, sp.notice) ? NOTICES[sp.notice] : undefined;

  // Build the database query from the filters. RLS already limits students
  // to active listings and their own; status = 'active' hides your own sold
  // and unlisted items here too.
  let query = session.supabase.from("listings").select(LISTING_SELECT).eq("status", "active");

  const text = searchText(filters.q);
  if (text) {
    // Double quotes let the search include spaces and punctuation safely.
    const p = `"%${text}%"`;
    query = query.or(
      `title.ilike.${p},description.ilike.${p},course.ilike.${p},category.ilike.${p},pickup_area.ilike.${p}`,
    );
  }
  // "Free" means $0 or the Free category (textbooks at $0 keep their category).
  if (filters.cat === "Free") query = query.or("price.eq.0,category.eq.Free");
  else if (filters.cat !== "All") query = query.eq("category", filters.cat);
  if (filters.area !== "Anywhere") query = query.eq("pickup_area", filters.area);
  if (filters.max !== "") query = query.lte("price", Number(filters.max));

  if (filters.sort === "low") query = query.order("price", { ascending: true });
  else if (filters.sort === "high") query = query.order("price", { ascending: false });
  query = query.order("created_at", { ascending: false }).limit(LIMIT);

  const { data, error } = await query;
  if (error) console.error("browse query failed:", error.code, error.message);
  const listings = await withCoverUrls(session.supabase, (data ?? []) as unknown as ListingRow[]);

  return (
    <>
      <header className="top">
        <div className="toprow">
          <span className="wordmark">DawgShop</span>
          <span className="meta">Hi, {profile.name}</span>
        </div>
        <BrowseControls filters={filters} />
      </header>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <Chips filters={filters} />
      {error ? (
        <div className="empty">
          <h2>Listings didn&apos;t load</h2>
          <p>Check your connection and try again.</p>
          <Link href={browseHref(filters)} className="btn secondary">
            Try again
          </Link>
        </div>
      ) : listings.length ? (
        <div className="grid">
          {listings.map((l) => (
            <ListingCard key={l.id} listing={l} />
          ))}
        </div>
      ) : anyActive(filters) ? (
        <div className="empty">
          <h2>Nothing matches yet</h2>
          <p>Try a different search, or clear your filters to see everything for sale.</p>
          <Link href="/" className="btn secondary">
            Clear filters
          </Link>
        </div>
      ) : (
        <div className="empty">
          <h2>Nothing for sale yet</h2>
          <p>Be the first to list something. Furniture, textbooks, and dorm gear all sell fast.</p>
          <Link href="/sell" className="btn primary">
            Post the first item
          </Link>
        </div>
      )}
      <LiveRefresh />
    </>
  );
}

// Category chips: All plus each category. Each is a link to the same page
// with a different ?cat=.
function Chips({ filters }: { filters: Filters }) {
  return (
    <nav className="chips" aria-label="Categories">
      {["All", ...CATEGORIES].map((c) => (
        <Link
          key={c}
          href={browseHref({ ...filters, cat: c })}
          className="chip"
          aria-current={filters.cat === c ? "true" : undefined}
          scroll={false}
          replace
        >
          {c}
        </Link>
      ))}
    </nav>
  );
}
