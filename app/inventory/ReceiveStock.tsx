
"use client";

import { useState } from "react";

type ReceiveStockProps = {
  productId: number;
  productName: string;
  storeId: number;
  storeName: string;
  onReceived: () => void;
};

export default function ReceiveStock({
  productId,
  productName,
  storeId,
  storeName,
  onReceived,
}: ReceiveStockProps) {
  const [quantity, setQuantity] = useState("");
  const [upc, setUpc] = useState("");
  const [loading, setLoading] = useState(false);

  const handleReceive = async () => {
    const amount = Number(quantity);
    const normalizedUpc = upc.trim();

    if (
      !quantity.trim() ||
      !Number.isSafeInteger(amount) ||
      amount <= 0
    ) {
      alert("Enter a valid number of pairs.");
      return;
    }

    if (
      normalizedUpc &&
      !/^[0-9]{12,14}$/.test(normalizedUpc)
    ) {
      alert("UPC must contain 12 to 14 digits.");
      return;
    }

    const confirmed = window.confirm(
      `Receive ${amount} pairs of ${productName} at ${storeName}?`
    );

    if (!confirmed) return;

    setLoading(true);

    try {
      const response = await fetch("/api/inventory/receive", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          productId,
          storeId,
          quantity: amount,
          upc: normalizedUpc || null,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Receiving failed");
      }

      setQuantity("");
      setUpc("");
      onReceived();
      alert("Stock received successfully.");
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Unable to receive stock."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <input
        type="number"
        min="1"
        step="1"
        placeholder="Pairs"
        value={quantity}
        disabled={loading}
        onChange={(event) => setQuantity(event.target.value)}
        style={{
          width: 80,
          padding: 8,
          border: "1px solid #d1d5db",
          borderRadius: 6,
          color: "#111827",
          background: "white",
        }}
      />

      <input
        type="text"
        inputMode="numeric"
        placeholder="UPC (optional)"
        value={upc}
        disabled={loading}
        onChange={(event) => setUpc(event.target.value)}
        style={{
          width: 160,
          padding: 8,
          border: "1px solid #d1d5db",
          borderRadius: 6,
          color: "#111827",
          background: "white",
        }}
      />

      <button
        type="button"
        onClick={handleReceive}
        disabled={loading}
        style={{
          padding: "8px 12px",
          background: "#111827",
          color: "white",
          border: "none",
          borderRadius: 6,
          cursor: loading ? "wait" : "pointer",
        }}
      >
        {loading ? "Saving..." : "Receive"}
      </button>
    </div>
  );
}
