
"use client";

import { useEffect, useState } from "react";
import ReceiveApprovedStock from "./ReceiveApprovedStock";
import TransferStock from "../TransferStock";

type Store = {
  id: number;
  name: string;
};

type Product = {
  id: number;
  gender: string;
  brand: string;
  model: string;
  version: string | null;
  size: string | number;
  width: string;
  color: string;
};

type InventoryRecord = {
  store_id: number;
  product_id: number;
  quantity: number;
};

export default function StockManagement() {
  const [mode, setMode] = useState<"receive" | "transfer">(
    "receive"
  );

  const [stores, setStores] = useState<Store[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState<InventoryRecord[]>([]);

  const [sourceStore, setSourceStore] = useState("");
  const [selectedProduct, setSelectedProduct] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/inventory", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Unable to load inventory");
        }

        const data = await response.json();

        if (cancelled) return;

        setStores(data.stores ?? []);
        setProducts(data.products ?? []);
        setInventory(data.inventory ?? []);

        setSourceStore((previous) =>
          previous || String(data.stores?.[0]?.id ?? "")
        );

        setError("");
      } catch {
        if (!cancelled) {
          setError("Unable to load stock information.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const selected = products.find(
    (product) => String(product.id) === selectedProduct
  );

  const availableQuantity = inventory.find(
    (record) =>
      record.product_id === selected?.id &&
      String(record.store_id) === sourceStore
  )?.quantity ?? 0;

  const filteredProducts = products.filter((product) => {
    const name = [
      product.gender,
      product.brand,
      product.model,
      product.version,
      product.size,
      product.width,
      product.color,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return name.includes(search.toLowerCase());
  });

  const source = stores.find(
    (store) => String(store.id) === sourceStore
  );

  const inputStyle = {
    width: "100%",
    padding: "10px",
    border: "1px solid #d1d5db",
    borderRadius: "6px",
    background: "white",
    color: "#111827",
  };

  return (
    <div style={{ maxWidth: "850px", margin: "0 auto" }}>
      <h1>Stock Management</h1>

      <div
        style={{
          display: "flex",
          gap: "12px",
          margin: "24px 0",
        }}
      >
        <button
          type="button"
          onClick={() => setMode("receive")}
          style={{
            padding: "12px 20px",
            background:
              mode === "receive" ? "#111827" : "#e5e7eb",
            color: mode === "receive" ? "white" : "black",
            borderRadius: "6px",
            cursor: "pointer",
          }}
        >
          Receive Stock
        </button>

        <button
          type="button"
          onClick={() => setMode("transfer")}
          style={{
            padding: "12px 20px",
            background:
              mode === "transfer" ? "#111827" : "#e5e7eb",
            color: mode === "transfer" ? "white" : "black",
            borderRadius: "6px",
            cursor: "pointer",
          }}
        >
          Transfer Stock
        </button>
      </div>

      {mode === "receive" ? (
        <ReceiveApprovedStock />
      ) : (
        <div style={{ display: "grid", gap: "18px" }}>
          {loading ? (
            <p>Loading inventory...</p>
          ) : error ? (
            <p>{error}</p>
          ) : (
            <>
              <label>
                Transfer From
                <select
                  value={sourceStore}
                  onChange={(event) => {
                    setSourceStore(event.target.value);
                    setSelectedProduct("");
                  }}
                  style={inputStyle}
                >
                  {stores.map((store) => (
                    <option
                      key={store.id}
                      value={String(store.id)}
                    >
                      {store.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Search Shoe
                <input
                  value={search}
                  onChange={(event) =>
                    setSearch(event.target.value)
                  }
                  placeholder="Brand, model, size, color..."
                  style={inputStyle}
                />
              </label>

              <label>
                Select Shoe
                <select
                  value={selectedProduct}
                  onChange={(event) =>
                    setSelectedProduct(event.target.value)
                  }
                  style={inputStyle}
                >
                  <option value="">Select a shoe</option>

                  {filteredProducts.map((product) => {
                    const quantity =
                      inventory.find(
                        (record) =>
                          record.product_id === product.id &&
                          String(record.store_id) === sourceStore
                      )?.quantity ?? 0;

                    return (
                      <option
                        key={product.id}
                        value={String(product.id)}
                        disabled={quantity <= 0}
                      >
                        {product.gender} — {product.brand}{" "}
                        {product.model}{" "}
                        {product.version ?? ""} — Size{" "}
                        {product.size} — {product.width} —{" "}
                        {product.color} ({quantity} available)
                      </option>
                    );
                  })}
                </select>
              </label>

              {selected && source && (
                <>
                  <p>
                    <strong>Available at {source.name}:</strong>{" "}
                    {availableQuantity}
                  </p>

                  <TransferStock
                    productId={selected.id}
                    productName={[
                      selected.brand,
                      selected.model,
                      selected.version,
                      `Size ${selected.size}`,
                      selected.width,
                      selected.color,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    storeId={source.id}
                    storeName={source.name}
                    availableQuantity={availableQuantity}
                    stores={stores}
                    onTransferred={() =>
                      setRefreshKey((previous) => previous + 1)
                    }
                  />
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
