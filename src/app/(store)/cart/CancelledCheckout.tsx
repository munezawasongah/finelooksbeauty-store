"use client";

import { useEffect, useState } from "react";
import { releaseCancelledCheckout } from "../checkout/actions";

/** Returning from Stripe without paying: release the stock hold straight away. */
export function CancelledCheckout({ number, token }: { number: string; token: string }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    releaseCancelledCheckout(number, token).finally(() => setDone(true));
  }, [number, token]);
  return (
    <p className="mt-6 rounded-2xl bg-iris-50 px-4 py-3 text-sm font-semibold text-iris-800" role="status">
      Checkout was cancelled — you haven&apos;t been charged. {done ? "Your bag is just as you left it." : ""}
    </p>
  );
}
