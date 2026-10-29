import Link from "next/link";
import { ago, fmt, future, money, tileClass, type Listing } from "@/lib/listings";

export type CardListing = Pick<
  Listing,
  "id" | "title" | "price" | "pickup_area" | "created_at" | "available_from"
> & { coverUrl: string | null };

// The red price tag, or a green "Free" tag at $0.
export function PriceTag({ price, large }: { price: number; large?: boolean }) {
  return <span className={`tag${price === 0 ? " free" : ""}${large ? " lg" : ""}`}>{money(price)}</span>;
}

// A cover photo, or the colored square if the photo couldn't be loaded.
export function Cover({ url, alt = "" }: { url: string | null; alt?: string }) {
  if (!url) return <span aria-hidden="true">📦</span>;
  // Plain <img>: photos are short-lived signed URLs from a private bucket,
  // which next/image's optimizer would cache past their expiry.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} loading="lazy" decoding="async" />;
}

// One square in the Browse / Move-in grid (prototype: card()).
export function ListingCard({ listing: l }: { listing: CardListing }) {
  return (
    <Link href={`/listings/${l.id}`} className="card">
      <div className={`tile ${tileClass(l.id)}`}>
        <Cover url={l.coverUrl} />
        <PriceTag price={l.price} />
      </div>
      <h3>{l.title}</h3>
      <div className="meta">
        {l.pickup_area}, {ago(l.created_at)}
      </div>
      {future(l) && l.available_from && <span className="badge">Available {fmt(l.available_from)}</span>}
    </Link>
  );
}
