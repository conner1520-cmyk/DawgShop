"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// A random suffix for channel names. Supabase reuses a channel that has the
// same name, and two screens (say, the inbox and the tab bar) must not share
// one. Math.random instead of crypto.randomUUID, which phones opening the dev
// server over plain http (not localhost) don't have.
export const channelSuffix = () => Math.random().toString(36).slice(2);

// Calls onChange (debounced) whenever one of your chats changes: a new last
// message, or a chat marked read. Realtime only sends rows you can read
// (RLS), so this only fires for your own chats.
export function useConversationChanges(onChange: () => void, enabled = true) {
  const latest = useRef(onChange);
  useEffect(() => {
    latest.current = onChange;
  });

  useEffect(() => {
    if (!enabled) return;
    const supabase = createClient();
    if (!supabase) return;

    // Several changes in a row (a message, then a read stamp) cause one call.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const soon = () => {
      clearTimeout(timer);
      timer = setTimeout(() => latest.current(), 400);
    };

    const channel = supabase
      .channel(`conversations-${channelSuffix()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, soon)
      .subscribe();

    // Runs when the page is left or hidden: stop listening.
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [enabled]);
}

// Keeps the Messages inbox up to date by re-rendering it from the server when
// a chat changes. Next.js keeps recently visited pages alive in the
// background; when the inbox is shown again, it refreshes once to catch up.
export function InboxLive() {
  const router = useRouter();
  const shownBefore = useRef(false);

  useEffect(() => {
    if (shownBefore.current) router.refresh();
    shownBefore.current = true;
  }, [router]);

  useConversationChanges(() => router.refresh());
  return null;
}
