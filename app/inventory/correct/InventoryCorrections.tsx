
"use client";

import { useEffect, useState } from "react";
import CorrectStock from "../CorrectStock";

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

export default function InventoryCorrections() {
  const [stores, setStores] = useState<Store[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState<InventoryRecord[]>([]);

  const [selectedStore, setSelectedStore] = useState("");
  const [selectedProduct, setSelectedProduct] = useState("");
  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

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

        setSelectedStore((previous) =>
          previous || String(data.stores?.[0]?.id ?? "")
        );

        setError("");
      } catch {
        if (!cancelled) {
          setError("Unable to load inventory.");
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

  const selectedStoreObject = stores.find(
    (store) => String(store.id) === selectedStore
  );

  const selectedProductObject = products.find(
    (product) => String(product.id) === selectedProduct
  );

  const currentQuantity =
    inventory.find(
      (record) =>
        record.store_id === selectedStoreObject?.id &&
        record.product_id === selectedProductObject?.id
    )?.quantity ?? 0;

  const filteredProducts = products.filter((product) =>
    [
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
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const inputStyle = {
    width: "100%",
    padding: "12px",
    border: "1px solid #d1d5db",
    borderRadius: "6px",
    background: "white",
    color: "#111827",
  };

  if (loading) return <p>Loading inventory...</p>;
  if (error) return <p>{error}</p>;

  return (
    <div style={{ maxWidth: "850px", margin: "0 auto" }}>
      <h1>Inventory Corrections</h1>

      <p style={{ marginBottom: "24px", color: "#6b7280" }}>
        Manager and owner access only. Correct inventory
        quantities when physical stock differs from the system.
      </p>

      <div style={{ display: "grid", gap: "20px" }}>
        <label>
          Store Location
          <select
            value={selectedStore}
            onChange={(event) => {
              setSelectedStore(event.target.value);
              setSelectedProduct("");
            }}
            style={inputStyle}
          >
            {stores.map((store) => (
              <option key={store.id} value={String(store.id)}>
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

            {filteredProducts.map((product) => (
              <option
                key={product.id}
                value={String(product.id)}
              >
                {product.gender} — {product.brand}{" "}
                {product.model} {product.version ?? ""} —
                Size {product.size} — {product.width} —{" "}
                {product.color}
              </option>
            ))}
          </select>
        </label>

        {selectedStoreObject && selectedProductObject && (
          <>
            <p>
              <strong>Current quantity:</strong>{" "}
              {currentQuantity}
            </p>

            <CorrectStock
              productId={selectedProductObject.id}
              productName={[
                selectedProductObject.brand,
                selectedProductObject.model,
                selectedProductObject.version,
                `Size ${selectedProductObject.size}`,
                selectedProductObject.width,
                selectedProductObject.color,
              ]
                .filter(Boolean)
                .join(" ")}
              storeId={selectedStoreObject.id}
              storeName={selectedStoreObject.name}
              currentQuantity={currentQuantity}
              onCorrected={() =>
                setRefreshKey((previous) => previous + 1)
              }
            />
          </>
        )}
      </div>
    </div>
  );
}
