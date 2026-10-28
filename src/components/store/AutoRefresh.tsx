"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-render the server page periodically (e.g. while waiting for the payment webhook). */
export function AutoRefresh({ everyMs, maxTries }: { everyMs: number; maxTries: number }) {
  const router = useRouter();
  useEffect(() => {
    let n = 0;
    const id = setInterval(() => {
      n += 1;
      if (n > maxTries) clearInterval(id);
      else router.refresh();
    }, everyMs);
    return () => clearInterval(id);
  }, [router, everyMs, maxTries]);
  return null;
}
