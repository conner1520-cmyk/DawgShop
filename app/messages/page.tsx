import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile, getSignedInUser } from "@/lib/auth";
import { signPaths } from "@/lib/listing-data";
import { tileClass } from "@/lib/listings";
import { CONVERSATION_SELECT, isUnread, otherName, shortTime, type ConversationRow } from "@/lib/messages";
import { Cover } from "@/components/listing-card";
import { InboxLive } from "@/components/messages-live";

export const metadata: Metadata = { title: "Messages - DawgShop" };

const LIMIT = 100;

function Header() {
  return (
    <header className="top">
      <h1>Messages</h1>
    </header>
  );
}

// The Messages inbox (#6): your chats, newest message first.
export default function MessagesPage() {
  return (
    <Suspense fallback={<Header />}>
      <Inbox />
    </Suspense>
  );
}

// Reads the session cookie, so it renders per request behind Suspense.
async function Inbox() {
  const session = await getSignedInUser();
  if (!session) redirect("/signin");
  if (!(await getProfile(session.supabase, session.user.id))) redirect("/welcome");
  const me = session.user.id;

  // RLS only returns chats you're in. Chats with no messages yet (someone
  // tapped "Message seller" but never sent anything) are left out.
  const { data, error } = await session.supabase
    .from("conversations")
    .select(CONVERSATION_SELECT)
    .not("last_message_at", "is", null)
    .order("last_message_at", { ascending: false })
    .limit(LIMIT);
  if (error) console.error("inbox query failed:", error.code, error.message);
  const chats = (data ?? []) as unknown as ConversationRow[];

  // The listing's cover photo, from the path saved when the chat started.
  // If the listing (and its photos) was deleted, the colored tile shows.
  const urls = await signPaths(
    session.supabase,
    chats.map((c) => c.listing_photo).filter((p): p is string => !!p),
  );

  return (
    <>
      <Header />
      <InboxLive />
      {error ? (
        <div className="empty">
          <h2>Messages didn&apos;t load</h2>
          <p>Check your connection, then refresh the page.</p>
        </div>
      ) : chats.length ? (
        chats.map((c) => {
          const unread = isUnread(c, me);
          const name = otherName(c, me);
          const preview = `${c.last_message_sender === me ? "You: " : ""}${c.last_message_preview ?? ""}`;
          return (
            <Link key={c.id} href={`/messages/${c.id}`} className={`row${unread ? " unread" : ""}`}>
              <span className={`thumb ${tileClass(c.listing_id ?? c.id)}`}>
                <Cover url={c.listing_photo ? (urls.get(c.listing_photo) ?? null) : null} />
              </span>
              <span className="rowtext">
                <span className="rowtop">
                  <b>{name}</b>
                  {c.last_message_at && <span className="meta">{shortTime(c.last_message_at)}</span>}
                </span>
                <span className="meta" style={{ display: "block" }}>
                  {c.listing_title}
                </span>
                <span className="meta preview" style={{ display: "block" }}>
                  {preview}
                </span>
                {unread && <span className="sr">Unread.</span>}
              </span>
            </Link>
          );
        })
      ) : (
        <div className="empty">
          <h2>No messages yet</h2>
          <p>Find something you like and message the seller. Your conversations show up here.</p>
          <Link href="/" className="btn primary">
            Browse listings
          </Link>
        </div>
      )}
    </>
  );
}
