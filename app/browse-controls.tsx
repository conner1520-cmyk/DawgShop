"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { CloseIcon, FilterIcon } from "@/components/icons";
import { AREAS } from "@/lib/areas";
import { DEFAULT_FILTERS, Q_MAX, SORTS, browseHref, sheetActive, type Filters, type Sort } from "@/lib/browse";

// The search box, the filter button, and the filter sheet on Browse.
// The page itself is rendered on the server from the URL; these controls
// just change the URL.
export function BrowseControls({ filters }: { filters: Filters }) {
  const router = useRouter();
  const [q, setQ] = useState(filters.q);
  // The q we last put in the URL, and the q the server last rendered. When
  // the URL changes from somewhere else (e.g. Clear filters), copy it into
  // the box, but don't clobber what's being typed right now.
  const [sentQ, setSentQ] = useState(filters.q);
  const [propQ, setPropQ] = useState(filters.q);
  if (filters.q !== propQ) {
    setPropQ(filters.q);
    if (filters.q !== sentQ) {
      setQ(filters.q);
      setSentQ(filters.q);
    }
  }

  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const filterBtn = useRef<HTMLButtonElement>(null);

  function go(next: Filters) {
    router.replace(browseHref(next), { scroll: false });
  }

  function search(value: string, delay: number) {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setSentQ(value);
      go({ ...filters, q: value });
    }, delay);
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  // If the student leaves Browse with the sheet open, close it, so it isn't
  // still open when they come back (Next.js keeps the page around).
  useLayoutEffect(() => () => setOpen(false), []);

  // Stable, so the sheet's focus effect runs only when it opens.
  const closeSheet = useCallback(() => {
    setOpen(false);
    filterBtn.current?.focus();
  }, []);

  return (
    <>
      <form
        className="search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          search(q, 0);
          (document.activeElement as HTMLElement | null)?.blur();
        }}
      >
        <label className="sr" htmlFor="q">
          Search listings
        </label>
        <input
          id="q"
          type="search"
          placeholder="Search or try ACCT 2101"
          enterKeyHint="search"
          autoComplete="off"
          maxLength={Q_MAX}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            search(e.target.value, 350);
          }}
        />
        <button
          ref={filterBtn}
          type="button"
          className="iconbtn"
          aria-label={sheetActive(filters) ? "Filters (on)" : "Filters"}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <FilterIcon />
          {sheetActive(filters) && <span className="dot" />}
        </button>
      </form>
      {open && (
        <FilterSheet
          filters={filters}
          onClose={closeSheet}
          onApply={(f) => {
            setOpen(false);
            go({ ...filters, ...f });
          }}
          onClear={() => {
            setOpen(false);
            setQ("");
            setSentQ("");
            go(DEFAULT_FILTERS);
          }}
        />
      )}
    </>
  );
}

function FilterSheet({
  filters,
  onClose,
  onApply,
  onClear,
}: {
  filters: Filters;
  onClose: () => void;
  onApply: (f: Pick<Filters, "area" | "max" | "sort">) => void;
  onClear: () => void;
}) {
  const [area, setArea] = useState(filters.area);
  const [max, setMax] = useState(filters.max);
  const [sort, setSort] = useState<Sort>(filters.sort);
  const first = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function apply() {
    const m = max.trim();
    onApply({ area, max: /^\d{1,5}$/.test(m) ? String(Number(m)) : "", sort });
  }

  // Rendered straight into <body>: these controls live inside the sticky
  // header, whose stacking layer would otherwise trap the sheet under the
  // bottom tab bar and hide the Clear / Show results buttons.
  return createPortal(
    <div className="sheet">
      <div className="scrim" onClick={onClose} />
      <div className="panel" role="dialog" aria-modal="true" aria-labelledby="filters-title">
        <div className="panelhead">
          <h2 id="filters-title">Filters</h2>
          <button type="button" className="iconbtn" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            apply();
          }}
        >
          <label className="l" htmlFor="fa">
            Pickup spot
          </label>
          <select ref={first} className="in" id="fa" value={area} onChange={(e) => setArea(e.target.value)}>
            <option>Anywhere</option>
            {AREAS.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
          <label className="l" htmlFor="fm">
            Max price
          </label>
          <div className="money">
            <span>$</span>
            <input
              className="in"
              id="fm"
              inputMode="numeric"
              placeholder="Any price"
              maxLength={5}
              value={max}
              onChange={(e) => setMax(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          <label className="l" htmlFor="fs">
            Sort by
          </label>
          <select className="in" id="fs" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <div className="actions" style={{ padding: "20px 0 0" }}>
            <button type="button" className="btn secondary" onClick={onClear}>
              Clear
            </button>
            <button type="submit" className="btn dark">
              Show results
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
