"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getUnreadCount } from "@/app/messages/actions";
import { BrowseIcon, MeIcon, MessageIcon, MoveInIcon, PlusIcon } from "@/components/icons";
import { useConversationChanges } from "@/components/messages-live";

type Tab = "browse" | "movein" | "sell" | "messages" | "me";

// Screens without the tab bar: signing in and account setup.
const NO_TABS = ["/signin", "/welcome", "/set-password", "/auth"];

// A chat (/messages/<id>) hides the tab bar too, like the prototype: the
// message box sits where the tabs would be.
const isThread = (pathname: string) => pathname.startsWith("/messages/");

function currentTab(pathname: string): Tab | null {
  if (pathname === "/move-in") return "movein";
  if (pathname === "/sell") return "sell";
  if (pathname === "/messages") return "messages";
  if (pathname === "/me" || pathname.endsWith("/edit")) return "me";
  if (pathname === "/" || pathname.startsWith("/listings/")) return "browse";
  return null;
}

// Whether any chat has unread messages. Checked on every page change and
// whenever one of your chats changes (Realtime). Any error means "no dot".
function useHasUnread(enabled: boolean, pathname: string) {
  const [unread, setUnread] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    getUnreadCount()
      .then((n) => {
        if (!cancelled) setUnread(n > 0);
      })
      .catch(() => {
        if (!cancelled) setUnread(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, pathname]);

  useConversationChanges(() => {
    getUnreadCount()
      .then((n) => setUnread(n > 0))
      .catch(() => setUnread(false));
  }, enabled);

  return enabled && unread;
}

// The bottom tab bar from the prototype (#tabs).
export function TabBar() {
  const pathname = usePathname();
  const signedOutScreen = NO_TABS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const unread = useHasUnread(!signedOutScreen, pathname);
  if (signedOutScreen || isThread(pathname)) return null;
  const cur = currentTab(pathname);
  const current = (t: Tab) => (cur === t ? ("page" as const) : undefined);

  return (
    <>
      {/* Keeps the last bit of each page from hiding behind the fixed bar. */}
      <div className="tabspace" aria-hidden="true" />
      <nav id="tabs" aria-label="Main">
        <Link href="/" className="tab" aria-current={current("browse")}>
          <BrowseIcon />
          <span>Browse</span>
        </Link>
        <Link href="/move-in" className="tab" aria-current={current("movein")}>
          <MoveInIcon />
          <span>Move-in</span>
        </Link>
        <Link href="/sell" className="tab" aria-current={current("sell")}>
          <span className="plus">
            <PlusIcon />
          </span>
          <span>Sell</span>
        </Link>
        <Link href="/messages" className="tab" aria-current={current("messages")}>
          <MessageIcon />
          {unread && <span className="dot" aria-hidden="true" />}
          <span>Messages</span>
          {unread && <span className="sr">, unread messages</span>}
        </Link>
        <Link href="/me" className="tab" aria-current={current("me")}>
          <MeIcon />
          <span>Me</span>
        </Link>
      </nav>
    </>
  );
}
