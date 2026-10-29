// Browse filters live in the URL (/?q=lamp&cat=Furniture&area=...&max=50&sort=low)
// so they survive a refresh and the back button. Shared by the server page
// and the client search / filter sheet.
import { AREAS } from "@/lib/areas";
import { CATEGORIES } from "@/lib/listings";

export const SORTS = [
  { value: "new", label: "Newest first" },
  { value: "low", label: "Price: low to high" },
  { value: "high", label: "Price: high to low" },
] as const;
export type Sort = (typeof SORTS)[number]["value"];

export type Filters = {
  q: string;
  cat: string; // "All" or a category
  area: string; // "Anywhere" or an area
  max: string; // "" or whole dollars
  sort: Sort;
};

export const DEFAULT_FILTERS: Filters = { q: "", cat: "All", area: "Anywhere", max: "", sort: "new" };
export const Q_MAX = 60;

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

// Read filters from search params, ignoring anything unexpected.
export function parseFilters(sp: Record<string, string | string[] | undefined>): Filters {
  const cat = one(sp.cat);
  const area = one(sp.area);
  const max = one(sp.max).trim();
  const sort = one(sp.sort);
  return {
    q: one(sp.q).slice(0, Q_MAX),
    cat: (CATEGORIES as readonly string[]).includes(cat) ? cat : "All",
    area: (AREAS as readonly string[]).includes(area) ? area : "Anywhere",
    max: /^\d{1,5}$/.test(max) ? String(Number(max)) : "",
    sort: SORTS.some((s) => s.value === sort) ? (sort as Sort) : "new",
  };
}

// The URL for a set of filters. Defaults are left out to keep URLs short.
export function browseHref(f: Filters) {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.cat !== "All") p.set("cat", f.cat);
  if (f.area !== "Anywhere") p.set("area", f.area);
  if (f.max) p.set("max", f.max);
  if (f.sort !== "new") p.set("sort", f.sort);
  const s = p.toString();
  return s ? `/?${s}` : "/";
}

// Is anything set in the filter sheet? (Shows the red dot on the button.)
export const sheetActive = (f: Filters) => f.area !== "Anywhere" || f.max !== "" || f.sort !== "new";
export const anyActive = (f: Filters) => sheetActive(f) || f.q.trim() !== "" || f.cat !== "All";

// Turn what the student typed into something safe for a database search:
// keep letters, numbers, and a little punctuation, and write course numbers
// the way they're saved ("acct2101" -> "ACCT 2101").
export function searchText(q: string) {
  const clean = q
    .replace(/[^\p{L}\p{N}\s\-'&.$#]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const course = /^([a-z]{2,5}) ?(\d{4}[a-z]?)$/i.exec(clean);
  return course ? `${course[1]} ${course[2]}`.toUpperCase() : clean;
}
