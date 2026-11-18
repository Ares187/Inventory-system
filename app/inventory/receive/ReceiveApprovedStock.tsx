
"use client";

import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import {
  matchApprovedModel,
  type RecognizedShoe,
} from "../../../lib/shoe-model-matching";

type ShoeModel = {
  id: number;
  brand: string;
  model: string;
  version: string | null;
  retail_price: number;
};

type Store = {
  id: number;
  name: string;
};

type ScanResult = RecognizedShoe & {
  gender?: string | null;
  size?: string | number | null;
  width?: string | null;
  color?: string | null;
  upc?: string | null;
};

export default function ReceiveApprovedStock() {
  const [models, setModels] = useState<ShoeModel[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [scanMessage, setScanMessage] = useState("");

  const [form, setForm] = useState({
    shoe_model_id: "",
    store_id: "",
    gender: "",
    size: "",
    width: "",
    color: "",
    upc: "",
    quantity: "1",
  });

  useEffect(() => {
    async function loadOptions() {
      try {
        const [modelsResponse, storesResponse] =
          await Promise.all([
            fetch("/api/shoe-models"),
            fetch("/api/stores"),
          ]);

        if (!modelsResponse.ok || !storesResponse.ok) {
          throw new Error("Unable to load models or stores");
        }

        const modelsResult = await modelsResponse.json();
        const storesResult = await storesResponse.json();

        setModels(modelsResult.models ?? []);
        setStores(storesResult.stores ?? []);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load receiving options"
        );
      } finally {
        setLoading(false);
      }
    }

    void loadOptions();
  }, []);

  function update(field: keyof typeof form, value: string) {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
    setSuccess("");
  }

  const selectedModel = models.find(
    (shoe) => String(shoe.id) === form.shoe_model_id
  );

  async function scanLabel(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) return;

    setScanning(true);
    setError("");
    setSuccess("");
    setScanMessage("");

    try {
      const upload = new FormData();
      upload.append("image", file);

      const response = await fetch(
        "/api/inventory/scan-label",
        {
          method: "POST",
          body: upload,
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || "Unable to scan shoe label"
        );
      }

      const shoe: ScanResult = result.shoe;

      if (!shoe || typeof shoe !== "object") {
        throw new Error("Invalid scan result");
      }

      const matched =
        typeof shoe.brand === "string" &&
        typeof shoe.model === "string"
          ? matchApprovedModel(
              {
                brand: shoe.brand,
                model: shoe.model,
                version: shoe.version,
              },
              models
            )
          : null;

      const gender =
        shoe.gender === "Men" ||
        shoe.gender === "Women" ||
        shoe.gender === "Unisex"
          ? shoe.gender
          : "";

      const width =
        shoe.width === "Narrow" ||
        shoe.width === "Regular" ||
        shoe.width === "Wide" ||
        shoe.width === "Extra Wide"
          ? shoe.width
          : "";

      // UPC is provisional until checked against the barcode.
      const upc =
        typeof shoe.upc === "string" &&
        /^\d{12,14}$/.test(shoe.upc)
          ? shoe.upc
          : "";

      setForm((previous) => ({
        ...previous,
        shoe_model_id: matched ? String(matched.id) : "",
        gender,
        size:
          shoe.size != null ? String(shoe.size) : "",
        width,
        color:
          typeof shoe.color === "string"
            ? shoe.color
            : "",
        upc,
      }));

      if (matched) {
        setScanMessage(
          `Matched approved model: ${matched.brand} ` +
          `${matched.model} ${matched.version ?? ""}. ` +
          "Review all fields, especially the UPC, before receiving."
        );
      } else {
        setScanMessage(
          `Recognized ${shoe.brand ?? "unknown brand"} ` +
          `${shoe.model ?? "unknown model"} ` +
          `${shoe.version ?? ""}, but could not find a unique ` +
          "approved model. Select the correct model manually."
        );
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to scan shoe label"
      );
    } finally {
      setScanning(false);
      event.target.value = "";
    }
  }

  async function receiveStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (saving || scanning) return;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(
        "/api/inventory/receive-approved",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            shoeModelId: Number(form.shoe_model_id),
            storeId: Number(form.store_id),
            gender: form.gender,
            size: form.size,
            width: form.width,
            color: form.color,
            quantity: Number(form.quantity),
            upc: form.upc.trim() || null,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || "Unable to receive stock"
        );
      }

      setSuccess(
        `Successfully received ${form.quantity} pair(s) of ` +
        `${selectedModel?.brand ?? ""} ` +
        `${selectedModel?.model ?? ""} ` +
        `${selectedModel?.version ?? ""}.`
      );

      setScanMessage("");

      setForm((previous) => ({
        ...previous,
        size: "",
        width: "",
        color: "",
        upc: "",
        quantity: "1",
      }));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to receive stock"
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
    boxSizing: "border-box",
  };

  if (loading) {
    return <p>Loading receiving options...</p>;
  }

  return (
    <form
      onSubmit={receiveStock}
      style={{
        padding: "24px",
        background: "white",
        border: "1px solid #e5e7eb",
        borderRadius: "10px",
      }}
    >
      <div style={{ display: "grid", gap: "18px" }}>
        <div
          style={{
            padding: "16px",
            border: "1px solid #d1d5db",
            borderRadius: "8px",
            background: "#f9fafb",
          }}
        >
          <strong>Scan Box Label</strong>
          <p style={{ margin: "8px 0 12px" }}>
            Photograph a shoe box label to automatically
            fill in the receiving form.
          </p>

          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={scanLabel}
            disabled={scanning || saving}
            style={inputStyle}
          />

          {scanning && (
            <p role="status">Reading shoe box label...</p>
          )}

          {scanMessage && (
            <p
              role="status"
              style={{
                color: "#1d4ed8",
                marginBottom: 0,
              }}
            >
              {scanMessage}
            </p>
          )}
        </div>

        <label>
          Approved Shoe Model
          <select
            required
            value={form.shoe_model_id}
            onChange={(event) =>
              update("shoe_model_id", event.target.value)
            }
            style={inputStyle}
          >
            <option value="">Select a shoe model</option>
            {models.map((shoe) => (
              <option key={shoe.id} value={shoe.id}>
                {shoe.brand} {shoe.model}{" "}
                {shoe.version ?? ""}
              </option>
            ))}
          </select>
        </label>

        {selectedModel && (
          <div
            style={{
              padding: "14px",
              background: "#f3f4f6",
              borderRadius: "6px",
            }}
          >
            <strong>
              {selectedModel.brand} {selectedModel.model}{" "}
              {selectedModel.version ?? ""}
            </strong>
            <p style={{ marginTop: "6px" }}>
              Retail Price: $
              {Number(selectedModel.retail_price).toFixed(2)}
            </p>
          </div>
        )}

        <label>
          Destination Store
          <select
            required
            value={form.store_id}
            onChange={(event) =>
              update("store_id", event.target.value)
            }
            style={inputStyle}
          >
            <option value="">Select store</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </label>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "16px",
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

          <label>
            Size
            <input
              required
              value={form.size}
              onChange={(event) =>
                update("size", event.target.value)
              }
              placeholder="10.5"
              style={inputStyle}
            />
          </label>

          <label>
            Width
            <select
              required
              value={form.width}
              onChange={(event) =>
                update("width", event.target.value)
              }
              style={inputStyle}
            >
              <option value="">Select width</option>
              <option value="Narrow">Narrow</option>
              <option value="Regular">Regular</option>
              <option value="Wide">Wide</option>
              <option value="Extra Wide">Extra Wide</option>
            </select>
          </label>

          <label>
            Color
            <input
              required
              value={form.color}
              onChange={(event) =>
                update("color", event.target.value)
              }
              placeholder="Black / White"
              style={inputStyle}
            />
          </label>

          <label>
            UPC (verify against label)
            <input
              value={form.upc}
              onChange={(event) =>
                update("upc", event.target.value)
              }
              placeholder="12–14 digit barcode"
              style={inputStyle}
            />
          </label>

          <label>
            Quantity
            <input
              required
              type="number"
              min="1"
              step="1"
              value={form.quantity}
              onChange={(event) =>
                update("quantity", event.target.value)
              }
              style={inputStyle}
            />
          </label>
        </div>

        {error && (
          <p role="alert" style={{ color: "#dc2626" }}>
            {error}
          </p>
        )}

        {success && (
          <p role="status" style={{ color: "#15803d" }}>
            {success}
          </p>
        )}

        <button
          type="submit"
          disabled={
            saving ||
            scanning ||
            models.length === 0 ||
            stores.length === 0
          }
          style={{
            padding: "12px 20px",
            background: "#111827",
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            fontWeight: "bold",
          }}
        >
          {saving ? "Receiving..." : "Receive Stock"}
        </button>
      </div>
    </form>
  );
}
