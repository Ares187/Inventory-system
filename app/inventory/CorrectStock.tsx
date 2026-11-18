
"use client";

import { useState } from "react";

type Props = {
  productId: number;
  productName: string;
  storeId: number;
  storeName: string;
  currentQuantity: number;
  onCorrected: () => void;
};

export default function CorrectStock({
  productId,
  productName,
  storeId,
  storeName,
  currentQuantity,
  onCorrected,
}: Props) {
  const [quantity, setQuantity] = useState("");
  const [loading, setLoading] = useState(false);

  async function correctStock() {
    const newQuantity = Number(quantity);

    if (
      quantity.trim() === "" ||
      !Number.isSafeInteger(newQuantity) ||
      newQuantity < 0
    ) {
      alert("Enter a valid quantity of zero or greater.");
      return;
    }

    if (newQuantity === currentQuantity) {
      alert("Inventory is already at that quantity.");
      return;
    }

    const confirmed = window.confirm(
      `Correct ${productName} at ${storeName} ` +
      `from ${currentQuantity} to ${newQuantity} pairs?`
    );

    if (!confirmed) return;

    setLoading(true);

    try {
      const response = await fetch("/api/inventory/correct", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          storeId,
          productId,
          newQuantity,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Correction failed");
      }

      setQuantity("");
      onCorrected();
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Correction failed"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        gap: "6px",
        alignItems: "center",
      }}
    >
      <input
        type="number"
        min="0"
        step="1"
        placeholder="New qty"
        aria-label="Correct inventory quantity"
        value={quantity}
        onChange={(event) =>
          setQuantity(event.target.value)
        }
        disabled={loading}
        style={{
          width: "75px",
          padding: "6px",
        }}
      />

      <button
        type="button"
        onClick={correctStock}
        disabled={loading || quantity.trim() === ""}
      >
        {loading ? "..." : "Correct"}
      </button>
    </div>
  );
}
