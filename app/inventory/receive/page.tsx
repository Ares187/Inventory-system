
import { redirect } from "next/navigation";
import { getLoggedInEmployee } from "../../../lib/employee-session";
import StockManagement from "./StockManagement";

export default async function StockManagementPage() {
  const employee = await getLoggedInEmployee();

  if (!employee) {
    redirect("/login");
  }

  return <StockManagement />;
}
