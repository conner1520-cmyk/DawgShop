"use client";

import { useRouter } from "next/navigation";
import { BackIcon } from "@/components/icons";

// Goes back like the browser's back button. If this page was opened
// directly (a shared link, a new tab), goes to `fallback` instead.
export function BackButton({ fallback = "/" }: { fallback?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="iconbtn"
      aria-label="Back"
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push(fallback);
      }}
    >
      <BackIcon />
    </button>
  );
}
