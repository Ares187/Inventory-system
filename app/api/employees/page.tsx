
import { redirect } from "next/navigation";
import { getLoggedInEmployee } from "../../../lib/employee-session";
import EmployeeManager from "../../employees/EmployeeManager";

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
        background: "#f3f4f6",
        padding: "32px",
        color: "#111827",
      }}
    >
      <div style={{ maxWidth: "900px", margin: "0 auto" }}>
        <a href="/inventory">← Back to Inventory</a>

        <h1 style={{ fontSize: "28px", marginTop: "24px" }}>
          Employee Management
        </h1>

        <p style={{ marginBottom: "24px" }}>
          Signed in as {employee.name} ({employee.role})
        </p>

        <EmployeeManager />
      </div>
    </main>
  );
}
