// Server-only helpers for reading listings and their photos.
import type { SupabaseClient } from "@supabase/supabase-js";
import { PHOTO_BUCKET, type Listing } from "@/lib/listings";

// Columns for every listing query, plus the seller's name from profiles.
// Never add profiles.email here: students can't read it (0003_listings.sql).
export const LISTING_SELECT =
  "id, seller_id, title, description, price, category, condition, pickup_area, course, available_from, status, photos, created_at, updated_at, seller:profiles(name)";

export type ListingRow = Listing & { seller: { name: string } | null };

// Photos are in a private bucket, so each one needs a signed URL. Signed URLs
// last an hour, plenty for one page view (the page re-signs on each render).
const SIGNED_URL_SECONDS = 3600;

async function signPaths(supabase: SupabaseClient, paths: string[]) {
  const urls = new Map<string, string>();
  const unique = [...new Set(paths)];
  if (!unique.length) return urls;
  // One request for every photo on the page, instead of one per photo.
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(unique, SIGNED_URL_SECONDS);
  if (error) {
    console.error("signing photo URLs failed:", error.message);
    return urls;
  }
  for (const item of data ?? []) {
    if (item.path && item.signedUrl && !item.error) urls.set(item.path, item.signedUrl);
  }
  return urls;
}

// For grids and lists: adds coverUrl (the first photo) to each listing.
export async function withCoverUrls<T extends Pick<Listing, "photos">>(supabase: SupabaseClient, listings: T[]) {
  const urls = await signPaths(
    supabase,
    listings.map((l) => l.photos[0]).filter(Boolean),
  );
  return listings.map((l) => ({ ...l, coverUrl: urls.get(l.photos[0]) ?? null }));
}

// For the listing page: signed URLs for every photo, in order.
export async function photoUrls(supabase: SupabaseClient, listing: Pick<Listing, "photos">) {
  const urls = await signPaths(supabase, listing.photos);
  return listing.photos.map((p) => urls.get(p) ?? null);
}

// Best-effort cleanup of photos in storage. Never throws: a leftover file is
// better than a failed delete or save.
export async function removePhotos(supabase: SupabaseClient, paths: string[]) {
  if (!paths.length) return;
  const { error } = await supabase.storage.from(PHOTO_BUCKET).remove(paths);
  if (error) console.error("removing photos failed:", error.message);
}
