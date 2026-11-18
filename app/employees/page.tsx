
import { redirect } from "next/navigation";
import { getLoggedInEmployee } from "../../lib/employee-session";
import EmployeeManager from "./EmployeeManager";

export default async function EmployeesPage() {
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
        <div style={{ marginBottom: "28px" }}>
          <p
            style={{
              fontSize: "12px",
              fontWeight: 700,
              letterSpacing: "1.5px",
              textTransform: "uppercase",
              color: "#64748b",
              marginBottom: "8px",
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
            Employee Management
          </h1>

          <p
            style={{
              color: "#64748b",
              fontSize: "15px",
              margin: 0,
            }}
          >
            Manage staff accounts, access levels,
            and employee identifiers.
          </p>
        </div>

        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            padding: "18px 22px",
            marginBottom: "24px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "12px",
                color: "#64748b",
                marginBottom: "5px",
              }}
            >
              CURRENTLY SIGNED IN
            </div>

            <div
              style={{
                fontWeight: 700,
                fontSize: "17px",
              }}
            >
              {employee.name}
            </div>

            <div
              style={{
                fontSize: "13px",
                color: "#64748b",
                marginTop: "4px",
              }}
            >
              Employee ID: {employee.id}
            </div>
          </div>

          <span
            style={{
              background: "#eff6ff",
              color: "#1d4ed8",
              padding: "7px 13px",
              borderRadius: "20px",
              fontSize: "13px",
              fontWeight: 700,
              textTransform: "capitalize",
            }}
          >
            {employee.role}
          </span>
        </div>

        <section
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            padding: "24px",
            boxShadow: "0 2px 8px rgba(15,23,42,0.03)",
          }}
        >
          <EmployeeManager />
        </section>
      </div>
    </main>
  );
}
