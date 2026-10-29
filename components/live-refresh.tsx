"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// One Realtime channel for "listings changed" news.
export const LIVE_TOPIC = "listings-live";
export const LIVE_EVENT = "changed";

// Keeps Browse and Move-in up to date. When any listing is posted, edited,
// or deleted, Supabase Realtime tells this browser, and we re-render the
// page from the server (router.refresh keeps scroll position and inputs).
//
// Realtime only sends a change if this student is allowed to see the new
// row (RLS). A listing that was just marked sold or unlisted is no longer
// visible to other students, so they'd never hear about it. To cover that,
// sellers also send a tiny broadcast (announceListingsChanged below).
export function LiveRefresh() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;

    // Several changes in a row (e.g. a seller editing) cause one refresh.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refreshSoon = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 500);
    };

    const channel = supabase
      .channel(LIVE_TOPIC)
      .on("postgres_changes", { event: "*", schema: "public", table: "listings" }, refreshSoon)
      .on("broadcast", { event: LIVE_EVENT }, refreshSoon)
      .subscribe();

    // Runs when the page is left or hidden: stop listening.
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}

// Tell everyone's open feeds to refresh. Called after marking sold,
// unlisting, relisting, or deleting. Best effort: if it fails, feeds catch
// up on their next refresh.
export async function announceListingsChanged() {
  const supabase = createClient();
  if (!supabase) return;
  const channel = supabase.channel(LIVE_TOPIC);
  const wasJoined = channel.state === "joined";
  try {
    // httpSend reports most failures in its result instead of throwing.
    const res = await channel.httpSend(LIVE_EVENT, { at: Date.now() });
    if (!res.success) console.warn("live update broadcast failed:", res.status, res.error);
  } catch (err) {
    console.warn("live update broadcast failed:", err);
  } finally {
    // Don't tear down a channel LiveRefresh is using.
    if (!wasJoined) supabase.removeChannel(channel);
  }
}
