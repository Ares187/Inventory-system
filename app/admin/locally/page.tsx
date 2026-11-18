
import { redirect } from "next/navigation";
import { getLoggedInEmployee } from "../../../lib/employee-session";
import { getSupabaseAdmin } from "../../../lib/supabase-admin";

export const dynamic = "force-dynamic";

type Store = {
  id: number;
  name: string;
  locally_location_id: string | null;
};

type Product = {
  id: number;
  brand: string;
  model: string;
  size: string;
  width: string;
  color: string;
  upc: string | null;
  retail_price: number;
  active: boolean;
};

type InventoryRow = {
  store_id: number;
  product_id: number;
  quantity: number;
};

type ExportRecord = {
  id: number;
  store_id: number;
  status: string;
  dry_run: boolean;
  product_count: number;
  excluded_count: number;
  created_at: string;
  error_message: string | null;
};

function validUpc(value: string | null) {
  return !!value && /^[0-9]{12,14}$/.test(value.trim());
}

function getExclusionReason(product: Product | undefined) {
  if (!product) return "Product not found";
  if (!product.active) return "Inactive product";
  if (!product.upc?.trim()) return "Missing UPC";
  if (!validUpc(product.upc)) return "Invalid UPC";
  if (
    !Number.isFinite(Number(product.retail_price)) ||
    Number(product.retail_price) <= 0
  ) {
    return "Invalid price";
  }
  return null;
}

