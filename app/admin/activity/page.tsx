
import { redirect } from "next/navigation";
import { getLoggedInEmployee } from "../../../lib/employee-session";
import { getSupabaseAdmin } from "../../../lib/supabase-admin";

export const dynamic = "force-dynamic";

type Activity = {
  id: number;
  created_at: string;
  employee_id: number | null;
  store_id: number | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  description: string | null;
  old_values: unknown;
  new_values: unknown;
  metadata: unknown;
};

type Employee = {
  id: number;
  name: string;
};

type Store = {
  id: number;
  name: string;
};

type Product = {
  id: number;
  brand: string;
  model: string;
  version: string | null;
  gender: string;
  size: string;
  width: string;
  color: string;
};

type SearchParams = {
  employee?: string;
  store?: string;
  category?: string;
  from?: string;
  to?: string;
  page?: string;
};

const PAGE_SIZE = 50;

function categoryFor(action: string) {
  if (action.startsWith("integration.")) return "integration";
  if (action.startsWith("inventory.")) return "inventory";
  if (action.startsWith("employee.")) return "employee";
  if (action.startsWith("shoe_model.")) return "catalog";
  if (action.startsWith("product.")) return "catalog";
  return "other";
}

function readableAction(action: string) {
  const labels: Record<string, string> = {
    "integration.sale_applied": "Sale processed",
    "integration.sale_failed": "Sale failed",
    "integration.retry_requested": "Retry requested",
    "employee.created": "Employee created",
    "employee.updated": "Employee updated",
    "shoe_model.created": "Shoe model created",
    "shoe_model.updated": "Shoe model updated",
    "product.created": "Product created",
    "product.updated": "Product updated",
    "inventory.sale": "Inventory sale",
    "inventory.receiving": "Stock received",
    "inventory.transfer": "Stock transferred",
    "inventory.transfer_in": "Transfer received",
    "inventory.transfer_out": "Transfer sent",
    "inventory.correction": "Inventory corrected",
    "inventory.adjustment": "Inventory adjusted",
    "inventory.return": "Stock returned",
  };

  return (
    labels[action] ??
    action
      .replace(/[._]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function validDate(value?: string) {
  return (
    !!value &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  return value as Record<string, unknown>;
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function ActivityDescription({
  activity,
  productNames,
}: {
  activity: Activity;
  productNames: Map<number, string>;
}) {
  const before = asObject(activity.old_values);
  const after = asObject(activity.new_values);
  const metadata = asObject(activity.metadata);
  const details = asObject(metadata?.details);

  if (activity.entity_type === "inventory_movement") {
    const productId = Number(
      after?.product_id ?? before?.product_id
    );

    const shoeName =
      productNames.get(productId) ??
      (Number.isFinite(productId)
        ? `Product #${productId}`
        : "Unknown product");

    const quantityBefore = before?.quantity;
    const quantityAfter = after?.quantity;

    const change = metadata?.quantity_change;
    const numericChange =
      typeof change === "number" ? change : null;

    return (
      <div>
        <strong>{shoeName}</strong>

        <div style={{ marginTop: "5px" }}>
          {activity.description ?? readableAction(activity.action)}
        </div>

        {quantityBefore !== undefined &&
          quantityAfter !== undefined && (
            <div style={{ marginTop: "5px" }}>
              Stock: {displayValue(quantityBefore)}
              {" → "}
              {displayValue(quantityAfter)}
            </div>
          )}

        {numericChange !== null && (
          <div
            style={{
              marginTop: "4px",
              fontWeight: 600,
            }}
          >
            Change: {numericChange > 0 ? "+" : ""}
            {numericChange} units
          </div>
        )}
      </div>
    );
  }

  if (activity.action.startsWith("integration.")) {
    const heading =
      activity.action === "integration.sale_applied"
        ? "Sale successfully processed"
        : activity.action === "integration.sale_failed"
        ? "Sale processing failed"
        : activity.action === "integration.retry_requested"
        ? "Sale retry requested"
        : readableAction(activity.action);

    return (
      <div>
        <strong>{heading}</strong>

        {metadata?.provider !== undefined && (
          <div style={{ marginTop: "5px" }}>
            Provider: {displayValue(metadata.provider)}
          </div>
        )}

        {details?.external_event_id !== undefined && (
          <div style={{ marginTop: "5px" }}>
            Sale ID: {displayValue(details.external_event_id)}
          </div>
        )}

        {details?.item_count !== undefined && (
          <div style={{ marginTop: "5px" }}>
            Items: {displayValue(details.item_count)}
          </div>
        )}

        {details?.previous_status !== undefined && (
          <div style={{ marginTop: "5px" }}>
            Previous status: {displayValue(details.previous_status)}
          </div>
        )}

        {details?.new_status !== undefined && (
          <div style={{ marginTop: "5px" }}>
            New status: {displayValue(details.new_status)}
          </div>
        )}

        {details?.error !== undefined && (
          <div
            style={{
              color: "#dc2626",
              marginTop: "5px",
              overflowWrap: "anywhere",
            }}
          >
            Error: {displayValue(details.error)}
          </div>
        )}

        {activity.entity_id && (
          <div style={{ marginTop: "5px", fontSize: "12px" }}>
            Integration event #{activity.entity_id}
          </div>
        )}
      </div>
    );
  }

  return <>{activity.description ?? "—"}</>;
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const employee = await getLoggedInEmployee();

  if (!employee) {
    redirect("/login");
  }

  if (employee.role !== "owner") {
    redirect("/inventory");
  }

  const params = await searchParams;
  const db = getSupabaseAdmin();

  const [
    { data: employeeData },
    { data: storeData },
    { data: productData },
  ] = await Promise.all([
    db.from("employees").select("id, name").order("name"),
    db.from("stores").select("id, name").order("name"),
    db
      .from("products")
      .select(
        "id, brand, model, version, gender, size, width, color"
      ),
  ]);

  const employees = (employeeData ?? []) as Employee[];
  const stores = (storeData ?? []) as Store[];
  const products = (productData ?? []) as Product[];

  const employeeNames = new Map(
    employees.map((e) => [e.id, e.name])
  );

  const storeNames = new Map(
    stores.map((s) => [s.id, s.name])
  );

  const productNames = new Map(
    products.map((p) => [
      p.id,
      `${p.brand} ${p.model} ${p.version ?? ""} — ${p.gender}, Size ${p.size}, Width ${p.width}, ${p.color}`,
    ])
  );

  const selectedEmployee = params.employee ?? "";
  const selectedStore = params.store ?? "";
  const selectedCategory = params.category ?? "";
  const selectedFrom = validDate(params.from)
    ? params.from!
    : "";
  const selectedTo = validDate(params.to)
    ? params.to!
    : "";

  const parsedPage = Number(params.page);

  const page =
    Number.isSafeInteger(parsedPage) && parsedPage > 0
      ? parsedPage
      : 1;

  let query = db
    .from("activity_log")
    .select(
      "id, created_at, employee_id, store_id, action, entity_type, entity_id, description, old_values, new_values, metadata",
      { count: "exact" }
    );

  if (selectedEmployee === "system") {
    query = query.is("employee_id", null);
  } else if (/^\d+$/.test(selectedEmployee)) {
    query = query.eq(
      "employee_id",
      Number(selectedEmployee)
    );
  }

  if (/^\d+$/.test(selectedStore)) {
    query = query.eq("store_id", Number(selectedStore));
  }

  if (selectedCategory === "integration") {
    query = query.like("action", "integration.%");
  } else if (selectedCategory === "inventory") {
    query = query.like("action", "inventory.%");
  } else if (selectedCategory === "employee") {
    query = query.like("action", "employee.%");
  } else if (selectedCategory === "catalog") {
    query = query.or(
      "action.like.shoe_model.%,action.like.product.%"
    );
  }

  if (selectedFrom) {
    query = query.gte(
      "created_at",
      `${selectedFrom}T00:00:00.000Z`
    );
  }

  if (selectedTo) {
    const nextDay = new Date(
      `${selectedTo}T00:00:00.000Z`
    );

    nextDay.setUTCDate(nextDay.getUTCDate() + 1);

    query = query.lt(
      "created_at",
      nextDay.toISOString()
    );
  }

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(
      (page - 1) * PAGE_SIZE,
      page * PAGE_SIZE - 1
    );

  const activities = (data ?? []) as Activity[];
  const total = count ?? 0;

  const totalPages = Math.max(
    1,
    Math.ceil(total / PAGE_SIZE)
  );

  function pageUrl(nextPage: number) {
    const url = new URLSearchParams();

    if (selectedEmployee) {
      url.set("employee", selectedEmployee);
    }

    if (selectedStore) {
      url.set("store", selectedStore);
    }

    if (selectedCategory) {
      url.set("category", selectedCategory);
    }

    if (selectedFrom) {
      url.set("from", selectedFrom);
    }

    if (selectedTo) {
      url.set("to", selectedTo);
    }

    url.set("page", String(nextPage));

    return `/admin/activity?${url.toString()}`;
  }

  const inputStyle = {
    padding: "9px",
    border: "1px solid #ccc",
    borderRadius: "6px",
    minWidth: "150px",
  };

  const cellStyle = {
    padding: "12px 10px",
    borderBottom: "1px solid #ddd",
    verticalAlign: "top" as const,
  };

  return (
    <main
      style={{
        padding: "24px",
        maxWidth: "1400px",
        margin: "0 auto",
      }}
    >
      <h1>Master Activity Log</h1>

      <p>
        Owner-only history of inventory, employee,
        catalog, and integration activity.
      </p>

      <form
        method="GET"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "12px",
          alignItems: "end",
          margin: "24px 0",
          padding: "18px",
          border: "1px solid #ddd",
          borderRadius: "8px",
        }}
      >
        <label>
          Employee
          <br />
          <select
            name="employee"
            defaultValue={selectedEmployee}
            style={inputStyle}
          >
            <option value="">All employees</option>
            <option value="system">
              System / Integration
            </option>

            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Store
          <br />
          <select
            name="store"
            defaultValue={selectedStore}
            style={inputStyle}
          >
            <option value="">All stores</option>

            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Activity Type
          <br />
          <select
            name="category"
            defaultValue={selectedCategory}
            style={inputStyle}
          >
            <option value="">All activity</option>
            <option value="inventory">Inventory</option>
            <option value="integration">
              Hike Integration
            </option>
            <option value="employee">Employees</option>
            <option value="catalog">Shoe Catalog</option>
          </select>
        </label>

        <label>
          From
          <br />
          <input
            type="date"
            name="from"
            defaultValue={selectedFrom}
            style={inputStyle}
          />
        </label>

        <label>
          To
          <br />
          <input
            type="date"
            name="to"
            defaultValue={selectedTo}
            style={inputStyle}
          />
        </label>

        <button
          type="submit"
          style={{
            ...inputStyle,
            cursor: "pointer",
          }}
        >
          Apply Filters
        </button>

        <a
          href="/admin/activity"
          style={{ padding: "10px" }}
        >
          Clear
        </a>
      </form>

      {error ? (
        <p
          role="alert"
          style={{ color: "#dc2626" }}
        >
          Unable to load activity: {error.message}
        </p>
      ) : (
        <>
          <p>
            Showing{" "}
            {activities.length === 0
              ? 0
              : (page - 1) * PAGE_SIZE + 1}
            {"–"}
            {Math.min(page * PAGE_SIZE, total)} of{" "}
            {total} activities
          </p>

          {activities.length === 0 ? (
            <p>
              No activities match these filters.
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  textAlign: "left",
                }}
              >
                <thead>
                  <tr>
                    {[
                      "Time",
                      "Employee",
                      "Store",
                      "Action",
                      "Item",
                      "Description",
                      "Details",
                    ].map((heading) => (
                      <th
                        key={heading}
                        style={cellStyle}
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {activities.map((activity) => (
                    <tr key={activity.id}>
                      <td style={cellStyle}>
                        {new Date(
                          activity.created_at
                        ).toLocaleString("en-US", {
                          timeZone:
                            "America/New_York",
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </td>

                      <td style={cellStyle}>
                        {activity.employee_id === null
                          ? "System"
                          : employeeNames.get(
                              activity.employee_id
                            ) ??
                            `Employee #${activity.employee_id}`}
                      </td>

                      <td style={cellStyle}>
                        {activity.store_id === null
                          ? "—"
                          : storeNames.get(
                              activity.store_id
                            ) ??
                            `Store #${activity.store_id}`}
                      </td>

                      <td style={cellStyle}>
                        <strong>
                          {readableAction(
                            activity.action
                          )}
                        </strong>

                        <div
                          style={{
                            fontSize: "12px",
                            opacity: 0.65,
                          }}
                        >
                          {categoryFor(
                            activity.action
                          )}
                        </div>
                      </td>

                      <td style={cellStyle}>
                        {activity.entity_type}
                        {activity.entity_id
                          ? ` #${activity.entity_id}`
                          : ""}
                      </td>

                      <td style={cellStyle}>
                        <ActivityDescription
                          activity={activity}
                          productNames={productNames}
                        />
                      </td>

                      <td style={cellStyle}>
                        <details>
                          <summary
                            style={{
                              cursor: "pointer",
                            }}
                          >
                            View
                          </summary>

                          <pre
                            style={{
                              whiteSpace: "pre-wrap",
                              overflowWrap: "anywhere",
                              fontSize: "12px",
                              maxWidth: "350px",
                            }}
                          >
                            {JSON.stringify(
                              {
                                before:
                                  activity.old_values,
                                after:
                                  activity.new_values,
                                metadata:
                                  activity.metadata,
                              },
                              null,
                              2
                            )}
                          </pre>
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div
            style={{
              display: "flex",
              gap: "20px",
              alignItems: "center",
              marginTop: "24px",
            }}
          >
            {page > 1 && (
              <a href={pageUrl(page - 1)}>
                Previous
              </a>
            )}

            <span>
              Page {page} of {totalPages}
            </span>

            {page < totalPages && (
              <a href={pageUrl(page + 1)}>
                Next
              </a>
            )}
          </div>
        </>
      )}
    </main>
  );
}
