"use server";

import { revalidatePath } from "next/cache";
import { getSignedInUser } from "@/lib/auth";
import { removePhotos } from "@/lib/listing-data";
import {
  STATUSES,
  isUuid,
  validateListing,
  type ListingErrors,
  type ListingInput,
  type ListingStatus,
} from "@/lib/listings";

export type SaveResult = { ok: true; id: string } | { ok: false; errors: ListingErrors };
export type ActionResult = { ok: true } | { ok: false; error: string };

const SIGNED_OUT = "Your session ended. Sign in again, then try once more.";
const GONE = "This listing is gone. It may have been deleted.";
const TRY_AGAIN = "We couldn't save that. Check your connection and try again.";

// Every page shows listings, so after any change, refresh them all (this also
// clears the browser's cache of pages you've visited).
function refreshAll() {
  revalidatePath("/", "layout");
}

// Create a listing (listingId = null) or save edits to one of yours.
// The browser has already uploaded the photos; this checks everything again
// on the server, with the user id from the session, never from the form.
export async function saveListing(input: ListingInput, listingId: string | null): Promise<SaveResult> {
  const session = await getSignedInUser();
  if (!session) return { ok: false, errors: { form: SIGNED_OUT } };
  const { supabase, user } = session;

  if (!input || typeof input !== "object") return { ok: false, errors: { form: TRY_AGAIN } };
  const checked = validateListing(input, user.id);
  if (!checked.ok) return { ok: false, errors: checked.errors };
  const values = checked.values;

  // ----- Create -----
  if (!listingId) {
    const { data, error } = await supabase
      .from("listings")
      .insert({ ...values, seller_id: user.id })
      .select("id")
      .single();
    if (error || !data) {
      console.error("listing insert failed:", error?.code, error?.message);
      // 23503: the profile row is missing (foreign key), e.g. /welcome was skipped.
      if (error?.code === "23503") return { ok: false, errors: { form: "Finish setting up your profile before posting." } };
      return { ok: false, errors: { form: TRY_AGAIN } };
    }
    refreshAll();
    return { ok: true, id: data.id as string };
  }

  // ----- Edit -----
  if (!isUuid(listingId)) return { ok: false, errors: { form: GONE } };

  // Read the saved photo list from the database (not the browser) so we know
  // which photos were removed and can delete them afterwards.
  const { data: existing, error: readError } = await supabase
    .from("listings")
    .select("photos")
    .eq("id", listingId)
    .eq("seller_id", user.id)
    .maybeSingle();
  if (readError) {
    console.error("listing read failed:", readError.code, readError.message);
    return { ok: false, errors: { form: TRY_AGAIN } };
  }
  if (!existing) return { ok: false, errors: { form: GONE } };

  const { data: updated, error } = await supabase
    .from("listings")
    .update(values)
    .eq("id", listingId)
    .eq("seller_id", user.id)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("listing update failed:", error.code, error.message);
    return { ok: false, errors: { form: TRY_AGAIN } };
  }
  if (!updated) return { ok: false, errors: { form: GONE } };

  // Only after the update worked: delete photos that are no longer used.
  const removed = (existing.photos as string[]).filter((p) => !values.photos.includes(p));
  await removePhotos(supabase, removed);

  refreshAll();
  return { ok: true, id: listingId };
}

// Mark sold (sold), unlist (hidden), or relist (active).
export async function setListingStatus(listingId: string, status: ListingStatus): Promise<ActionResult> {
  const session = await getSignedInUser();
  if (!session) return { ok: false, error: SIGNED_OUT };
  if (!isUuid(listingId)) return { ok: false, error: GONE };
  if (!(STATUSES as readonly string[]).includes(status)) return { ok: false, error: "That isn't a valid status." };

  // .eq("seller_id", ...) means you can only change your own listing. RLS
  // enforces the same rule in the database.
  const { data, error } = await session.supabase
    .from("listings")
    .update({ status })
    .eq("id", listingId)
    .eq("seller_id", session.user.id)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("listing status update failed:", error.code, error.message);
    return { ok: false, error: "We couldn't update that listing. Try again in a minute." };
  }
  if (!data) return { ok: false, error: GONE };

  refreshAll();
  return { ok: true };
}

// Delete a listing for good, and its photos.
export async function deleteListing(listingId: string): Promise<ActionResult> {
  const session = await getSignedInUser();
  if (!session) return { ok: false, error: SIGNED_OUT };
  if (!isUuid(listingId)) return { ok: false, error: GONE };

  const { data, error } = await session.supabase
    .from("listings")
    .delete()
    .eq("id", listingId)
    .eq("seller_id", session.user.id)
    .select("photos")
    .maybeSingle();
  if (error) {
    console.error("listing delete failed:", error.code, error.message);
    return { ok: false, error: "We couldn't delete that listing. Try again in a minute." };
  }
  if (!data) return { ok: false, error: GONE };

  await removePhotos(session.supabase, data.photos as string[]);

  refreshAll();
  return { ok: true };
}