export default async function LocallyDashboard() {
  const employee = await getLoggedInEmployee();

  if (!employee) redirect("/login");
  if (employee.role !== "owner") redirect("/inventory");

  const db = getSupabaseAdmin();

  const [
    { data: stores, error: storesError },
    { data: products, error: productsError },
    { data: inventory, error: inventoryError },
    { data: exports, error: exportsError },
  ] = await Promise.all([
    db
      .from("stores")
      .select("id, name, locally_location_id")
      .eq("active", true)
      .order("id"),
    db
      .from("products")
      .select(
        "id, brand, model, size, width, color, upc, retail_price, active"
      ),
    db
      .from("inventory")
      .select("store_id, product_id, quantity"),
    db
      .from("locally_exports")
      .select(
        "id, store_id, status, dry_run, product_count, excluded_count, created_at, error_message"
      )
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  if (
    storesError ||
    productsError ||
    inventoryError ||
    exportsError
  ) {
    throw new Error(
      storesError?.message ??
        productsError?.message ??
        inventoryError?.message ??
        exportsError?.message ??
        "Unable to load Locally dashboard"
    );
  }

  const activeStores = (stores ?? []) as Store[];
  const allProducts = (products ?? []) as Product[];
  const inventoryRows = (inventory ?? []) as InventoryRow[];
  const recentExports = (exports ?? []) as ExportRecord[];

  const productMap = new Map(
    allProducts.map((product) => [product.id, product])
  );

  const storeNames = new Map(
    activeStores.map((store) => [store.id, store.name])
  );

  const storeStats = activeStores.map((store) => {
    const rows = inventoryRows.filter(
      (row) => row.store_id === store.id
    );

    let ready = 0;
    let excluded = 0;
    let zeroStock = 0;
    let missingUpc = 0;
    let invalidUpc = 0;
    let invalidPrice = 0;
    let inactive = 0;
    let invalidQuantity = 0;

    const exclusions: {
      productId: number;
      name: string;
      reason: string;
    }[] = [];

    for (const row of rows) {
      const product = productMap.get(row.product_id);
      const reason = getExclusionReason(product);

      const quantityValid =
        Number.isInteger(row.quantity) &&
        row.quantity >= 0;

      if (reason || !quantityValid) {
        excluded++;

        const finalReason =
          reason ?? "Invalid quantity";

        if (finalReason === "Missing UPC") missingUpc++;
        if (finalReason === "Invalid UPC") invalidUpc++;
        if (finalReason === "Invalid price") invalidPrice++;
        if (
          finalReason === "Inactive product" ||
          finalReason === "Product not found"
        ) {
          inactive++;
        }
        if (finalReason === "Invalid quantity") {
          invalidQuantity++;
        }

        exclusions.push({
          productId: row.product_id,
          name: product
            ? `${product.brand} ${product.model} ${product.size} ${product.width} ${product.color}`
            : `Product ${row.product_id}`,
          reason: finalReason,
        });
      } else {
        ready++;

        if (row.quantity === 0) {
          zeroStock++;
        }
      }
    }

    return {
      store,
      total: rows.length,
      ready,
      excluded,
      zeroStock,
      missingUpc,
      invalidUpc,
      invalidPrice,
      inactive,
      invalidQuantity,
      exclusions,
    };
  });

  const totals = storeStats.reduce(
    (acc, stats) => ({
      total: acc.total + stats.total,
      ready: acc.ready + stats.ready,
      excluded: acc.excluded + stats.excluded,
      zeroStock: acc.zeroStock + stats.zeroStock,
    }),
    { total: 0, ready: 0, excluded: 0, zeroStock: 0 }
  );

  const unmappedStores = activeStores.filter(
    (store) => !store.locally_location_id?.trim()
  ).length;

  const cardStyle: React.CSSProperties = {
    border: "1px solid #d1d5db",
    borderRadius: 8,
    padding: 16,
  };

  const cellStyle: React.CSSProperties = {
    padding: "10px 8px",
    borderBottom: "1px solid #e5e7eb",
  };

  return (
    <main
      style={{
        padding: 24,
        maxWidth: 1200,
        margin: "0 auto",
      }}
    >
      <h1>Locally Integration</h1>

      <p>
        Store-specific inventory readiness and dry-run exports.
        No inventory is currently being sent to Locally.
      </p>

      <h2>Overall Readiness</h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 12,
          marginBottom: 28,
        }}
      >
        {[
          ["Active stores", activeStores.length],
          ["Unmapped stores", unmappedStores],
          ["Stocked variants", totals.total],
          ["Export-ready", totals.ready],
          ["Excluded", totals.excluded],
          ["Zero-stock included", totals.zeroStock],
        ].map(([label, value]) => (
          <div key={label} style={cardStyle}>
            <div style={{ fontSize: 13, opacity: 0.75 }}>
              {label}
            </div>
            <div
              style={{
                fontSize: 28,
                fontWeight: 700,
              }}
            >
              {value}
            </div>
          </div>
        ))}
      </div>

      <h2>Store Readiness</h2>

      <div style={{ overflowX: "auto", marginBottom: 28 }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
          }}
        >
          <thead>
            <tr>
              {[
                "Store",
                "Stocked",
                "Ready",
                "Excluded",
                "Zero stock",
                "Mapping",
                "Test Export",
              ].map((heading) => (
                <th
                  key={heading}
                  style={{
                    ...cellStyle,
                    textAlign: "left",
                  }}
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {storeStats.map((stats) => (
              <tr key={stats.store.id}>
                <td style={cellStyle}>
                  <strong>{stats.store.name}</strong>
                </td>
                <td style={cellStyle}>{stats.total}</td>
                <td style={cellStyle}>{stats.ready}</td>
                <td style={cellStyle}>{stats.excluded}</td>
                <td style={cellStyle}>{stats.zeroStock}</td>
                <td style={cellStyle}>
                  {stats.store.locally_location_id?.trim()
                    ? "Mapped"
                    : "Not mapped"}
                </td>
                <td style={cellStyle}>
                  <a
                    href={`/api/locally/export?store=${stats.store.id}`}
                  >
                    Download CSV
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Excluded Products by Store</h2>

      <p>
        Only variants with an inventory record at a store
        are evaluated. Products never stocked at that store
        are not included.
      </p>

      {storeStats.map((stats) => (
        <details
          key={stats.store.id}
          style={{
            border: "1px solid #d1d5db",
            borderRadius: 8,
            padding: 16,
            marginBottom: 12,
          }}
        >
          <summary
            style={{
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            {stats.store.name}: {stats.excluded} excluded
          </summary>

          <p>
            Missing UPC: {stats.missingUpc} | Invalid UPC:{" "}
            {stats.invalidUpc} | Invalid price:{" "}
            {stats.invalidPrice} | Inactive/missing product:{" "}
            {stats.inactive} | Invalid quantity:{" "}
            {stats.invalidQuantity}
          </p>

          {stats.exclusions.length === 0 ? (
            <p>All stocked variants are export-ready.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                }}
              >
                <thead>
                  <tr>
                    <th style={{ ...cellStyle, textAlign: "left" }}>
                      Product ID
                    </th>
                    <th style={{ ...cellStyle, textAlign: "left" }}>
                      Product
                    </th>
                    <th style={{ ...cellStyle, textAlign: "left" }}>
                      Reason
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {stats.exclusions.map((item) => (
                    <tr key={item.productId}>
                      <td style={cellStyle}>
                        {item.productId}
                      </td>
                      <td style={cellStyle}>
                        {item.name}
                      </td>
                      <td style={cellStyle}>
                        {item.reason}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </details>
      ))}

      <h2 style={{ marginTop: 28 }}>Store Configuration</h2>

      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          marginBottom: 28,
        }}
      >
        <thead>
          <tr>
            <th style={{ ...cellStyle, textAlign: "left" }}>
              Store
            </th>
            <th style={{ ...cellStyle, textAlign: "left" }}>
              Locally Location ID
            </th>
          </tr>
        </thead>
        <tbody>
          {activeStores.map((store) => (
            <tr key={store.id}>
              <td style={cellStyle}>{store.name}</td>
              <td style={cellStyle}>
                {store.locally_location_id ??
                  "Not configured"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Recent Exports</h2>

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
          }}
        >
          <thead>
            <tr>
              {[
                "Date",
                "Store",
                "Status",
                "Included",
                "Excluded",
                "Error",
              ].map((heading) => (
                <th
                  key={heading}
                  style={{
                    ...cellStyle,
                    textAlign: "left",
                  }}
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {recentExports.map((record) => (
              <tr key={record.id}>
                <td style={cellStyle}>
                  {new Date(
                    record.created_at
                  ).toLocaleString()}
                </td>
                <td style={cellStyle}>
                  {storeNames.get(record.store_id) ??
                    `Store ${record.store_id}`}
                </td>
                <td style={cellStyle}>
                  {record.status}
                  {record.dry_run ? " (dry run)" : ""}
                </td>
                <td style={cellStyle}>
                  {record.product_count}
                </td>
                <td style={cellStyle}>
                  {record.excluded_count}
                </td>
                <td style={cellStyle}>
                  {record.error_message ?? "—"}
                </td>
              </tr>
            ))}
            {recentExports.length === 0 && (
              <tr>
                <td colSpan={6} style={cellStyle}>
                  No exports recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
