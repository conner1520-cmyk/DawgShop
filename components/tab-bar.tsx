"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrowseIcon, MeIcon, MoveInIcon, PlusIcon } from "@/components/icons";

type Tab = "browse" | "movein" | "sell" | "me";

// Screens without the tab bar: signing in and account setup.
const NO_TABS = ["/signin", "/welcome", "/set-password", "/auth"];

function currentTab(pathname: string): Tab | null {
  if (pathname === "/move-in") return "movein";
  if (pathname === "/sell") return "sell";
  if (pathname === "/me" || pathname.endsWith("/edit")) return "me";
  if (pathname === "/" || pathname.startsWith("/listings/")) return "browse";
  return null;
}

// The bottom tab bar from the prototype (#tabs). Messages joins it in #6.
export function TabBar() {
  const pathname = usePathname();
  if (NO_TABS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;
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
        <Link href="/me" className="tab" aria-current={current("me")}>
          <MeIcon />
          <span>Me</span>
        </Link>
      </nav>
    </>
  );
}
