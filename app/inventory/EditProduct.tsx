
"use client";

import { useState } from "react";

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
  internal_sku: string | null;
  retail_price: number;
};

type Props = {
  product: Product;
  onSaved: () => void;
};

export default function EditProduct({
  product,
  onSaved,
}: Props) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    gender: product.gender,
    brand: product.brand,
    model: product.model,
    version: product.version ?? "",
    size: product.size,
    width: product.width,
    color: product.color,
    upc: product.upc ?? "",
    internal_sku: product.internal_sku ?? "",
    retail_price: String(product.retail_price),
  });

  function update(field: keyof typeof form, value: string) {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    setSaving(true);

    try {
      const response = await fetch(
        `/api/products/${product.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(form),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || "Unable to update product"
        );
      }

      alert("Shoe updated successfully.");
      setOpen(false);
      onSaved();
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Unable to update product"
      );
    } finally {
      setSaving(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "9px",
    border: "1px solid #d1d5db",
    borderRadius: "6px",
    background: "white",
    color: "#111827",
  };

  const fields: {
    key: keyof typeof form;
    label: string;
    required?: boolean;
  }[] = [
    { key: "brand", label: "Brand", required: true },
    { key: "model", label: "Model", required: true },
    { key: "version", label: "Version" },
    { key: "size", label: "Size", required: true },
    { key: "width", label: "Width", required: true },
    { key: "color", label: "Color", required: true },
    { key: "upc", label: "UPC" },
    { key: "internal_sku", label: "Internal SKU" },
    {
      key: "retail_price",
      label: "Retail Price ($)",
      required: true,
    },
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          padding: "6px 12px",
          border: "1px solid #d1d5db",
          borderRadius: "6px",
          cursor: "pointer",
          background: "white",
          color: "#111827",
        }}
      >
        Edit Shoe
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 1000,
            padding: "20px",
          }}
        >
          <div
            style={{
              background: "white",
              color: "#111827",
              padding: "24px",
              borderRadius: "10px",
              width: "100%",
              maxWidth: "650px",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
          >
            <h2 style={{ fontSize: "22px", marginBottom: "18px" }}>
              Edit Shoe
            </h2>

            <form onSubmit={save}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: "14px",
                }}
              >
                <label>
                  Gender
                  <select
                    required
                    value={form.gender}
                    onChange={(event) =>
                      update("gender", event.target.value)
                    }
                    style={inputStyle}
                  >
                    <option value="Men">Men</option>
                    <option value="Women">Women</option>
                    <option value="Unisex">Unisex</option>
                  </select>
                </label>

                {fields.map((field) => (
                  <label key={field.key}>
                    {field.label}
                    <input
                      style={inputStyle}
                      required={field.required}
                      type={
                        field.key === "retail_price"
                          ? "number"
                          : "text"
                      }
                      min={
                        field.key === "retail_price"
                          ? "0"
                          : undefined
                      }
                      step={
                        field.key === "retail_price"
                          ? "0.01"
                          : undefined
                      }
                      value={form[field.key]}
                      onChange={(event) =>
                        update(
                          field.key,
                          event.target.value
                        )
                      }
                    />
                  </label>
                ))}
              </div>

              <div
                style={{
                  display: "flex",
                  gap: "12px",
                  marginTop: "24px",
                }}
              >
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    padding: "10px 18px",
                    background: "#111827",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                  }}
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>

                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setOpen(false)}
                  style={{
                    padding: "10px 18px",
                    background: "#e5e7eb",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
