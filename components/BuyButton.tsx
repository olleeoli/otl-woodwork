"use client";

import { useState } from "react";

const STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN",
  "IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH",
  "NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT",
  "VT","VA","WA","WV","WI","WY",
];

/**
 * The state selector only appears when a sales-tax rate is configured. A
 * Square payment link is created before the buyer types an address, so the
 * destination has to be known here to decide whether tax applies. With no
 * rate set there is nothing to decide, and asking would be pure friction.
 */
export default function BuyButton({
  slug,
  taxRatePercent,
  shippingNote,
}: {
  slug: string;
  taxRatePercent: number;
  shippingNote: string;
}) {
  const needsState = taxRatePercent > 0;
  const [shipToState, setShipToState] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleBuy() {
    setError("");

    if (needsState && !shipToState) {
      setError("Pick the state this is shipping to first.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, shipToState }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start checkout.");
      // Hand off to Square's hosted page. No card details ever touch this site.
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start checkout.");
      setBusy(false);
    }
  }

  return (
    <div className="buy-block">
      {needsState && (
        <label className="buy-state">
          <span>Shipping to</span>
          <select
            value={shipToState}
            onChange={(e) => setShipToState(e.target.value)}
            disabled={busy}
          >
            <option value="">Select a state</option>
            {STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      )}

      <button
        type="button"
        className="btn btn-solid product-cta"
        onClick={handleBuy}
        disabled={busy}
      >
        {busy ? "Taking you to checkout…" : "Buy Now"}
      </button>

      {error && <p className="buy-error">{error}</p>}

      <p className="product-note">
        {shippingNote} Payment is handled by Square — card details never touch
        this site.
      </p>
    </div>
  );
}
