
"use client";

import { useEffect, useState } from "react";

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
  size: string;
  width: string;
  color: string;
};

type PendingSale = {
  id: number;
  hike_sale_id: string;
  hike_outlet_id: string;
  product_name: string;
  sku: string;
  quantity: number;
  sale_date: string;
  size: string | null;
  width: string | null;
};

export default function PendingColorsPage() {
  const [sales, setSales] = useState<PendingSale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [selected, setSelected] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [salesResponse, inventoryResponse] = await Promise.all([
          fetch("/api/hike/pending-colors"),
          fetch("/api/inventory"),
        ]);

        if (!salesResponse.ok || !inventoryResponse.ok) {
          throw new Error("Unable to load pending sales");
        }

        const salesData = await salesResponse.json();
        const inventoryData = await inventoryResponse.json();

        setSales(salesData.sales ?? []);
        setProducts(inventoryData.products ?? []);
        setStores(inventoryData.stores ?? []);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Unable to load data"
        );
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  return (
    <main style={{ maxWidth: 1050, margin: "35px auto", padding: 20 }}>
      <h1>Pending Color Confirmation</h1>
      <p style={{ color: "#64748b" }}>
        Select the correct color for shoes purchased through Hike.
      </p>

      {loading && <p>Loading pending sales...</p>}
      {error && <p style={{ color: "#dc2626" }}>{error}</p>}

      {!loading && !error && sales.length === 0 && (
        <div
          style={{
            background: "white",
            padding: 25,
            borderRadius: 10,
            border: "1px solid #e2e8f0",
          }}
        >
          No sales awaiting color confirmation.
        </div>
      )}

      {sales.map((sale) => {
        const store = stores.find(
          (item) => String(item.id) === String(sale.hike_outlet_id)
        );

        const matchingProducts = products.filter((product) => {
          const productName =
            `${product.gender === "M" ? "M" : product.gender === "W" ? "W" : product.gender} ${product.model} ${product.version ?? ""}`
              .trim()
              .toLowerCase();

          return (
            productName === String(sale.product_name ?? "").toLowerCase() &&
            String(product.size) === String(sale.size) &&
            String(product.width) === String(sale.width)
          );
        });

        return (
          <div
            key={sale.id}
            style={{
              background: "white",
              border: "1px solid #e2e8f0",
              borderRadius: 10,
              padding: 22,
              marginTop: 18,
            }}
          >
            <h3 style={{ marginTop: 0 }}>{sale.product_name}</h3>

            <p>
              <strong>Store:</strong> {store?.name ?? "Unknown"}
              {" | "}
              <strong>Size:</strong> {sale.size ?? "Unknown"}
              {" | "}
              <strong>Width:</strong> {sale.width ?? "Unknown"}
              {" | "}
              <strong>Quantity:</strong> {sale.quantity}
            </p>

            <label>
              <strong>Color</strong>
              <select
                value={selected[sale.id] ?? ""}
                onChange={(event) =>
                  setSelected((previous) => ({
                    ...previous,
                    [sale.id]: Number(event.target.value),
                  }))
                }
                style={{
                  display: "block",
                  width: "100%",
                  maxWidth: 450,
                  marginTop: 8,
                  padding: 11,
                  borderRadius: 7,
                  border: "1px solid #cbd5e1",
                }}
              >
                <option value="">Select color</option>
                {matchingProducts.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.color}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              disabled={!selected[sale.id]}
              onClick={() =>
                alert(
                  "Color selection captured. Inventory deductions are not enabled yet."
                )
              }
              style={{
                marginTop: 16,
                padding: "11px 18px",
                border: "none",
                borderRadius: 7,
                background: selected[sale.id] ? "#2563eb" : "#94a3b8",
                color: "white",
                cursor: selected[sale.id] ? "pointer" : "not-allowed",
              }}
            >
              Confirm Color
            </button>
          </div>
        );
      })}
    </main>
  );
}
