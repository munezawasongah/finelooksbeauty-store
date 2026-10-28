"use client";

import dynamic from "next/dynamic";

/** Loads the 3D store only in the browser, so three.js never enters other pages' bundles. */
const StoreTour = dynamic(() => import("./StoreTour"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(120%_90%_at_50%_0%,#3a22b8_0%,#1e1433_65%)]">
      <span className="h-1.5 w-40 overflow-hidden rounded-full bg-white/15">
        <span className="block h-full w-1/4 animate-pulse rounded-full bg-orchid-400" />
      </span>
    </div>
  ),
});

export function TourLoader() {
  return <StoreTour />;
}
