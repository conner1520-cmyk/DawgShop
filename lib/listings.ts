// Listing rules and display helpers shared by the server and the browser.
// The database (supabase/migrations/0003_listings.sql) repeats the main
// limits, so keep the two in sync.
import { AREAS } from "@/lib/areas";

export const CATEGORIES = [
  "Furniture",
  "Dorm essentials",
  "Electronics",
  "Textbooks",
  "Clothes",
  "Free",
  "Other",
] as const;
export const CONDITIONS = ["New", "Like new", "Used"] as const;
export const STATUSES = ["active", "sold", "hidden"] as const;

export type Category = (typeof CATEGORIES)[number];
export type Condition = (typeof CONDITIONS)[number];
export type ListingStatus = (typeof STATUSES)[number];

export const TITLE_MAX = 70;
export const DESCRIPTION_MAX = 2000;
export const PRICE_MAX = 10000;
export const COURSE_MAX = 20;
export const PHOTOS_MAX = 5;
export const PHOTO_BUCKET = "listing-photos";

// A row from public.listings.
export type Listing = {
  id: string;
  seller_id: string;
  title: string;
  description: string;
  price: number;
  category: Category;
  condition: Condition;
  pickup_area: string;
  course: string | null;
  available_from: string | null; // 'YYYY-MM-DD'
  status: ListingStatus;
  photos: string[];
  created_at: string;
  updated_at: string;
};

// What the sell form sends. Everything is a string or list of strings,
// exactly as typed, so the server can check it before trusting it.
export type ListingInput = {
  title: string;
  price: string;
  category: string;
  condition: string;
  pickup_area: string;
  course: string;
  description: string;
  available_later: boolean;
  available_from: string;
  photos: string[];
};

// The cleaned-up values, ready to insert or update.
export type ListingValues = {
  title: string;
  price: number;
  category: Category;
  condition: Condition;
  pickup_area: string;
  course: string | null;
  description: string;
  available_from: string | null;
  photos: string[];
};

export type ListingField =
  | "title"
  | "price"
  | "category"
  | "condition"
  | "pickup_area"
  | "course"
  | "description"
  | "available_from"
  | "photos";

export type ListingErrors = Partial<Record<ListingField | "form", string>>;

export type ValidationResult =
  | { ok: true; values: Omit<ListingValues, "photos"> }
  | { ok: false; errors: ListingErrors };

const includes = <T extends string>(list: readonly T[], value: string): value is T =>
  (list as readonly string[]).includes(value);

// "acct2101" or "acct  2101" -> "ACCT 2101", so course searches match.
export function normalizeCourse(raw: string) {
  const upper = raw.trim().toUpperCase().replace(/\s+/g, " ");
  const m = /^([A-Z]{2,5}) ?(\d{4}[A-Z]?)$/.exec(upper);
  return m ? `${m[1]} ${m[2]}` : upper;
}

