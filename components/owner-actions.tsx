"use client";

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteListing, setListingStatus } from "@/app/listings/actions";
import { announceListingsChanged } from "@/components/live-refresh";
import type { ListingStatus } from "@/lib/listings";

const DONE: Record<ListingStatus, string> = {
  sold: "Marked as sold.",
  hidden: "Listing hidden from buyers.",
  active: "Listing is live again.",
};

// The seller's buttons for one of their own listings: Edit, Mark sold /
// Unlist (or Relist), and Delete. Used on the listing page ("detail") and in
// the Me page rows ("row", smaller buttons).
export function OwnerActions({
  id,
  title,
  status,
  variant,
}: {
  id: string;
  title: string;
  status: ListingStatus;
  variant: "detail" | "row";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Next.js keeps visited pages around; don't come back to a half-finished
  // delete or an old message.
  useLayoutEffect(
    () => () => {
      setConfirmDelete(false);
      setError("");
      setDone("");
    },
    [],
  );
  useEffect(() => () => clearTimeout(resetTimer.current), []);

  const size = variant === "row" ? " small" : "";

  function changeStatus(next: ListingStatus) {
    setConfirmDelete(false);
    setError("");
    setDone("");
    startTransition(async () => {
      const res = await setListingStatus(id, next);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDone(DONE[next]);
      void announceListingsChanged();
    });
  }

  function onDelete() {
    setError("");
    setDone("");
    // First tap asks for confirmation, like the prototype.
    if (!confirmDelete) {
      setConfirmDelete(true);
      clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setConfirmDelete(false), 6000);
      return;
    }
    clearTimeout(resetTimer.current);
    startTransition(async () => {
      const res = await deleteListing(id);
      if (!res.ok) {
        setConfirmDelete(false);
        setError(res.error);
        return;
      }
      void announceListingsChanged();
      if (variant === "detail") router.replace("/me?notice=deleted");
    });
  }

  const deleteBtn = (
    <button
      type="button"
      className={`btn secondary${size}${confirmDelete ? " danger" : ""}`}
      style={variant === "detail" ? { flexBasis: "100%" } : undefined}
      onClick={onDelete}
      disabled={pending}
      aria-label={confirmDelete ? `Tap again to delete ${title}` : `Delete ${title}`}
    >
      {confirmDelete ? "Tap again to delete" : "Delete"}
    </button>
  );

  return (
    <div className={variant === "row" ? "acts" : "actions"} aria-busy={pending || undefined}>
      <Link href={`/listings/${id}/edit`} className={`btn secondary${size}`} aria-label={`Edit ${title}`}>
        Edit
      </Link>
      {status === "active" ? (
        <>
          <button type="button" className={`btn secondary${size}`} onClick={() => changeStatus("sold")} disabled={pending}>
            Mark sold
          </button>
          <button type="button" className={`btn secondary${size}`} onClick={() => changeStatus("hidden")} disabled={pending}>
            Unlist
          </button>
        </>
      ) : (
        <button
          type="button"
          className={`btn ${variant === "detail" ? "dark" : "secondary"}${size}`}
          onClick={() => changeStatus("active")}
          disabled={pending}
        >
          Relist
        </button>
      )}
      {deleteBtn}
      {error && (
        <div className="err" role="alert">
          {error}
        </div>
      )}
      <span className="sr" role="status">
        {done}
      </span>
    </div>
  );
}
