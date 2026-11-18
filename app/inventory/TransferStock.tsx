
"use client";

import { useState } from "react";

type Store = {
  id: number;
  name: string;
};

type Props = {
  productId: number;
  productName: string;
  storeId: number;
  storeName: string;
  availableQuantity: number;
  stores: Store[];
  onTransferred: () => void;
};

export default function TransferStock({
  productId,
  productName,
  storeId,
  storeName,
  availableQuantity,
  stores,
  onTransferred,
}: Props) {
  const [destinationId, setDestinationId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);

  const destinations = stores.filter(
    (store) => store.id !== storeId
  );

  async function transfer() {
    const toStoreId = Number(destinationId);

    if (
      !destinationId ||
      !Number.isSafeInteger(quantity) ||
      quantity <= 0 ||
      quantity > availableQuantity
    ) {
      alert("Select a destination and valid quantity.");
      return;
    }

    if (
      !window.confirm(
        `Transfer ${quantity} pair(s) of ${productName} ` +
        `from ${storeName} to ${
          destinations.find((s) => s.id === toStoreId)?.name
        }?`
      )
    ) {
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        "/api/inventory/transfer",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            fromStoreId: storeId,
            toStoreId,
            productId,
            quantity,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Transfer failed");
      }

      setDestinationId("");
      setQuantity(1);
      onTransferred();
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Transfer failed"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <select
        value={destinationId}
        onChange={(e) => setDestinationId(e.target.value)}
        disabled={loading}
        aria-label="Destination store"
      >
        <option value="">To store...</option>
        {destinations.map((store) => (
          <option key={store.id} value={store.id}>
            {store.name}
          </option>
        ))}
      </select>

      <input
        type="number"
        min={1}
        max={availableQuantity}
        value={quantity}
        onChange={(e) => setQuantity(Number(e.target.value))}
        disabled={loading}
        aria-label="Transfer quantity"
        style={{ width: 55 }}
      />

      <button
        type="button"
        onClick={transfer}
        disabled={
          loading ||
          !destinationId ||
          availableQuantity <= 0 ||
          quantity <= 0 ||
          quantity > availableQuantity
        }
      >
        {loading ? "..." : "Transfer"}
      </button>
    </div>
  );
}
