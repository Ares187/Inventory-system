
"use client";

import { useState } from "react";

type Props = {
  onAdded: () => void;
};

export default function AddProduct({ onAdded }: Props) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    gender: "",
    brand: "",
    model: "",
    version: "",
    size: "",
    width: "",
    color: "",
    upc: "",
    internal_sku: "",
    retail_price: "",
  });

  function update(field: keyof typeof form, value: string) {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  async function saveProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    setSaving(true);

    try {
      const response = await fetch("/api/products", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Unable to add shoe");
      }

      alert("Shoe added successfully.");

      setForm({
        gender: "",
        brand: "",
        model: "",
        version: "",
        size: "",
        width: "",
        color: "",
        upc: "",
        internal_sku: "",
        retail_price: "",
      });

      setOpen(false);
      onAdded();
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Unable to add shoe"
      );
    } finally {
      setSaving(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px",
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
    <div style={{ marginBottom: "20px" }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          padding: "10px 18px",
          background: "#111827",
          color: "white",
          border: "none",
          borderRadius: "6px",
          cursor: "pointer",
        }}
      >
        {open ? "Cancel" : "+ Add New Shoe"}
      </button>

      {open && (
        <form
          onSubmit={saveProduct}
          style={{
            marginTop: "16px",
            padding: "20px",
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
            background: "#f9fafb",
          }}
        >
          <h3 style={{ fontSize: "18px", marginBottom: "16px" }}>
            New Shoe Product
          </h3>

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
                <option value="">Select gender</option>
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
                    update(field.key, event.target.value)
                  }
                />
              </label>
            ))}
          </div>

          <button
            type="submit"
            disabled={saving}
            style={{
              marginTop: "20px",
              padding: "10px 20px",
              background: "#111827",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            {saving ? "Saving..." : "Save Shoe"}
          </button>
        </form>
      )}
    </div>
  );
}
