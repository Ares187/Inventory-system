
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

type InventoryRecord = {
  store_id: number;
  product_id: number;
  quantity: number;
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

function normalize(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeGender(value: unknown) {
  const gender = normalize(value);

  if (["m", "men", "mens", "male"].includes(gender)) {
    return "m";
  }

  if (["w", "women", "womens", "female"].includes(gender)) {
    return "w";
  }

  return gender;
}

function matchesSale(sale: PendingSale, product: Product) {
  if (!sale.size || !sale.width) return false;

  if (normalize(sale.size) !== normalize(product.size)) {
    return false;
  }

  if (normalize(sale.width) !== normalize(product.width)) {
    return false;
  }

  const saleName = String(sale.product_name ?? "")
    .replace(/\s*\/\s*.*$/, "")
    .trim();

  const genderMatch = saleName.match(
    /^(M|W|Mens|Womens|Men's|Women's)\s+/i
  );

  if (!genderMatch) return false;

  const saleGender = normalizeGender(genderMatch[1]);

  if (saleGender !== normalizeGender(product.gender)) {
    return false;
  }

  const nameWithoutGender = saleName
    .replace(/^(M|W|Mens|Womens|Men's|Women's)\s+/i, "")
    .trim();

  const productName = [
    product.brand,
    product.model,
    product.version,
  ]
    .filter(Boolean)
    .join(" ");

  const normalizedSaleName = normalize(nameWithoutGender);
  const normalizedProductName = normalize(productName);

  // Some inventory records include the brand in the model field.
  const modelOnly = normalize(
    `${product.model} ${product.version ?? ""}`
  );

  return (
    normalizedSaleName === normalizedProductName ||
    normalizedSaleName === modelOnly
  );
}

export default function PendingColorsPage() {
  const [sales, setSales] = useState<PendingSale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [inventory, setInventory] = useState<InventoryRecord[]>([]);

  const [selected, setSelected] = useState<
    Record<number, number>
  >({});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [confirming, setConfirming] = useState<number | null>(
    null
  );

  const [message, setMessage] = useState<
    Record<number, string>
  >({});

  useEffect(() => {
    async function load() {
      try {
        const [salesResponse, inventoryResponse] =
          await Promise.all([
            fetch("/api/hike/pending-colors", {
              cache: "no-store",
            }),
            fetch("/api/inventory", {
              cache: "no-store",
            }),
          ]);

        if (!salesResponse.ok || !inventoryResponse.ok) {
          throw new Error("Unable to load pending sales");
        }

        const salesData = await salesResponse.json();
        const inventoryData = await inventoryResponse.json();

        setSales(salesData.sales ?? []);
        setProducts(inventoryData.products ?? []);
        setStores(inventoryData.stores ?? []);
        setInventory(inventoryData.inventory ?? []);
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

  function getStock(productId: number, storeId: string) {
    const record = inventory.find(
      (item) =>
        String(item.product_id) === String(productId) &&
        String(item.store_id) === String(storeId)
    );

    return Number(record?.quantity ?? 0);
  }

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

      // Remove successfully processed sales from the queue.
      setSales((previous) =>
        previous.filter((sale) => sale.id !== saleId)
      );

      // Update displayed stock after successful deduction.
      setInventory((previous) =>
        previous.map((item) => {
          const sale = sales.find(
            (entry) => entry.id === saleId
          );

          if (
            sale &&
            String(item.product_id) === String(productId) &&
            String(item.store_id) ===
              String(sale.hike_outlet_id)
          ) {
            return {
              ...item,
              quantity:
                Number(item.quantity) -
                Number(sale.quantity),
            };
          }

          return item;
        })
      );
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
    <main
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
        const store = stores.find(
          (item) =>
            String(item.id) ===
            String(sale.hike_outlet_id)
        );

        const matchingProducts = products.filter(
          (product) => matchesSale(sale, product)
        );

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
              {store?.name ?? "Unknown"}
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

              {sale.sale_date &&
                ` | ${new Date(
                  sale.sale_date
                ).toLocaleString()}`}
            </p>

            {matchingProducts.length === 0 ? (
              <p style={{ color: "#b45309" }}>
                No matching inventory variants found.
                This sale requires manual resolution.
              </p>
            ) : (
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

                  {matchingProducts.map((product) => {
                    const stock = getStock(
                      product.id,
                      sale.hike_outlet_id
                    );

                    return (
                      <option
                        key={product.id}
                        value={product.id}
                      >
                        {product.color ||
                          "Unspecified"}
                        {" — "}
                        {stock} in stock
                      </option>
                    );
                  })}
                </select>
              </label>
            )}

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
                    ? "#2563eb"
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
