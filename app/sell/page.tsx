import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getProfile, getSignedInUser } from "@/lib/auth";
import { AREAS } from "@/lib/areas";
import { todayISO } from "@/lib/listings";
import { ListingForm } from "@/components/listing-form";

export const metadata: Metadata = { title: "Sell - DawgShop" };

// Sell something (#4).
export default function SellPage() {
  return (
    <>
      <header className="top">
        <div className="toprow">
          <h1 style={{ flex: 1 }}>Sell something</h1>
        </div>
      </header>
      <Suspense fallback={<p className="meta pad">Loading...</p>}>
        <Sell />
      </Suspense>
    </>
  );
}

// Reads the session cookie, so it renders per request behind Suspense.
async function Sell() {
  const session = await getSignedInUser();
  if (!session) redirect("/signin");
  const profile = await getProfile(session.supabase, session.user.id);
  if (!profile) redirect("/welcome");

  // Start the pickup spot at the student's dorm from /welcome, if they gave one.
  const home = profile.pickup_area && (AREAS as readonly string[]).includes(profile.pickup_area) ? profile.pickup_area : "";

  return (
    <ListingForm
      userId={session.user.id}
      listingId={null}
      today={todayISO()}
      initial={{
        title: "",
        price: "",
        category: "",
        condition: "Used",
        pickup_area: home,
        course: "",
        description: "",
        available_from: "",
        photos: [],
      }}
    />
  );
}
