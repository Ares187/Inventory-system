
import { redirect } from "next/navigation";
import { getLoggedInEmployee } from "../../../lib/employee-session";
import ShoeCatalog from "./ShoeCatalog";

export default async function ManageInventoryPage() {
  const employee = await getLoggedInEmployee();

  if (!employee) {
    redirect("/login");
  }

  if (
    employee.role !== "owner" &&
    employee.role !== "chief" &&
    employee.role !== "manager"
  ) {
    redirect("/inventory");
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f8fafc",
        padding: "36px 24px",
        color: "#0f172a",
      }}
    >
      <div
        style={{
          maxWidth: "1100px",
          margin: "0 auto",
        }}
      >
        <header style={{ marginBottom: "28px" }}>
          <p
            style={{
              fontSize: "12px",
              fontWeight: 700,
              letterSpacing: "1.5px",
              textTransform: "uppercase",
              color: "#64748b",
              margin: "0 0 8px",
            }}
          >
            Sneaker Factory / Administration
          </p>

          <h1
            style={{
              fontSize: "32px",
              fontWeight: 750,
              letterSpacing: "-0.8px",
              margin: "0 0 10px",
            }}
          >
            Shoe Catalog
          </h1>

          <p
            style={{
              color: "#64748b",
              fontSize: "15px",
              margin: 0,
              lineHeight: 1.6,
            }}
          >
            Approve running shoe models, manage retail
            prices, and maintain the catalog used for
            receiving inventory.
          </p>
        </header>

        <section
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            padding: "24px",
            boxShadow: "0 2px 8px rgba(15,23,42,0.03)",
          }}
        >
          <ShoeCatalog />
        </section>
      </div>
    </main>
  );
}
