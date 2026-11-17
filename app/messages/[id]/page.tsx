import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile, getSignedInUser } from "@/lib/auth";
import { signPaths } from "@/lib/listing-data";
import { isUuid, tileClass } from "@/lib/listings";
import { CONVERSATION_SELECT, MESSAGE_SELECT, otherName, type ConversationRow, type Message } from "@/lib/messages";
import { BackButton } from "@/components/back-button";
import { Cover } from "@/components/listing-card";
import { Thread } from "./thread";

export const metadata: Metadata = { title: "Messages - DawgShop" };

// How many messages a chat loads: the newest 200.
const LIMIT = 200;

// One chat (#6): the listing at the top, then the messages, then the
// message box.
export default function ThreadPage({ params }: PageProps<"/messages/[id]">) {
  return (
    <Suspense
      fallback={
        <div className="threadhead">
          <BackButton fallback="/messages" />
        </div>
      }
    >
      <ThreadView params={params} />
    </Suspense>
  );
}

function NotAvailable() {
  return (
    <>
      <div className="bar">
        <BackButton fallback="/messages" />
      </div>
      <div className="empty">
        <h2>This conversation isn&apos;t available</h2>
        <p>It may have been removed, or it belongs to someone else.</p>
        <Link href="/messages" className="btn secondary">
          Back to Messages
        </Link>
      </div>
    </>
  );
}

// Reads the session cookie and the URL, so it renders per request behind Suspense.
async function ThreadView({ params }: { params: PageProps<"/messages/[id]">["params"] }) {
  const session = await getSignedInUser();
  if (!session) redirect("/signin");
  if (!(await getProfile(session.supabase, session.user.id))) redirect("/welcome");
  const me = session.user.id;

  const { id } = await params;
  if (!isUuid(id)) return <NotAvailable />;

  // RLS only returns the chat if you're its buyer or seller.
  const { data: convo, error } = await session.supabase
    .from("conversations")
    .select(CONVERSATION_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) console.error("conversation query failed:", error.code, error.message);
  const c = convo as unknown as ConversationRow | null;
  if (!c || (c.buyer_id !== me && c.seller_id !== me)) return <NotAvailable />;

  // The newest messages, then flipped into time order for display. The
  // listing check and the photo link run at the same time.
  const [msgs, listing, urls] = await Promise.all([
    session.supabase
      .from("messages")
      .select(MESSAGE_SELECT)
      .eq("conversation_id", id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(LIMIT),
    // Can you still open the listing? RLS shows it to you only while it's
    // active, or always if you're the seller. Deleted listings are gone.
    c.listing_id
      ? session.supabase.from("listings").select("id").eq("id", c.listing_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    signPaths(session.supabase, c.listing_photo ? [c.listing_photo] : []),
  ]);
  if (msgs.error) console.error("messages query failed:", msgs.error.code, msgs.error.message);
  if (listing.error) console.error("thread listing query failed:", listing.error.code, listing.error.message);
  const messages = ((msgs.data ?? []) as Message[]).reverse();
  const listingVisible = !!listing.data;
  const coverUrl = c.listing_photo ? (urls.get(c.listing_photo) ?? null) : null;
  const name = otherName(c, me);

  const summary = (
    <>
      <span className={`thumb ${tileClass(c.listing_id ?? c.id)}`}>
        <Cover url={coverUrl} />
      </span>
      <span className="rowtext">
        <b>{name}</b>
        <span className="meta" style={{ display: "block" }}>
          {c.listing_title}
        </span>
        {!listingVisible && (
          <span className="meta" style={{ display: "block" }}>
            No longer available
          </span>
        )}
      </span>
    </>
  );

  return (
    <>
      <div className="threadhead">
        <BackButton fallback="/messages" />
        {listingVisible && c.listing_id ? (
          <Link href={`/listings/${c.listing_id}`} className="listing" aria-label={`${name}, ${c.listing_title}. View listing`}>
            {summary}
          </Link>
        ) : (
          <div className="listing">{summary}</div>
        )}
      </div>
      {msgs.error ? (
        <div className="empty">
          <h2>Messages didn&apos;t load</h2>
          <p>Check your connection, then refresh the page.</p>
        </div>
      ) : (
        <Thread conversationId={c.id} me={me} otherName={name} initialMessages={messages} />
      )}
    </>
  );
}
