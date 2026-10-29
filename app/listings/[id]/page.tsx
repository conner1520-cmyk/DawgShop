import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile, getSignedInUser } from "@/lib/auth";
import { LISTING_SELECT, photoUrls, type ListingRow } from "@/lib/listing-data";
import { ago, fmt, future, isUuid, tileClass } from "@/lib/listings";
import { BackButton } from "@/components/back-button";
import { PriceTag } from "@/components/listing-card";
import { OwnerActions } from "@/components/owner-actions";
import { PhotoCarousel } from "@/components/photo-carousel";

export const metadata: Metadata = { title: "Listing - DawgShop" };

const NOTICES: Record<string, string> = {
  posted: "Listing posted.",
  saved: "Changes saved.",
};

// One listing: photos, price, details, seller, and actions.
export default function ListingPage({ params, searchParams }: PageProps<"/listings/[id]">) {
  return (
    <Suspense
      fallback={
        <div className="bar">
          <BackButton />
        </div>
      }
    >
      <ListingView params={params} searchParams={searchParams} />
    </Suspense>
  );
}

function Gone() {
  return (
    <>
      <div className="bar">
        <BackButton />
      </div>
      <div className="empty">
        <h2>This listing is gone</h2>
        <p>The seller removed it.</p>
        <Link href="/" className="btn secondary">
          Back to browsing
        </Link>
      </div>
    </>
  );
}

// Reads the session cookie and the URL, so it renders per request behind Suspense.
async function ListingView({
  params,
  searchParams,
}: {
  params: PageProps<"/listings/[id]">["params"];
  searchParams: PageProps<"/listings/[id]">["searchParams"];
}) {
  const session = await getSignedInUser();
  if (!session) redirect("/signin");
  if (!(await getProfile(session.supabase, session.user.id))) redirect("/welcome");

  const { id } = await params;
  if (!isUuid(id)) return <Gone />;

  // RLS returns other students' listings only while active, so a sold or
  // unlisted listing looks "gone" to everyone but its seller.
  const { data, error } = await session.supabase.from("listings").select(LISTING_SELECT).eq("id", id).maybeSingle();
  if (error) console.error("listing query failed:", error.code, error.message);
  if (!data) return <Gone />;
  const l = data as unknown as ListingRow;

  const sp = await searchParams;
  const notice = typeof sp.notice === "string" && Object.hasOwn(NOTICES, sp.notice) ? NOTICES[sp.notice] : undefined;
  const mine = l.seller_id === session.user.id;
  const sellerName = l.seller?.name ?? "A UGA student";
  const urls = await photoUrls(session.supabase, l);

  return (
    <>
      <div className="bar">
        <BackButton />
        {mine && <span className="meta">Your listing</span>}
      </div>
      <div className={`tile hero ${tileClass(l.id)}`}>
        <PhotoCarousel urls={urls} title={l.title} />
        <PriceTag price={l.price} large />
      </div>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <div className="pad">
        <h1>{l.title}</h1>
        {l.status === "sold" && <span className="badge red">Sold</span>}
        {l.status === "hidden" && <span className="badge gray">Unlisted</span>}
        <div className="facts">
          <span className="fact">{l.condition}</span>
          <span className="fact">{l.category}</span>
          {l.course && <span className="fact">{l.course}</span>}
        </div>
        <p className="meta" style={{ margin: 0 }}>
          Pickup at <b style={{ color: "var(--ink)" }}>{l.pickup_area}</b>. Posted {ago(l.created_at)}.
        </p>
        {future(l) && l.available_from && (
          <div className="note">
            <b>Available {fmt(l.available_from)}.</b> Reserve it now and pick it up once it&apos;s ready.
          </div>
        )}
        {l.description && <p className="desc">{l.description}</p>}
        <div className="seller">
          <span className="avatar" aria-hidden="true">
            {sellerName.charAt(0).toUpperCase()}
          </span>
          <div>
            <b>{mine ? "You" : sellerName}</b>
            <div className="verified">✓ Verified UGA student</div>
          </div>
        </div>
      </div>
      {mine ? (
        <OwnerActions id={l.id} title={l.title} status={l.status} variant="detail" />
      ) : (
        <div className="actions">
          {/* Messaging and offers arrive with #6. */}
          <button type="button" className="btn secondary" disabled>
            Messaging coming soon
          </button>
        </div>
      )}
    </>
  );
}
