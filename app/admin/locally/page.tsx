
import { redirect } from "next/navigation";
import { getLoggedInEmployee } from "../../../lib/employee-session";
import { getSupabaseAdmin } from "../../../lib/supabase-admin";

import { generateLocallyExports, loadLocallyStores, locallyMappingIssue } from "../../../lib/locally/export";
import { locallyFeedEnabled, locallyFeedPath } from "../../../lib/locally/feed";

export const dynamic = "force-dynamic";

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

export default async function LocallyDashboard() {
  const employee = await getLoggedInEmployee();

  if (!employee) redirect("/login");
  if (employee.role !== "owner") redirect("/inventory");

  const db = getSupabaseAdmin();

  const [activeStores, { data: exports, error: exportsError }] = await Promise.all([
    loadLocallyStores(),
    db.from("locally_exports")
      .select("id,store_id,status,dry_run,product_count,excluded_count,created_at,error_message")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  if (exportsError) throw new Error(exportsError.message);
  const recentExports = (exports ?? []) as ExportRecord[];
  const storeNames = new Map(activeStores.map((store) => [store.id, store.name]));
  const storeStats = await generateLocallyExports(activeStores);
  const feedEnabled = locallyFeedEnabled();

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
    (store) => locallyMappingIssue(store, activeStores) !== null
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
        {" "}{feedEnabled
          ? "Hosted feed enabled. Confirm ingestion in the Locally account."
          : "Hosted feed disabled."}
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
                  {locallyMappingIssue(stats.store, activeStores) ?? "Mapped"}
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

          <p>{stats.blockingExclusions} stocked or invalid-quantity rows block publication.</p>

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
            <th style={{ ...cellStyle, textAlign: "left" }}>Hosted feed</th>
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
              <td style={cellStyle}>
                {feedEnabled && !locallyMappingIssue(store, activeStores) && locallyFeedPath(store) ? (
                  <a href={locallyFeedPath(store) ?? undefined} rel="noreferrer">Open private feed URL</a>
                ) : "Unavailable"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Recent Exports</h2>
      <p>A hosted response records a download request. Locally reports ingestion in its retailer portal.</p>

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
                  {record.dry_run ? " (dry run)" : " (hosted response)"}
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
