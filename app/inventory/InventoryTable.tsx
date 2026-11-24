
"use client";

import React, { useEffect, useState } from "react";

type Store = { id: number; name: string };

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

type FilterKey =
  | "gender"
  | "brand"
  | "model"
  | "size"
  | "width"
  | "color";

const filterFields: FilterKey[] = [
  "gender", "brand", "model", "size", "width", "color"
];

const emptyFilters: Record<FilterKey, string> = {
  gender: "",
  brand: "",
  model: "",
  size: "",
  width: "",
  color: "",
};

export default function InventoryTable({
  employeeRole,
}: {
  employeeRole: "owner" | "chief" | "manager" | "employee";
}) {
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStore, setSelectedStore] = useState("all");
  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState<InventoryRecord[]>([]);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<FilterKey, string>>({
    ...emptyFilters
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = () =>
    setRefreshKey((previous) => previous + 1);

  useEffect(() => {
    let cancelled = false;

    async function loadInventory() {
      try {
        const response = await fetch("/api/inventory", {
          cache: "no-store"
        });

        if (!response.ok) {
          throw new Error("Unable to load inventory");
        }

        const data = await response.json();

        if (cancelled) return;

        setStores(data.stores);
        setProducts(data.products);
        setInventory(data.inventory);
        setError("");
      } catch {
        if (!cancelled) {
          setError("Unable to retrieve inventory.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadInventory();

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const filteredProducts = products.filter((product) => {
    const searchableText = [
      product.gender,
      product.brand,
      product.model,
      product.version,
      product.size,
      product.width,
      product.color,
    ]
      .filter((value) => value != null)
      .join(" ")
      .toLowerCase();

    if (
      search.trim() &&
      !searchableText.includes(search.trim().toLowerCase())
    ) {
      return false;
    }

    return filterFields.every((field) => {
      const value = filters[field].trim().toLowerCase();

      if (!value) return true;

      const productValue =
        field === "model"
          ? `${product.model} ${product.version ?? ""}`
          : String(product[field] ?? "");

      return field === "size"
        ? productValue.toLowerCase() === value
        : productValue.toLowerCase().includes(value);
    });
  });

  const groupedProducts = Object.groupBy(
    filteredProducts,
    (product) =>
      [
        product.gender,
        product.brand,
        product.model,
        product.version ?? "",
      ].join("|")
  );

  const visibleStores =
    selectedStore === "all"
      ? stores
      : stores.filter(
          (store) => String(store.id) === selectedStore
        );

  const activeStore =
    selectedStore !== "all" && visibleStores.length === 1
      ? visibleStores[0]
      : null;

  const groupCount = Object.keys(groupedProducts).length;

  const cellStyle: React.CSSProperties = {
    padding: "12px",
    borderBottom: "1px solid #e5e7eb",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px",
    border: "1px solid #d1d5db",
    borderRadius: "6px",
    color: "#111827",
    background: "white",
  };

  const buttonStyle: React.CSSProperties = {
    padding: "8px 12px",
    border: "1px solid #d1d5db",
    borderRadius: "6px",
    background: "white",
    color: "#111827",
    cursor: "pointer",
  };

  if (loading) return <p>Loading inventory...</p>;
  if (error) return <p>{error}</p>;

  return (
    <div style={{ overflowX: "auto", width: "100%" }}>
      <h2 style={{ fontSize: "22px", marginBottom: "20px" }}>
        Current Inventory
      </h2>
      <p
        style={{
          marginBottom: "16px",
          color: "#6b7280",
          fontSize: "14px",
        }}
      >
        {groupCount} shoe groups · {filteredProducts.length} variants
      </p>

      <div
        style={{
          display: "flex",
          gap: "10px",
          marginBottom: "20px",
        }}
      >
        <button
          type="button"
          style={buttonStyle}
          onClick={() =>
            setExpandedGroups(Object.keys(groupedProducts))
          }
        >
          Expand All
        </button>

        <button
          type="button"
          style={buttonStyle}
          onClick={() => setExpandedGroups([])}
        >
          Collapse All
        </button>
      </div>

      <div style={{ marginBottom: "20px" }}>
        <label
          htmlFor="store-select"
          style={{
            display: "block",
            marginBottom: "6px",
            fontWeight: 600,
          }}
        >
          Store Location
        </label>

        <select
          id="store-select"
          value={selectedStore}
          onChange={(event) =>
            setSelectedStore(event.target.value)
          }
          style={{
            ...inputStyle,
            maxWidth: "300px",
            padding: "12px",
          }}
        >
          <option value="all">All Stores</option>

          {stores.map((store) => (
            <option key={store.id} value={String(store.id)}>
              {store.name}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: "24px" }}>
        <input
          type="search"
          placeholder="General search..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          style={{
            ...inputStyle,
            padding: "12px",
            marginBottom: "16px",
          }}
        />

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(150px, 1fr))",
            gap: "12px",
          }}
        >
          {filterFields.map((field) => (
            <div key={field}>
              <label
                htmlFor={`filter-${field}`}
                style={{
                  display: "block",
                  marginBottom: "6px",
                  textTransform: "capitalize",
                }}
              >
                {field}
              </label>

              <input
                id={`filter-${field}`}
                type="text"
                placeholder={`Filter ${field}...`}
                value={filters[field]}
                onChange={(event) =>
                  setFilters((previous) => ({
                    ...previous,
                    [field]: event.target.value,
                  }))
                }
                style={inputStyle}
              />
            </div>
          ))}
        </div>

        <button
          type="button"
          style={{
            ...buttonStyle,
            marginTop: "12px",
          }}
          onClick={() => {
            setSearch("");
            setFilters({ ...emptyFilters });
          }}
        >
          Clear Filters
        </button>
      </div>

      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          textAlign: "left",
          fontSize: "14px",
        }}
      >
        <thead style={{ background: "var(--surface-blue)", color: "var(--ink-blue)" }}>
          <tr style={{ borderBottom: "2px solid var(--border-blue)" }}>
            {[
              "Gender",
              "Brand",
              "Model",
              "Version",
              "Size",
              "Width",
              "Color",
            ].map((name) => (
              <th key={name} style={cellStyle}>
                {name}
              </th>
            ))}

            {visibleStores.map((store) => (
              <th key={store.id} style={cellStyle}>
                {store.name}
              </th>
            ))}

            <th style={cellStyle}>Total</th>

           

         

           
          </tr>
        </thead>

        <tbody>
          {Object.entries(groupedProducts).map(
            ([groupKey, group]) => {
              if (!group?.length) return null;

              const firstProduct = group[0];
              const isExpanded =
                expandedGroups.includes(groupKey);

              return (
                <React.Fragment key={groupKey}>
                  <tr
                    onClick={() =>
                      setExpandedGroups((previous) =>
                        previous.includes(groupKey)
                          ? previous.filter(
                              (key) => key !== groupKey
                            )
                          : [...previous, groupKey]
                      )
                    }
                    style={{
                      background: "#e5e7eb",
                      cursor: "pointer",
                      fontWeight: 600,
                    }}
                  >
                    <td
                     colSpan={8 + visibleStores.length}
                      style={{ padding: "14px" }}
                    >
                      {isExpanded ? "▼" : "▶"}{" "}
                      {firstProduct.gender} —{" "}
                      {firstProduct.brand}{" "}
                      {firstProduct.model}{" "}
                      {firstProduct.version ?? ""}{" "}
                      ({group.length} variants)
                    </td>
                  </tr>

                  {isExpanded &&
                    group.map((product) => {
                      const quantities = visibleStores.map(
                        (store) =>
                          inventory.find(
                            (item) =>
                              item.store_id === store.id &&
                              item.product_id === product.id
                          )?.quantity ?? 0
                      );

                      const total = quantities.reduce(
                        (sum, quantity) => sum + quantity,
                        0
                      );

                      const productName =
                        `${product.brand} ${product.model} ` +
                        `${product.version ?? ""} - ` +
                        `Size ${product.size} - ` +
                        `${product.width} - ${product.color}`;

                      return (
                        <tr key={product.id}>
                          {[
                            product.gender,
                            product.brand,
                            product.model,
                            product.version,
                            product.size,
                            product.width,
                            product.color,
                          ].map((value, index) => (
                            <td key={index} style={cellStyle}>
                              {value ?? ""}
                            </td>
                          ))}

                          {quantities.map((quantity, index) => (
                            <td
                              key={visibleStores[index].id}
                              style={cellStyle}
                            >
                              {quantity}
                            </td>
                          ))}

                          <td
                            style={{
                              ...cellStyle,
                              fontWeight: 600,
                            }}
                          >
                            {total}
                          </td>

                      



                        
                          {activeStore &&
                            (employeeRole === "owner" ||
                            employeeRole === "manager") && (
                            <td style={cellStyle}>
                            </td>
                            )}
                        </tr>
                      );
                    })}
                </React.Fragment>
              );
            }
          )}
        </tbody>
      </table>
    </div>
  );
}
