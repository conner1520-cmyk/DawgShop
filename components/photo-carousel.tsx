"use client";

import { useRef, useState } from "react";

// The big photo at the top of a listing. Swipe sideways between photos
// (CSS scroll-snap does the swiping); the dots show which one you're on and
// can be tapped.
export function PhotoCarousel({ urls, title }: { urls: (string | null)[]; title: string }) {
  const [index, setIndex] = useState(0);
  const strip = useRef<HTMLDivElement>(null);
  const photos = urls.filter((u): u is string => !!u);

  if (!photos.length) return <span aria-hidden="true">📦</span>;

  function onScroll() {
    const el = strip.current;
    if (!el || !el.clientWidth) return;
    setIndex(Math.round(el.scrollLeft / el.clientWidth));
  }

  function show(i: number) {
    const el = strip.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  }

  return (
    <>
      <div
        className="slides"
        ref={strip}
        onScroll={onScroll}
        tabIndex={photos.length > 1 ? 0 : undefined}
        aria-label={photos.length > 1 ? `Photos of ${title}, ${photos.length} total. Scroll sideways for more.` : undefined}
        role={photos.length > 1 ? "region" : undefined}
      >
        {photos.map((url, i) => (
          // Signed URLs from a private bucket; see components/listing-card.tsx.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={url}
            src={url}
            alt={photos.length > 1 ? `${title}, photo ${i + 1} of ${photos.length}` : title}
            loading={i === 0 ? "eager" : "lazy"}
          />
        ))}
      </div>
      {photos.length > 1 && (
        <div className="dots">
          {photos.map((url, i) => (
            <button
              key={url}
              type="button"
              aria-label={`Show photo ${i + 1}`}
              aria-current={i === index ? "true" : undefined}
              onClick={() => show(i)}
            />
          ))}
        </div>
      )}
    </>
  );
}
