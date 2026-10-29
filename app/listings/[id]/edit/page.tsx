import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSignedInUser } from "@/lib/auth";
import { photoUrls } from "@/lib/listing-data";
import { isUuid, todayISO, type Listing } from "@/lib/listings";
import { BackButton } from "@/components/back-button";
import { ListingForm } from "@/components/listing-form";

export const metadata: Metadata = { title: "Edit listing - DawgShop" };

// Edit one of your listings (#7). Same form as Sell.
export default function EditListingPage({ params }: PageProps<"/listings/[id]/edit">) {
  return (
    <>
      <header className="top">
        <div className="toprow">
          <BackButton fallback="/me" />
          <h1 style={{ flex: 1 }}>Edit listing</h1>
        </div>
      </header>
      <Suspense fallback={<p className="meta pad">Loading your listing...</p>}>
        <Edit params={params} />
      </Suspense>
    </>
  );
}

// Reads the session cookie and the URL, so it renders per request behind Suspense.
async function Edit({ params }: { params: PageProps<"/listings/[id]/edit">["params"] }) {
  const session = await getSignedInUser();
  if (!session) redirect("/signin");

  const { id } = await params;
  // Only the seller can load this (seller_id check here, RLS for updates).
  const { data, error } = isUuid(id)
    ? await session.supabase
        .from("listings")
        .select("id, title, description, price, category, condition, pickup_area, course, available_from, photos, updated_at")
        .eq("id", id)
        .eq("seller_id", session.user.id)
        .maybeSingle()
    : { data: null, error: null };
  if (error) console.error("edit listing query failed:", error.code, error.message);

  if (!data) {
    return (
      <div className="empty">
        <h2>This listing is gone</h2>
        <p>It may have been deleted, or it isn&apos;t yours to edit.</p>
        <Link href="/me" className="btn secondary">
          Back to your listings
        </Link>
      </div>
    );
  }

  const l = data as Pick<
    Listing,
    | "id"
    | "title"
    | "description"
    | "price"
    | "category"
    | "condition"
    | "pickup_area"
    | "course"
    | "available_from"
    | "photos"
    | "updated_at"
  >;
  const urls = await photoUrls(session.supabase, l);

  return (
    <ListingForm
      // A new key after each save, so the form starts from the saved values.
      key={l.updated_at}
      userId={session.user.id}
      listingId={l.id}
      today={todayISO()}
      initial={{
        title: l.title,
        price: String(l.price),
        category: l.category,
        condition: l.condition,
        pickup_area: l.pickup_area,
        course: l.course ?? "",
        description: l.description,
        available_from: l.available_from ?? "",
        photos: l.photos.map((path, i) => ({ path, url: urls[i] })),
      }}
    />
  );
}
