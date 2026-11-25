
"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

type Product = {
  id: number;
  gender: string;
  brand: string;
  model: string;
  version: string | null;
  size: string;
  width: string;
  color: string;
  upc: string | null;
  shoe_model_id: number | null;
  retail_price: number;
};

type ShoeModel = {
  id: number;
  brand: string;
  model: string;
  version: string | null;
  retail_price: number;
  active: boolean;
};

const inputStyle: CSSProperties = {
  padding: "10px 12px",
  border: "1px solid #cbd5e1",
  borderRadius: "8px",
  background: "#ffffff",
  color: "#0f172a",
  fontSize: "14px",
  minHeight: "42px",
  boxSizing: "border-box",
};

const buttonStyle: CSSProperties = {
  padding: "9px 14px",
  border: "1px solid #cbd5e1",
  borderRadius: "8px",
  background: "#ffffff",
  color: "#334155",
  cursor: "pointer",
  fontSize: "13px",
  fontWeight: 600,
};

const cellStyle: CSSProperties = {
  padding: "15px 12px",
  verticalAlign: "middle",
};

function Status({
  good,
  children,
}: {
  good: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "6px 11px",
        borderRadius: "20px",
        fontSize: "12px",
        fontWeight: 650,
        whiteSpace: "nowrap",
        background: good ? "#f0fdf4" : "#fff7ed",
        color: good ? "#15803d" : "#c2410c",
      }}
    >
      {children}
    </span>
  );
}

