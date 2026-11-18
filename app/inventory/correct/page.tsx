
import { redirect } from "next/navigation";
import { getLoggedInEmployee } from "../../../lib/employee-session";
import InventoryCorrections from "./InventoryCorrections";


export default async function CorrectionsPage() {
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

  return <InventoryCorrections />;
}
