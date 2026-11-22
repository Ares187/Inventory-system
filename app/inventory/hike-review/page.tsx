
"use client";

import { useCallback, useEffect, useState } from "react";

type ReviewItem = {
  id: number;
  saleId: string;
  outletId: string;
  productName: string | null;
  sku: string | null;
  quantity: number;
  saleDate: string | null;
  testMode: boolean;
  reason: string;
};

type ReviewData = {
  approved: ReviewItem[];
  other: ReviewItem[];
  classification: ReviewItem[];
  total: number;
};

type Product = {
  id: number;
  gender: string | null;
  brand: string | null;
  model: string | null;
  version: string | null;
  size: string | number | null;
  width: string | null;
  color: string | null;
  upc: string | null;
};

type Section = "approved" | "other" | "classification";

const stores: Record<string, string> = {
  "1": "Millburn",
  "2": "Basking Ridge",
  "3": "Denville"
};

const sections: { key: Section; label: string }[] = [
  { key: "approved", label: "Approved Shoes" },
  { key: "other", label: "Other Footwear" },
  { key: "classification", label: "Needs Classification" }
];

export default function HikeReviewPage() {
  const [data, setData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [section, setSection] = useState<Section>("approved");
  const [selectedSale, setSelectedSale] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const loadQueue = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/hike/review-queue", {
        cache: "no-store"
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "Unable to load queue");
      }

      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  useEffect(() => {
    if (selectedSale === null || search.trim().length < 2) {
      setProducts([]);
      setSearching(false);
      return;
    }

    let cancelled = false;

    const timer = setTimeout(async () => {
      setSearching(true);

      try {
        const response = await fetch(
          `/api/hike/review-products?search=${encodeURIComponent(search)}`
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error ?? "Search failed");
        }

        if (!cancelled) {
          setProducts(result.products ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setProducts([]);
          setMessage(
            err instanceof Error ? err.message : "Search failed"
          );
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, selectedSale]);

  function openMatch(item: ReviewItem) {
    setSelectedSale(item.id);
    setSearch("");
    setProducts([]);
    setSelectedProduct("");
    setMessage("");
  }

  async function resolveSale(
    saleItemId: number,
    action: "match" | "ignore"
  ) {
    if (busy) return;

    if (action === "match" && !selectedProduct) {
      setMessage("Select an inventory product first.");
      return;
    }

    if (
      action === "ignore" &&
      !window.confirm(
        "Ignore this item? It will leave the review queue but remain in transaction history."
      )
    ) {
      return;
    }

    try {
      setBusy(true);
      setMessage("");

      const response = await fetch("/api/hike/resolve-sale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          saleItemId,
          action,
          ...(action === "match"
            ? { productId: Number(selectedProduct) }
            : {})
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "Resolution failed");
      }

      setSelectedSale(null);
      setSelectedProduct("");
      setSearch("");
      setProducts([]);

      await loadQueue();

      setMessage(
        action === "ignore"
          ? "Item ignored. Inventory unchanged."
          : "Product matched. Inventory unchanged."
      );
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "Resolution failed"
      );
    } finally {
      setBusy(false);
    }
  }

  const items = data?.[section] ?? [];

  const buttonStyle = {
    padding: "8px 12px",
    border: "1px solid #cbd5e1",
    borderRadius: 7,
    cursor: "pointer",
    background: "white",
    fontWeight: 600 as const
  };

  return (
    <main
      style={{
        maxWidth: 1250,
        margin: "32px auto",
        padding: "0 20px"
      }}
    >
      <h1>Hike Sales Review</h1>

      <p style={{ color: "#64748b" }}>
        Match Hike sales to Feldryva products or ignore non-shoe
        merchandise. Only test records can be resolved here.
        No inventory deductions occur.
      </p>

      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          margin: "24px 0"
        }}
      >
        {sections.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => {
              setSection(key);
              setSelectedSale(null);
              setMessage("");
            }}
            style={{
              ...buttonStyle,
              background: section === key ? "#0f172a" : "white",
              color: section === key ? "white" : "#0f172a"
            }}
          >
            {label} ({data?.[key]?.length ?? 0})
          </button>
        ))}

        <button
          style={buttonStyle}
          disabled={loading || busy}
          onClick={() => void loadQueue()}
        >
          Refresh
        </button>
      </div>

      {message && (
        <p
          role="status"
          style={{
            padding: 12,
            background: "#e2e8f0",
            borderRadius: 8
          }}
        >
          {message}
        </p>
      )}

      {error && <p style={{ color: "#dc2626" }}>{error}</p>}
      {loading && <p>Loading sales...</p>}

      {!loading && !error && items.length === 0 && (
        <p>No unresolved items in this category.</p>
      )}

      {!loading && !error && items.length > 0 && (
        <div style={{ display: "grid", gap: 12 }}>
          {items.map((item) => (
            <div
              key={item.id}
              style={{
                background: "white",
                border: "1px solid #e2e8f0",
                borderRadius: 10,
                padding: 18
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 16,
                  flexWrap: "wrap"
                }}
              >
                <div>
                  <strong style={{ fontSize: 16 }}>
                    {item.productName ?? "Unknown Product"}
                  </strong>

                  <div style={{ marginTop: 8, color: "#475569" }}>
                    {stores[String(item.outletId)] ??
                      `Outlet ${item.outletId}`}
                    {" · "}Qty: {item.quantity}
                    {" · "}SKU: {item.sku ?? "—"}
                  </div>

                  <div
                    style={{
                      color: "#64748b",
                      fontSize: 13,
                      marginTop: 6
                    }}
                  >
                    {item.saleDate
                      ? new Date(item.saleDate).toLocaleString()
                      : "Date unavailable"}
                    {" · "}
                    {item.testMode ? "TEST" : "LIVE"}
                    {" · "}
                    {item.reason}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    style={buttonStyle}
                    disabled={busy || !item.testMode}
                    onClick={() => openMatch(item)}
                  >
                    Match Shoe
                  </button>

                  <button
                    style={{
                      ...buttonStyle,
                      color: "#991b1b"
                    }}
                    disabled={busy || !item.testMode}
                    onClick={() => void resolveSale(item.id, "ignore")}
                  >
                    Ignore Item
                  </button>
                </div>
              </div>

              {selectedSale === item.id && (
                <div
                  style={{
                    marginTop: 18,
                    paddingTop: 16,
                    borderTop: "1px solid #e2e8f0"
                  }}
                >
                  <label
                    htmlFor={`product-search-${item.id}`}
                    style={{ display: "block", marginBottom: 8 }}
                  >
                    Search Feldryva inventory products
                  </label>

                  <input
                    id={`product-search-${item.id}`}
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setSelectedProduct("");
                    }}
                    placeholder="Search by brand, model, or UPC"
                    style={{
                      width: "100%",
                      maxWidth: 450,
                      padding: 11,
                      border: "1px solid #cbd5e1",
                      borderRadius: 7,
                      boxSizing: "border-box"
                    }}
                  />

                  {searching && <p>Searching...</p>}

                  {!searching && search.length >= 2 && (
                    <div style={{ marginTop: 12 }}>
                      <select
                        value={selectedProduct}
                        onChange={(event) =>
                          setSelectedProduct(event.target.value)
                        }
                        style={{
                          width: "100%",
                          maxWidth: 700,
                          padding: 11,
                          border: "1px solid #cbd5e1",
                          borderRadius: 7
                        }}
                      >
                        <option value="">
                          Select exact product, size, width and color
                        </option>

                        {products.map((product) => (
                          <option key={product.id} value={product.id}>
                            {[
                              product.gender,
                              product.brand,
                              product.model,
                              product.version,
                              `Size ${product.size ?? "?"}`,
                              `Width ${product.width ?? "?"}`,
                              product.color ?? "Color unknown"
                            ].filter(Boolean).join(" · ")}
                          </option>
                        ))}
                      </select>

                      {products.length === 0 && (
                        <p style={{ color: "#64748b" }}>
                          No matching inventory products found.
                        </p>
                      )}
                    </div>
                  )}

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      marginTop: 14
                    }}
                  >
                    <button
                      style={{
                        ...buttonStyle,
                        background: "#0f172a",
                        color: "white"
                      }}
                      disabled={busy || !selectedProduct}
                      onClick={() =>
                        void resolveSale(item.id, "match")
                      }
                    >
                      {busy ? "Saving..." : "Confirm Match"}
                    </button>

                    <button
                      style={buttonStyle}
                      disabled={busy}
                      onClick={() => setSelectedSale(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