export default function ProductVariants() {
  const [products, setProducts] = useState<Product[]>([]);
  const [models, setModels] = useState<ShoeModel[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [upc, setUpc] = useState("");
  const [modelId, setModelId] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const response = await fetch("/api/product-variants", {
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to load variants");
      }

      setProducts(data.products);
      setModels(data.models);
    } catch (error) {
      throw error;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch((error) => {
      setIsError(true);
      setMessage(
        error instanceof Error ? error.message : "Loading failed"
      );
    });
  }, []);

  async function deleteVariant(product: Product) {
    if (saving || !window.confirm(
      `Delete ${product.brand} ${product.model}, size ${product.size}, ${product.width}, ${product.color}?`
    )) return;

    setSaving(true);
    setMessage("");
    setIsError(false);

    try {
      const response = await fetch("/api/product-variants", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: product.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to delete variant");
      setProducts((current) => current.filter((item) => item.id !== product.id));
      setMessage("Variant deleted.");
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "Unable to delete variant");
    } finally {
      setSaving(false);
    }
  }

  function beginEdit(product: Product) {
    setEditingId(product.id);
    setUpc(product.upc ?? "");
    setModelId(String(product.shoe_model_id ?? ""));
    setMessage("");
    setIsError(false);
  }

  function matchingModels(product: Product) {
    const normalize = (value: string | null) =>
      (value ?? "").trim().toLowerCase();

    return models.filter(
      (model) =>
        model.active &&
        normalize(model.brand) === normalize(product.brand) &&
        normalize(model.model) === normalize(product.model) &&
        normalize(model.version) === normalize(product.version)
    );
  }

  async function save(product: Product) {
    if (saving) return;

    setSaving(true);
    setMessage("");
    setIsError(false);

    try {
      const changes: {
        productId: number;
        upc: string;
        shoeModelId?: number;
      } = {
        productId: product.id,
        upc,
      };

      if (!product.shoe_model_id && modelId) {
        changes.shoeModelId = Number(modelId);
      }

      const response = await fetch("/api/product-variants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to save");
      }

      await load();
      setEditingId(null);
      setMessage("Product variant updated successfully.");
    } catch (error) {
      setIsError(true);
      setMessage(
        error instanceof Error ? error.message : "Save failed"
      );
    } finally {
      setSaving(false);
    }
  }

  const filtered = products.filter((product) => {
    const text = [
      product.gender,
      product.brand,
      product.model,
      product.version,
      product.size,
      product.width,
      product.color,
      product.upc,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (!text.includes(search.toLowerCase().trim())) {
      return false;
    }

    if (filter === "missing-upc") return !product.upc;
    if (filter === "unlinked") return !product.shoe_model_id;

    return true;
  });

  const missingUpc = products.filter((p) => !p.upc).length;
  const unlinked = products.filter(
    (p) => !p.shoe_model_id
  ).length;

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(160px, 1fr))",
          gap: "12px",
          marginBottom: "28px",
        }}
      >
        {[
          { label: "Total Variants", value: products.length },
          { label: "Missing UPC", value: missingUpc },
          { label: "Unlinked to Catalog", value: unlinked },
        ].map((stat) => (
          <div
            key={stat.label}
            style={{
              padding: "18px",
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: "10px",
            }}
          >
            <div
              style={{
                color: "#64748b",
                fontSize: "12px",
                marginBottom: "8px",
              }}
            >
              {stat.label}
            </div>
            <div
              style={{
                fontSize: "27px",
                fontWeight: 750,
                color: "#0f172a",
              }}
            >
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      <section>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "14px",
            marginBottom: "18px",
          }}
        >
          <div>
            <h2
              style={{
                fontSize: "19px",
                fontWeight: 700,
                margin: "0 0 5px",
              }}
            >
              Variant Directory
            </h2>

            <p
              style={{
                fontSize: "13px",
                color: "#64748b",
                margin: 0,
              }}
            >
              Update UPCs and connect variants to approved models.
            </p>
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "10px",
            }}
          >
            <input
              type="search"
              aria-label="Search product variants"
              placeholder="Search variants..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              style={{
                ...inputStyle,
                width: "240px",
                maxWidth: "100%",
              }}
            />

            <select
              aria-label="Filter product variants"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              style={inputStyle}
            >
              <option value="all">All Variants</option>
              <option value="missing-upc">Missing UPC</option>
              <option value="unlinked">Not Linked to Catalog</option>
            </select>
          </div>
        </div>

        {message && (
          <div
            role={isError ? "alert" : "status"}
            style={{
              padding: "12px 16px",
              marginBottom: "18px",
              borderRadius: "8px",
              background: isError ? "#fef2f2" : "#f0fdf4",
              color: isError ? "#b91c1c" : "#166534",
              fontSize: "14px",
            }}
          >
            {message}
          </div>
        )}

        <div
          style={{
            overflowX: "auto",
            border: "1px solid #e2e8f0",
            borderRadius: "10px",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              textAlign: "left",
              fontSize: "14px",
            }}
          >
            <thead style={{ background: "#f8fafc" }}>
              <tr>
                {[
                  "Shoe",
                  "Size",
                  "Width",
                  "Color",
                  "UPC",
                  "Catalog",
                  "Actions",
                ].map((heading) => (
                  <th
                    key={heading}
                    style={{
                      ...cellStyle,
                      fontSize: "12px",
                      fontWeight: 700,
                      color: "#64748b",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {filtered.map((product) => {
                const editing = editingId === product.id;
                const matches = matchingModels(product);

                return (
                  <tr
                    key={product.id}
                    style={{
                      borderTop: "1px solid #e2e8f0",
                    }}
                  >
                    <td style={cellStyle}>
                      <div
                        style={{
                          fontWeight: 700,
                          color: "#0f172a",
                        }}
                      >
                        {product.brand} {product.model}{" "}
                        {product.version ?? ""}
                      </div>
                      <div
                        style={{
                          fontSize: "12px",
                          color: "#64748b",
                          marginTop: "4px",
                        }}
                      >
                        {product.gender} · Variant #{product.id}
                      </div>
                    </td>

                    <td style={cellStyle}>{product.size}</td>
                    <td style={cellStyle}>{product.width}</td>
                    <td style={cellStyle}>{product.color}</td>

                    <td style={cellStyle}>
                      {editing ? (
                        <input
                          aria-label={`UPC for variant ${product.id}`}
                          value={upc}
                          onChange={(event) =>
                            setUpc(event.target.value)
                          }
                          placeholder="8–14 digits"
                          style={{
                            ...inputStyle,
                            width: "155px",
                          }}
                        />
                      ) : product.upc ? (
                        <span
                          style={{
                            fontFamily: "monospace",
                            fontSize: "13px",
                            color: "#334155",
                          }}
                        >
                          {product.upc}
                        </span>
                      ) : (
                        <Status good={false}>Missing UPC</Status>
                      )}
                    </td>

                    <td style={cellStyle}>
                      {product.shoe_model_id ? (
                        <Status good={true}>Linked</Status>
                      ) : editing ? (
                        <select
                          aria-label={`Catalog model for variant ${product.id}`}
                          value={modelId}
                          onChange={(event) =>
                            setModelId(event.target.value)
                          }
                          style={{
                            ...inputStyle,
                            maxWidth: "200px",
                          }}
                        >
                          <option value="">Not linked</option>
                          {matches.map((model) => (
                            <option
                              key={model.id}
                              value={model.id}
                            >
                              {model.brand} {model.model}{" "}
                              {model.version ?? ""}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Status good={false}>Not linked</Status>
                      )}
                    </td>

                    <td style={cellStyle}>
                      {editing ? (
                        <div
                          style={{
                            display: "flex",
                            gap: "8px",
                          }}
                        >
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => save(product)}
                            style={{
                              ...buttonStyle,
                              background: "#0f172a",
                              color: "#ffffff",
                              borderColor: "#0f172a",
                            }}
                          >
                            {saving ? "Saving..." : "Save"}
                          </button>

                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => setEditingId(null)}
                            style={buttonStyle}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            disabled={saving || editingId !== null}
                            onClick={() => beginEdit(product)}
                            style={buttonStyle}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={saving || editingId !== null}
                            onClick={() => void deleteVariant(product)}
                            style={{ ...buttonStyle, color: "#b91c1c" }}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}

              {!loading && filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    style={{
                      padding: "28px",
                      textAlign: "center",
                      color: "#64748b",
                    }}
                  >
                    {products.length === 0
                      ? "No product variants found."
                      : "No variants match your filters."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {loading && (
            <p
              style={{
                padding: "20px",
                color: "#64748b",
              }}
            >
              Loading variants...
            </p>
          )}
        </div>

        {!loading && (
          <p
            style={{
              fontSize: "12px",
              color: "#64748b",
              marginTop: "12px",
            }}
          >
            Showing {filtered.length} of {products.length} variants
          </p>
        )}
      </section>
    </div>
  );
}