function isRealDate(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// Checks every field except photos. The sell form runs this before uploading
// anything, and the server runs it again (as part of validateListing).
export function validateFields(input: ListingInput): ValidationResult {
  const errors: ListingErrors = {};

  const title = String(input.title ?? "").trim().replace(/\s+/g, " ");
  if (!title) errors.title = "Add a title so buyers know what it is.";
  else if (title.length > TITLE_MAX) errors.title = `Keep the title under ${TITLE_MAX} characters.`;

  const priceText = String(input.price ?? "").trim();
  const price = Number(priceText);
  if (!/^\d+$/.test(priceText)) errors.price = "Enter a whole-dollar price. Use 0 to give it away.";
  else if (price > PRICE_MAX) errors.price = `Prices on DawgShop top out at $${PRICE_MAX.toLocaleString("en-US")}.`;

  const rawCategory = String(input.category ?? "");
  if (!includes(CATEGORIES, rawCategory)) errors.category = "Choose a category.";

  const condition = String(input.condition ?? "");
  if (!includes(CONDITIONS, condition)) errors.condition = "Choose the condition.";

  const area = String(input.pickup_area ?? "");
  if (!includes(AREAS, area)) errors.pickup_area = "Choose where buyers can pick it up.";

  // Course numbers only make sense for textbooks; drop them otherwise.
  let course: string | null = null;
  if (rawCategory === "Textbooks") {
    course = normalizeCourse(String(input.course ?? "")) || null;
    if (course && course.length > COURSE_MAX) errors.course = `Keep the course number under ${COURSE_MAX} characters.`;
  }

  const description = String(input.description ?? "").trim();
  if (description.length > DESCRIPTION_MAX) {
    errors.description = `Keep the description under ${DESCRIPTION_MAX.toLocaleString("en-US")} characters.`;
  }

  let available_from: string | null = null;
  if (input.available_later) {
    const from = String(input.available_from ?? "").trim();
    if (!from) errors.available_from = "Choose the date it becomes available.";
    else if (!isRealDate(from)) errors.available_from = "Choose a real date.";
    else if (from < todayISO()) errors.available_from = "That date has passed. Choose today or later, or turn off Available later.";
    else available_from = from;
  }

  if (Object.keys(errors).length) return { ok: false, errors };

  // Prototype rule: anything given away for $0 is "Free", except textbooks,
  // which stay findable by course.
  const category: Category =
    price === 0 && rawCategory !== "Textbooks" ? "Free" : (rawCategory as Category);

  return {
    ok: true,
    values: {
      title,
      price,
      category,
      condition: condition as Condition,
      pickup_area: area,
      course,
      description,
      available_from,
    },
  };
}

// A photo path must be '<this user's id>/<uuid>.jpg' (what the sell form
// uploads). That stops anyone from attaching another student's photos.
const PHOTO_NAME = /^[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$/i;

export function validatePhotos(photos: unknown, userId: string): string | null {
  if (!Array.isArray(photos) || photos.length === 0) return "Add at least one photo.";
  if (photos.length > PHOTOS_MAX) return `You can add up to ${PHOTOS_MAX} photos.`;
  const prefix = `${userId}/`;
  const ok = photos.every(
    (p) => typeof p === "string" && p.startsWith(prefix) && PHOTO_NAME.test(p.slice(prefix.length)),
  );
  if (!ok) return "One of the photos didn't upload correctly. Remove it and add it again.";
  if (new Set(photos).size !== photos.length) return "The same photo is in there twice. Remove one.";
  return null;
}

// The full server-side check. Never trust the browser: the server action
// calls this with the user id from the session, not from the form.
export function validateListing(
  input: ListingInput,
  userId: string,
): { ok: true; values: ListingValues } | { ok: false; errors: ListingErrors } {
  const fields = validateFields(input);
  const photoError = validatePhotos(input?.photos, userId);
  if (!fields.ok || photoError) {
    const errors: ListingErrors = fields.ok ? {} : { ...fields.errors };
    if (photoError) errors.photos = photoError;
    return { ok: false, errors };
  }
  return { ok: true, values: { ...fields.values, photos: [...input.photos] } };
}

// ---------------------------------------------------------------------------
// Display helpers, ported from the prototype.
// ---------------------------------------------------------------------------

const DAY = 864e5;

export const money = (n: number) => (n === 0 ? "Free" : `$${n.toLocaleString("en-US")}`);

// "today", "yesterday", "3d ago", "2w ago"
export function ago(timestamp: string | number) {
  const t = typeof timestamp === "number" ? timestamp : Date.parse(timestamp);
  const d = Math.floor((Date.now() - t) / DAY);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 7) return `${d}d ago`;
  return `${Math.floor(d / 7)}w ago`;
}

// Today's date in Athens, GA as 'YYYY-MM-DD'. Servers run in UTC, so asking
// for "today" without a time zone would flip to tomorrow at 8pm Eastern.
export function todayISO(now: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

// A move-in listing: available on a date after today.
export const future = (l: Pick<Listing, "available_from">) =>
  !!l.available_from && l.available_from > todayISO();

// 'YYYY-MM-DD' -> "Dec 15". Formatted in UTC so the date never shifts a day.
export const fmt = (s: string) =>
  new Date(`${s}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

// 'YYYY-MM-DD' -> "December 2026", for the Move-in month headings.
export const monthLabel = (s: string) =>
  new Date(`${s}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

// The prototype's soft background colors behind photos (t0-t5), picked from the id.
export function tileClass(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
  return `t${Math.abs(h) % 6}`;
}

export const statusLabel = (s: ListingStatus) => (s === "sold" ? "Sold" : s === "hidden" ? "Unlisted" : "Active");

export const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
