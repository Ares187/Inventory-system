
"use client";

import { useCallback, useEffect, useState } from "react";
import type { CSSProperties, FormEvent } from "react";

type ShoeModel = {
  id: number;
  brand: string;
  model: string;
  version: string | null;
  retail_price: number;
  active: boolean;
};

type ModelForm = {
  brand: string;
  model: string;
  version: string;
  retail_price: string;
};

const emptyForm: ModelForm = {
  brand: "",
  model: "",
  version: "",
  retail_price: "",
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "11px 13px",
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

const fields = [
  { key: "brand", label: "Brand", type: "text" },
  { key: "model", label: "Model", type: "text" },
  { key: "version", label: "Version", type: "text" },
  { key: "retail_price", label: "Retail Price ($)", type: "number" },
] as const;

export default function ShoeCatalog() {
  const [models, setModels] = useState<ShoeModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const [form, setForm] = useState<ModelForm>({ ...emptyForm });
  const [editForm, setEditForm] = useState<ModelForm>({
    ...emptyForm,
  });

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadModels = useCallback(async () => {
    try {
      const response = await fetch("/api/shoe-models?manage=1", {
        cache: "no-store",
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Unable to load catalog");
      }

      setModels(result.models);
    } catch (err) {
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadModels().catch((err) =>
      setError(
        err instanceof Error ? err.message : "Unable to load catalog"
      )
    );
  }, [loadModels]);

  async function addModel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/shoe-models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Unable to add model");
      }

      setForm({ ...emptyForm });
      await loadModels();
      setMessage("Shoe model added successfully.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to add model"
      );
    } finally {
      setSaving(false);
    }
  }

  function startEditing(shoe: ShoeModel) {
    setEditing(shoe.id);
    setEditForm({
      brand: shoe.brand,
      model: shoe.model,
      version: shoe.version ?? "",
      retail_price: String(shoe.retail_price),
    });
    setError("");
    setMessage("");
  }

  async function saveEdit() {
    if (editing === null || saving) return;

    if (
      !editForm.brand.trim() ||
      !editForm.model.trim() ||
      editForm.retail_price.trim() === "" ||
      !Number.isFinite(Number(editForm.retail_price)) ||
      Number(editForm.retail_price) < 0
    ) {
      setError("Enter a brand, model, and valid retail price.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/shoe-models", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editing,
          ...editForm,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Unable to update model");
      }

      setEditing(null);
      await loadModels();
      setMessage("Shoe model updated successfully.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to update model"
      );
    } finally {
      setSaving(false);
    }
  }

  async function changeVerification(shoe: ShoeModel) {
    if (saving) return;
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/shoe-models", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: shoe.id, active: !shoe.active }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to change verification");
      await loadModels();
      setMessage(shoe.active ? "Model removed from verified receiving." : "Model verified for receiving.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to change verification");
    } finally {
      setSaving(false);
    }
  }

  const filteredModels = models.filter((shoe) => {
    const query = search.toLowerCase().trim();

    return (
      `${shoe.brand} ${shoe.model} ${shoe.version ?? ""}`
        .toLowerCase()
        .includes(query)
    );
  });

  const brandCount = new Set(
    models.map((shoe) => shoe.brand.trim().toLowerCase())
  ).size;

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
          { label: "Approved Models", value: models.filter((shoe) => shoe.active).length },
          { label: "Brands", value: brandCount },
        ].map((stat) => (
          <div
            key={stat.label}
            style={{
              padding: "18px",
              background: "var(--surface-blue)",
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

      <section style={{ marginBottom: "30px" }}>
        <h2
          style={{
            fontSize: "19px",
            fontWeight: 700,
            margin: "0 0 5px",
          }}
        >
          Add Approved Shoe Model
        </h2>

        <p
          style={{
            fontSize: "13px",
            color: "#64748b",
            margin: "0 0 18px",
          }}
        >
          Add a model to the approved catalog before
          receiving its inventory.
        </p>

        <form onSubmit={addModel}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "14px",
            }}
          >
            {fields.map(({ key, label, type }) => (
              <label
                key={key}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "7px",
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "#475569",
                }}
              >
                {label}
                <input
                  style={inputStyle}
                  required={key !== "version"}
                  type={type}
                  min={type === "number" ? "0" : undefined}
                  step={type === "number" ? "0.01" : undefined}
                  value={form[key]}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      [key]: event.target.value,
                    }))
                  }
                />
              </label>
            ))}
          </div>

          <button
            type="submit"
            disabled={saving}
            style={{
              ...buttonStyle,
              marginTop: "18px",
              background: "var(--action-blue)",
              borderColor: "var(--action-blue)",
              color: "#ffffff",
              padding: "12px 18px",
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "Saving..." : "+ Add Model"}
          </button>
        </form>
      </section>

      {error && (
        <div
          role="alert"
          style={{
            padding: "12px 16px",
            marginBottom: "18px",
            background: "#fef2f2",
            color: "#b91c1c",
            borderRadius: "8px",
            fontSize: "14px",
          }}
        >
          {error}
        </div>
      )}

      {message && (
        <div
          role="status"
          style={{
            padding: "12px 16px",
            marginBottom: "18px",
            background: "#f0fdf4",
            color: "#166534",
            borderRadius: "8px",
            fontSize: "14px",
          }}
        >
          {message}
        </div>
      )}

      <section>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "14px",
            marginBottom: "16px",
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
              Shoe Models
            </h2>

            <p
              style={{
                fontSize: "13px",
                color: "#64748b",
                margin: 0,
              }}
            >
              Unverified models are hidden from receiving. Existing stock stays in inventory.
            </p>
          </div>

          <input
            type="search"
            aria-label="Search shoe models"
            placeholder="Search brand or model..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            style={{
              ...inputStyle,
              width: "260px",
              maxWidth: "100%",
            }}
          />
        </div>

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
            <thead style={{ background: "var(--surface-blue)" }}>
              <tr>
                {[
                  "Brand",
                  "Model",
                  "Version",
                  "Retail Price",
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
              {filteredModels.map((shoe) => (
                <tr
                  key={shoe.id}
                  style={{
                    borderTop: "1px solid #e2e8f0",
                  }}
                >
                  {editing === shoe.id ? (
                    <>
                      {fields.map(({ key, type }) => (
                        <td key={key} style={cellStyle}>
                          <input
                            aria-label={`Edit ${key}`}
                            type={type}
                            value={editForm[key]}
                            min={
                              type === "number" ? "0" : undefined
                            }
                            step={
                              type === "number" ? "0.01" : undefined
                            }
                            onChange={(event) =>
                              setEditForm((previous) => ({
                                ...previous,
                                [key]: event.target.value,
                              }))
                            }
                            style={{
                              ...inputStyle,
                              minWidth: "110px",
                            }}
                          />
                        </td>
                      ))}

                      <td style={cellStyle}>
                        <div
                          style={{
                            display: "flex",
                            gap: "8px",
                          }}
                        >
                          <button
                            type="button"
                            disabled={saving}
                            onClick={saveEdit}
                            style={{
                              ...buttonStyle,
                              background: "var(--action-blue)",
                              color: "#ffffff",
                              borderColor: "var(--action-blue)",
                            }}
                          >
                            {saving ? "Saving..." : "Save"}
                          </button>

                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => setEditing(null)}
                            style={buttonStyle}
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td
                        style={{
                          ...cellStyle,
                          fontWeight: 700,
                          color: "#0f172a",
                        }}
                      >
                        {shoe.brand}
                      </td>

                      <td
                        style={{
                          ...cellStyle,
                          fontWeight: 600,
                        }}
                      >
                        {shoe.model}
                      </td>

                      <td style={cellStyle}>
                        {shoe.version || "—"}
                      </td>

                      <td
                        style={{
                          ...cellStyle,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        ${Number(shoe.retail_price).toFixed(2)}
                      </td>

                      <td style={cellStyle}>
                        <button
                          type="button"
                          disabled={saving || editing !== null}
                          onClick={() => startEditing(shoe)}
                          style={buttonStyle}
                        >
                          Edit
                        </button>
                        {" "}
                        <button
                          type="button"
                          disabled={saving || editing !== null}
                          onClick={() => void changeVerification(shoe)}
                          style={buttonStyle}
                        >
                          {shoe.active ? "Remove Verification" : "Verify Again"}
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}

              {!loading && filteredModels.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    style={{
                      padding: "28px",
                      textAlign: "center",
                      color: "#64748b",
                    }}
                  >
                    {models.length === 0
                      ? "No approved shoe models yet."
                      : "No models match your search."}
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
              Loading catalog...
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
            Showing {filteredModels.length} of {models.length} models
          </p>
        )}
      </section>
    </div>
  );
}
