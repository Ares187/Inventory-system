
"use client";

import { useEffect, useState } from "react";

type Employee = {
  id: number;
  name: string;
};

export default function LoginPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadEmployees() {
      try {
        const response = await fetch("/api/employees");

        if (!response.ok) {
          throw new Error("Unable to load employees");
        }

        const data = await response.json();
        setEmployees(data.employees);
      } catch {
        setMessage("Unable to load employee list.");
      }
    }

    loadEmployees();
  }, []);

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault();

    setMessage("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/verify-pin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          employeeId: Number(employeeId),
          pin,
        }),
      });

      if (!response.ok) {
        setMessage("Incorrect employee or PIN.");
        return;
      }

      const data = await response.json();

      if (data.valid === true) {
        setPin("");
        window.location.assign("/inventory");
      } else {
        setMessage("Incorrect employee or PIN.");
      }
    } catch {
      setMessage("Unable to connect to the server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--page-blue)",
        padding: "20px",
      }}
    >
      <form
        onSubmit={handleLogin}
        style={{
          width: "100%",
          maxWidth: "380px",
          background: "white",
          padding: "32px",
          borderRadius: "12px",
          boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
        }}
      >
        <h1 style={{ fontSize: "26px", fontWeight: 700 }}>
          Sneaker Factory
        </h1>

        <p style={{ color: "#666", marginTop: "8px" }}>
          Employee Inventory Login
        </p>

        <label
          htmlFor="employee"
          style={{ display: "block", marginTop: "28px" }}
        >
          Employee
        </label>

        <select
          id="employee"
          value={employeeId}
          onChange={(event) => setEmployeeId(event.target.value)}
          required
          style={{
            width: "100%",
            padding: "12px",
            marginTop: "8px",
            border: "1px solid #ccc",
            borderRadius: "6px",
            color: "#111",
            background: "#fff",
          }}
        >
          <option value="">Select your name</option>
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.name}
            </option>
          ))}
        </select>

        <label
          htmlFor="pin"
          style={{ display: "block", marginTop: "20px" }}
        >
          4-Digit PIN
        </label>

        <input
          id="pin"
          type="password"
          inputMode="numeric"
          maxLength={4}
          pattern="[0-9]{4}"
          autoComplete="off"
          value={pin}
          onChange={(event) =>
            setPin(event.target.value.replace(/\D/g, ""))
          }
          required
          placeholder="Enter PIN"
          style={{
            width: "100%",
            padding: "12px",
            marginTop: "8px",
            border: "1px solid #ccc",
            borderRadius: "6px",
            color: "#111",
            background: "#fff",
          }}
        />

        <button
          type="submit"
          disabled={loading || !employeeId || pin.length !== 4}
          style={{
            width: "100%",
            padding: "14px",
            marginTop: "28px",
            background: "var(--action-blue)",
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "Verifying..." : "Log In"}
        </button>

        {message && (
          <p
            role="status"
            style={{
              marginTop: "20px",
              textAlign: "center",
              color: "#374151",
            }}
          >
            {message}
          </p>
        )}
      </form>
    </main>
  );
}
