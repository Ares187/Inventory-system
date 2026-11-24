
"use client";

import { useEffect, useState } from "react";

type PendingSale = {
  id: number;
  hike_sale_id: string;
  product_name: string;
  store_id: number;
  store_name: string;
  quantity: number;
  sale_date: string;
  feldryva_received_at?: string | null;
  size: string;
  width: string;
  products: { id: number; color: string; quantity: number }[];
};

export default function PendingColorsPage() {
  const [sales, setSales] = useState<PendingSale[]>([]);
  const [selected, setSelected] = useState<
    Record<number, number>
  >({});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [syncWarning, setSyncWarning] = useState("");

  const [confirming, setConfirming] = useState<number | null>(
    null
  );

  const [message, setMessage] = useState<
    Record<number, string>
  >({});

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch("/api/hike/pending-colors", {
          method: "POST",
          cache: "no-store",
          headers: { "x-feldryva-refresh": "pending-colors" },
        });
        if (!response.ok) throw new Error("Unable to load pending sales");
        const data = await response.json();
        setSales(data.sales);
        setSyncWarning(data.syncWarning ?? "");
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load pending sales"
        );
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  async function confirmColor(saleId: number) {
    const productId = selected[saleId];

    if (!productId || confirming !== null) {
      return;
    }

    setConfirming(saleId);

    setMessage((previous) => ({
      ...previous,
      [saleId]: "",
    }));

    try {
      const response = await fetch(
        "/api/hike/confirm-color",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            saleItemId: saleId,
            productId,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || "Unable to confirm color"
        );
      }

      setSales((previous) => previous.filter((sale) => sale.id !== saleId).map((sale) =>
        sale.store_id === result.storeId
          ? {
              ...sale,
              products: sale.products.map((product) =>
                product.id === productId
                  ? { ...product, quantity: Number(result.remainingQuantity) }
                  : product
              ),
            }
          : sale
      ));
    } catch (err) {
      setMessage((previous) => ({
        ...previous,
        [saleId]:
          err instanceof Error
            ? err.message
            : "Unable to confirm color",
      }));
    } finally {
      setConfirming(null);
    }
  }

  return (
    <main className="pending-colors"
      style={{
        maxWidth: 1050,
        margin: "35px auto",
        padding: 20,
      }}
    >
      <h1>Pending Color Confirmation</h1>

      <p style={{ color: "#64748b" }}>
        Select the color purchased through Hike.
        Test sales are protected from inventory deductions.
      </p>

      {syncWarning && <p role="status">{syncWarning}</p>}

      {loading && (
        <p>Loading pending sales...</p>
      )}

      {error && (
        <p style={{ color: "#dc2626" }}>
          {error}
        </p>
      )}

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
        const isConfirming = confirming === sale.id;

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
            <h3 style={{ marginTop: 0 }}>
              {sale.product_name}
            </h3>

            <p>
              <strong>Store:</strong>{" "}
              {sale.store_name}
              {" | "}
              <strong>Size:</strong>{" "}
              {sale.size ?? "Unknown"}
              {" | "}
              <strong>Width:</strong>{" "}
              {sale.width ?? "Unknown"}
              {" | "}
              <strong>Quantity:</strong>{" "}
              {sale.quantity}
            </p>

            <p
              style={{
                color: "#64748b",
                fontSize: 13,
              }}
            >
              Hike Sale #{sale.hike_sale_id}
              <br />
              <strong>Sold in Hike:</strong>{" "}
              {sale.sale_date ? (
                <time dateTime={sale.sale_date}>
                  {new Date(sale.sale_date).toLocaleString()}
                </time>
              ) : "Unavailable"}
              <br />
              <strong>Received by Feldryva:</strong>{" "}
              {sale.feldryva_received_at ? (
                <time dateTime={sale.feldryva_received_at}>
                  {new Date(sale.feldryva_received_at).toLocaleString()}
                </time>
              ) : "Unavailable"}
            </p>

              <label>
                <strong>Color</strong>

                <select
                  value={selected[sale.id] ?? ""}
                  disabled={confirming !== null}
                  onChange={(event) =>
                    setSelected((previous) => ({
                      ...previous,
                      [sale.id]: Number(
                        event.target.value
                      ),
                    }))
                  }
                  style={{
                    display: "block",
                    width: "100%",
                    maxWidth: 450,
                    marginTop: 8,
                    padding: 11,
                    borderRadius: 7,
                    border:
                      "1px solid #cbd5e1",
                  }}
                >
                  <option value="">
                    Select color
                  </option>

                  {sale.products.map((product) => (
                    <option
                      key={product.id}
                      value={product.id}
                      disabled={product.quantity < sale.quantity}
                    >
                      {product.color} — {product.quantity} in stock
                    </option>
                  ))}
                </select>
              </label>

            <button
              type="button"
              disabled={
                !selected[sale.id] ||
                confirming !== null
              }
              onClick={() =>
                confirmColor(sale.id)
              }
              style={{
                marginTop: 16,
                padding: "11px 18px",
                border: "none",
                borderRadius: 7,
                background:
                  selected[sale.id] &&
                  confirming === null
                    ? "var(--action-blue)"
                    : "#94a3b8",
                color: "white",
                cursor:
                  selected[sale.id] &&
                  confirming === null
                    ? "pointer"
                    : "not-allowed",
              }}
            >
              {isConfirming
                ? "Confirming..."
                : "Confirm Color"}
            </button>

            {message[sale.id] && (
              <p
                style={{
                  color: "#dc2626",
                  marginTop: 12,
                }}
              >
                {message[sale.id]}
              </p>
            )}
          </div>
        );
      })}
    </main>
  );
}
