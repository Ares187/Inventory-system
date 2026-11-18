
import type { ReactNode } from "react";
import Navigation from "./Navigation";
import { getLoggedInEmployee } from "../lib/employee-session";

export default async function Layout({
  children,
}: {
  children: ReactNode;
}) {
  const employee = await getLoggedInEmployee();

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: "Arial, sans-serif",
          background: "#f5f7fa",
          color: "#172334",
        }}
      >
        {employee && <Navigation role={employee.role} />}
        {children}
      </body>
    </html>
  );
}
