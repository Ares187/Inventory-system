
import type { ReactNode } from "react";
import "./theme.css";
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
          background: "var(--page-blue)",
          color: "var(--ink-blue)",
        }}
      >
        {employee && <Navigation role={employee.role} />}
        {children}
        <footer
          style={{
            padding: "8px 16px 12px",
            textAlign: "center",
            fontSize: 11,
            color: "#64748b",
          }}
        >
          © Evan Feldman
        </footer>
      </body>
    </html>
  );
}
