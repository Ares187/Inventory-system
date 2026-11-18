
import { redirect } from "next/navigation";
import { getLoggedInEmployee } from "../../lib/employee-session";
import { getSupabaseAdmin } from "../../lib/supabase-admin";

import TestSaleButton from "./TestSaleButton";
import IntegrationMonitor from "./IntegrationMonitor";

export const dynamic = "force-dynamic";

type IntegrationEvent = {
  id: number;
  provider: string;
  external_event_id: string;
  event_type: string;
  status: string;
  error_message: string | null;
  received_at: string;
};


type JoinedIntegrationEvent = {
  provider: string;
  external_event_id: string;
  status: string;
};

type SaleItemWithEvent = {
  id: number;
  external_store_id: string;
  external_product_id: string;
  integration_events:
    | JoinedIntegrationEvent
    | JoinedIntegrationEvent[]
    | null;
};


export default async function IntegrationTestPage() {
  const employee = await getLoggedInEmployee();

  if (!employee) {
    redirect("/login");
  }

  if (employee.role !== "owner") {
    redirect("/inventory");
  }

  const db = getSupabaseAdmin();

  // Fetch recent integration events.
  const {
    data: recentEvents,
    error: eventsError,
  } = await db
    .from("integration_events")
    .select(
      "id, provider, external_event_id, event_type, status, error_message, received_at"
    )
    .order("received_at", { ascending: false })
    .limit(10);

  // Fetch unresolved events separately.
  const {
    data: unresolvedEvents,
    error: unresolvedError,
  } = await db
    .from("integration_events")
    .select(
      "id, provider, external_event_id, event_type, status, error_message, received_at"
    )
    .in("status", ["failed", "ready", "pending"])
    .order("received_at", { ascending: false })
    .limit(100);

  // Fetch recently applied events.
  const {
    data: appliedEvents,
    error: appliedError,
  } = await db
    .from("integration_events")
    .select(
      "id, provider, external_event_id, event_type, status, error_message, received_at"
    )
    .eq("status", "applied")
    .order("received_at", { ascending: false })
    .limit(100);

  // Check Hike store mappings.
  const {
    data: mappings,
    error: mappingsError,
  } = await db
    .from("integration_store_mappings")
    .select("id")
    .eq("provider", "hike");

  const monitoringEvents: IntegrationEvent[] = [
    ...((unresolvedEvents ?? []) as IntegrationEvent[]),
    ...((appliedEvents ?? []) as IntegrationEvent[]),
  ];

  const monitoringError =
    unresolvedError ?? appliedError;

  // Fetch sale items for mapping diagnostics.
  const {
    data: saleItems,
    error: saleItemsError,
  } = await db
    .from("integration_event_items")
    .select(`
      id,
      external_store_id,
      external_product_id,
      integration_events!inner (
        provider,
        external_event_id,
        status
      )
    `)
    .limit(500);

  // Fetch store mappings.
  const {
    data: storeMappings,
    error: storeMappingsError,
  } = await db
    .from("integration_store_mappings")
    .select("provider, external_store_id");

  // Fetch product mappings.
  const {
    data: productMappings,
    error: productMappingsError,
  } = await db
    .from("integration_product_mappings")
    .select("provider, external_product_id");

  // Build lookup sets.
  const storeMappingKeys = new Set(
    (storeMappings ?? []).map(
      (mapping) =>
        `${mapping.provider}:${mapping.external_store_id}`
    )
  );

  const productMappingKeys = new Set(
    (productMappings ?? []).map(
      (mapping) =>
        `${mapping.provider}:${mapping.external_product_id}`
    )
  );

  // Identify missing mappings.
  const missingMappings = (
    (saleItems ?? []) as SaleItemWithEvent[]
  ).flatMap((item) => {
    // Supabase returns the joined event as an array.

const joinedEvent = item.integration_events;

const event = Array.isArray(joinedEvent)
  ? joinedEvent[0]
  : joinedEvent;

    // Skip items without a matching event.
    if (!event) {
      return [];
    }

    const provider = event.provider;

    const missingStore = !storeMappingKeys.has(
      `${provider}:${item.external_store_id}`
    );

    const missingProduct = !productMappingKeys.has(
      `${provider}:${item.external_product_id}`
    );

    if (!missingStore && !missingProduct) {
      return [];
    }

    return [
      {
        id: item.id,
        saleId: event.external_event_id,
        provider,
        storeId: missingStore
          ? item.external_store_id
          : null,
        productId: missingProduct
          ? item.external_product_id
          : null,
      },
    ];
  });

  const mappingDiagnosticsError =
    saleItemsError ??
    storeMappingsError ??
    productMappingsError;

  return (
    <main
      style={{
        padding: "24px",
        maxWidth: "1100px",
      }}
    >
      <h1>Hike Integration Test</h1>

      <p>
        Signed in as {employee.name} (Owner)
      </p>

      <p>
        Monitor integration activity and run
        isolated sale-processing tests.
      </p>

      <h2>Database Connection</h2>

      <p>
        Integration events:{" "}
        {eventsError
          ? "Connection error"
          : "Connected"}
      </p>

      <p>
        Hike store mappings:{" "}
        {mappingsError
          ? "Connection error"
          : "Connected"}
      </p>

      <p>
        Configured Hike store mappings:{" "}
        {mappings?.length ?? 0}
      </p>

      {/* Integration monitoring dashboard */}
      {monitoringError ? (
        <p style={{ color: "#dc2626" }}>
          Monitoring error:{" "}
          {monitoringError.message}
        </p>
      ) : (
        <>
          <IntegrationMonitor
            events={monitoringEvents}
          />

          <p
            style={{
              color: "#6b7280",
              fontSize: "13px",
              marginTop: "8px",
            }}
          >
            Monitoring displays up to 100
            unresolved events and 100 recently
            applied events. Counts reflect these
            loaded records, not necessarily
            all-time totals.
          </p>
        </>
      )}

      {/* Missing mapping diagnostics */}
      <section
        style={{
          border: "1px solid #d1d5db",
          borderRadius: "8px",
          padding: "20px",
          marginTop: "24px",
        }}
      >
        <h2>Missing Hike Mappings</h2>

        <p>
          Identifies sale items whose external
          store or product IDs are not connected
          to local inventory records.
        </p>

        {mappingDiagnosticsError ? (
          <p style={{ color: "#dc2626" }}>
            Error:{" "}
            {mappingDiagnosticsError.message}
          </p>
        ) : missingMappings.length === 0 ? (
          <p>
            No missing mappings found in the
            inspected sale items.
          </p>
        ) : (
          <div
            style={{
              overflowX: "auto",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                textAlign: "left",
              }}
            >
              <thead>
                <tr>
                  <th>Sale</th>
                  <th>Provider</th>
                  <th>Missing Store</th>
                  <th>Missing Product</th>
                </tr>
              </thead>

              <tbody>
                {missingMappings.map((item) => (
                  <tr key={item.id}>
                    <td>{item.saleId}</td>
                    <td>{item.provider}</td>
                    <td>
                      {item.storeId ?? "—"}
                    </td>
                    <td>
                      {item.productId ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p
          style={{
            color: "#6b7280",
            fontSize: "13px",
            marginTop: "12px",
          }}
        >
          Checks up to 500 sale items against
          currently loaded mappings. This is
          a diagnostic sample, not a complete
          inventory audit.
        </p>
      </section>

      {/* Existing sale testing controls */}
      <TestSaleButton />

      {/* Recent integration events */}
      <h2>Recent Integration Events</h2>

      {eventsError ? (
        <p>
          Error: {eventsError.message}
        </p>
      ) : recentEvents?.length ? (
        <div
          style={{
            overflowX: "auto",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              textAlign: "left",
            }}
          >
            <thead>
              <tr>
                <th>ID</th>
                <th>Provider</th>
                <th>Type</th>
                <th>Status</th>
                <th>Received</th>
              </tr>
            </thead>

            <tbody>
              {recentEvents.map((event) => (
                <tr key={event.id}>
                  <td>{event.id}</td>
                  <td>{event.provider}</td>
                  <td>{event.event_type}</td>
                  <td>{event.status}</td>
                  <td>
                    {new Date(
                      event.received_at
                    ).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>
          No integration events recorded yet.
        </p>
      )}
    </main>
  );
}
