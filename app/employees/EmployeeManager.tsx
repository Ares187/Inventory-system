
"use client";

import { useEffect, useState } from "react";
import type { CSSProperties, FormEvent } from "react";

type Role = "owner" | "chief" | "manager" | "employee";

type Employee = {
  id: number;
  name: string;
  role: Role;
  active: boolean;
};

const inputStyle: CSSProperties = {
  padding: "11px 13px",
  border: "1px solid #cbd5e1",
  borderRadius: "8px",
  background: "#ffffff",
  color: "#0f172a",
  fontSize: "14px",
  minHeight: "42px",
};

const buttonStyle: CSSProperties = {
  padding: "9px 13px",
  border: "1px solid #cbd5e1",
  borderRadius: "8px",
  background: "#ffffff",
  color: "#334155",
  cursor: "pointer",
  fontSize: "13px",
  fontWeight: 600,
};

const cellStyle: CSSProperties = {
  padding: "15px 12px",
  verticalAlign: "middle",
};

function canEditEmployee(
  viewerRole: Role | null,
  targetRole: Role
) {
  if (viewerRole === "owner") return true;
  if (targetRole === "owner" || targetRole === "chief") {
    return false;
  }
  if (viewerRole === "chief") return true;
  if (viewerRole === "manager") {
    return targetRole === "employee";
  }
  return false;
}

export default function EmployeeManager() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [role, setRole] = useState<
    "employee" | "manager" | "chief"
  >("employee");
  const [viewerRole, setViewerRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  async function loadEmployees() {
    const response = await fetch("/api/employees/manage", {
      cache: "no-store",
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result.error || "Unable to load employees"
      );
    }

    setEmployees(result.employees);
    setViewerRole(result.viewerRole ?? null);
  }

  useEffect(() => {
    loadEmployees().catch((error) => {
      setIsError(true);
      setMessage(
        error instanceof Error ? error.message : "Load failed"
      );
    });
  }, []);

  async function addEmployee(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (loading || busyId !== null) return;

    if (!name.trim() || !/^[0-9]{4}$/.test(pin)) {
      setIsError(true);
      setMessage("Enter a name and a four-digit PIN.");
      return;
    }

    setLoading(true);
    setMessage("");
    setIsError(false);

    try {
      const response = await fetch("/api/employees/manage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: name.trim(),
          pin,
          role,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || "Unable to add employee"
        );
      }

      setName("");
      setPin("");
      setRole("employee");

      await loadEmployees();
      setMessage("Employee added successfully.");
    } catch (error) {
      setIsError(true);
      setMessage(
        error instanceof Error
          ? error.message
          : "Request failed"
      );
    } finally {
      setLoading(false);
    }
  }

  async function updateEmployee(
    employee: Employee,
    action: "role" | "pin" | "activate" | "deactivate",
    value = ""
  ) {
    if (busyId !== null || loading) return;

    let newValue = value;

    if (action === "pin") {
      const entered = window.prompt(
        `Enter a new four-digit PIN for ${employee.name}:`
      );

      if (entered === null) return;

      if (!/^[0-9]{4}$/.test(entered)) {
        setIsError(true);
        setMessage("PIN must be exactly four digits.");
        return;
      }

      newValue = entered;
    }

    if (
      action === "deactivate" ||
      action === "activate"
    ) {
      const verb =
        action === "deactivate"
          ? "Deactivate"
          : "Reactivate";

      if (!window.confirm(`${verb} ${employee.name}?`)) {
        return;
      }
    }

    if (action === "role") {
      if (
        !window.confirm(
          `Change ${employee.name}'s role to ${newValue}?`
        )
      ) {
        return;
      }
    }

    setBusyId(employee.id);
    setMessage("");
    setIsError(false);

    try {
      const response = await fetch("/api/employees/manage", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          employeeId: employee.id,
          action,
          value: newValue,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || "Update failed"
        );
      }

      await loadEmployees();

      setMessage(
        `${employee.name} updated successfully.`
      );
    } catch (error) {
      setIsError(true);
      setMessage(
        error instanceof Error
          ? error.message
          : "Update failed"
      );
    } finally {
      setBusyId(null);
    }
  }

  async function deleteEmployee(employee: Employee) {
    if (busyId !== null || loading) return;

    if (
      !window.confirm(
        `Delete ${employee.name}?\n\n` +
          "This removes their account from the employee " +
          "directory and prevents future logins. " +
          "Historical activity will be preserved."
      )
    ) {
      return;
    }

    setBusyId(employee.id);
    setMessage("");
    setIsError(false);

    try {
      const response = await fetch("/api/employees/manage", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          employeeId: employee.id,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || "Delete failed"
        );
      }

      await loadEmployees();

      setMessage(
        `${employee.name} deleted successfully.`
      );
    } catch (error) {
      setIsError(true);
      setMessage(
        error instanceof Error
          ? error.message
          : "Delete failed"
      );
    } finally {
      setBusyId(null);
    }
  }

  const activeCount = employees.filter(
    (e) => e.active
  ).length;

  const managerCount = employees.filter(
    (e) => e.role === "manager" && e.active
  ).length;

  const chiefCount = employees.filter(
    (e) => e.role === "chief" && e.active
  ).length;

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(150px, 1fr))",
          gap: "12px",
          marginBottom: "28px",
        }}
      >
        {[
          {
            label: "Total Employees",
            value: employees.length,
          },
          {
            label: "Active Employees",
            value: activeCount,
          },
          {
            label: "Active Managers",
            value: managerCount,
          },
          {
            label: "Active Chiefs",
            value: chiefCount,
          },
        ].map((stat) => (
          <div
            key={stat.label}
            style={{
              padding: "18px",
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: "10px",
            }}
          >
            <div
              style={{
                color: "#64748b",
                fontSize: "12px",
                marginBottom: "8px",
              }}
            >
              {stat.label}
            </div>

            <div
              style={{
                fontSize: "27px",
                fontWeight: 750,
                color: "#0f172a",
              }}
            >
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      <section style={{ marginBottom: "30px" }}>
        <h2
          style={{
            fontSize: "19px",
            fontWeight: 700,
            margin: "0 0 5px",
          }}
        >
          Add Employee
        </h2>

        <p
          style={{
            fontSize: "13px",
            color: "#64748b",
            margin: "0 0 18px",
          }}
        >
          Create a staff account with a unique employee ID
          assigned automatically.
        </p>

        <form
          onSubmit={addEmployee}
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "12px",
            alignItems: "center",
          }}
        >
          <input
            style={{
              ...inputStyle,
              flex: "2 1 180px",
            }}
            placeholder="Employee name"
            value={name}
            onChange={(event) =>
              setName(event.target.value)
            }
            required
          />

          <input
            style={{
              ...inputStyle,
              flex: "1 1 130px",
            }}
            type="password"
            inputMode="numeric"
            maxLength={4}
            pattern="[0-9]{4}"
            placeholder="4-digit PIN"
            value={pin}
            onChange={(event) =>
              setPin(event.target.value)
            }
            required
          />

          <select
            style={{
              ...inputStyle,
              flex: "1 1 130px",
            }}
            value={role}
            onChange={(event) =>
              setRole(
                event.target.value as
                  | "employee"
                  | "manager"
                  | "chief"
              )
            }
          >
            <option value="employee">
              Employee
            </option>
            <option value="manager">
              Manager
            </option>
            {viewerRole === "owner" && (
              <option value="chief">
                Chief
              </option>
            )}
          </select>

          <button
            type="submit"
            disabled={
              loading || busyId !== null
            }
            style={{
              ...buttonStyle,
              background: "#0f172a",
              color: "#ffffff",
              borderColor: "#0f172a",
              padding: "12px 18px",
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading
              ? "Adding..."
              : "+ Add Employee"}
          </button>
        </form>
      </section>

      {message && (
        <div
          role={isError ? "alert" : "status"}
          style={{
            padding: "12px 16px",
            marginBottom: "22px",
            borderRadius: "8px",
            background: isError
              ? "#fef2f2"
              : "#f0fdf4",
            color: isError
              ? "#b91c1c"
              : "#166534",
            fontSize: "14px",
          }}
        >
          {message}
        </div>
      )}

      <section>
        <div
          style={{
            display: "flex",
            justifyContent:
              "space-between",
            alignItems: "center",
            marginBottom: "16px",
            flexWrap: "wrap",
            gap: "8px",
          }}
        >
          <div>
            <h2
              style={{
                fontSize: "19px",
                fontWeight: 700,
                margin: "0 0 5px",
              }}
            >
              Employee Directory
            </h2>

            <p
              style={{
                fontSize: "13px",
                color: "#64748b",
                margin: 0,
              }}
            >
              Manage employee roles, PINs,
              and account status.
            </p>
          </div>

          <span
            style={{
              fontSize: "12px",
              color: "#64748b",
            }}
          >
            {employees.length} accounts
          </span>
        </div>

        <div
          style={{
            overflowX: "auto",
            border:
              "1px solid #e2e8f0",
            borderRadius: "10px",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              textAlign: "left",
              fontSize: "14px",
            }}
          >
            <thead
              style={{
                background: "#f8fafc",
              }}
            >
              <tr>
                {[
                  "Employee ID",
                  "Name",
                  "Role",
                  "Status",
                  "PIN",
                  "Account",
                ].map((heading) => (
                  <th
                    key={heading}
                    style={{
                      ...cellStyle,
                      fontSize: "12px",
                      fontWeight: 700,
                      color: "#64748b",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {employees.map((employee) => {
                const isOwner =
                  employee.role === "owner";

                const canEdit =
                  canEditEmployee(
                    viewerRole,
                    employee.role
                  );

                const busy =
                  busyId === employee.id;

                return (
                  <tr
                    key={employee.id}
                    style={{
                      borderTop:
                        "1px solid #e2e8f0",
                    }}
                  >
                    <td
                      style={{
                        ...cellStyle,
                        fontWeight: 700,
                        color: "#475569",
                        fontVariantNumeric:
                          "tabular-nums",
                      }}
                    >
                      #{employee.id}
                    </td>

                    <td
                      style={{
                        ...cellStyle,
                        fontWeight: 650,
                        color: "#0f172a",
                      }}
                    >
                      {employee.name}
                    </td>

                    <td style={cellStyle}>
                      {isOwner || !canEdit ? (
                        <span
                          style={{
                            padding:
                              "6px 11px",
                            background:
                              employee.role ===
                              "owner"
                                ? "#eff6ff"
                                : employee.role ===
                                    "chief"
                                  ? "#f5f3ff"
                                  : "#f1f5f9",
                            color:
                              employee.role ===
                              "owner"
                                ? "#1d4ed8"
                                : employee.role ===
                                    "chief"
                                  ? "#6d28d9"
                                  : "#475569",
                            borderRadius:
                              "20px",
                            fontWeight: 700,
                            fontSize: "12px",
                            textTransform:
                              "capitalize",
                          }}
                        >
                          {employee.role}
                        </span>
                      ) : (
                        <select
                          style={inputStyle}
                          value={employee.role}
                          disabled={
                            busyId !== null ||
                            loading
                          }
                          onChange={(event) =>
                            updateEmployee(
                              employee,
                              "role",
                              event.target.value
                            )
                          }
                        >
                          <option value="employee">
                            Employee
                          </option>
                          <option value="manager">
                            Manager
                          </option>
                          {viewerRole ===
                            "owner" && (
                            <option value="chief">
                              Chief
                            </option>
                          )}
                        </select>
                      )}
                    </td>

                    <td style={cellStyle}>
                      <span
                        style={{
                          display:
                            "inline-block",
                          padding:
                            "6px 11px",
                          borderRadius:
                            "20px",
                          fontSize: "12px",
                          fontWeight: 650,
                          background:
                            employee.active
                              ? "#f0fdf4"
                              : "#f1f5f9",
                          color:
                            employee.active
                              ? "#15803d"
                              : "#64748b",
                        }}
                      >
                        {employee.active
                          ? "Active"
                          : "Inactive"}
                      </span>
                    </td>

                    <td style={cellStyle}>
                      {canEdit ||
                      (isOwner &&
                        viewerRole ===
                          "owner") ? (
                        <button
                          type="button"
                          style={buttonStyle}
                          disabled={
                            busyId !== null ||
                            loading
                          }
                          onClick={() =>
                            updateEmployee(
                              employee,
                              "pin"
                            )
                          }
                        >
                          {busy
                            ? "Working..."
                            : "Reset PIN"}
                        </button>
                      ) : (
                        <span
                          style={{
                            color: "#94a3b8",
                          }}
                        >
                          —
                        </span>
                      )}
                    </td>

                    <td style={cellStyle}>
                      {canEdit && !isOwner ? (
                        <div
                          style={{
                            display: "flex",
                            gap: "8px",
                            alignItems:
                              "center",
                          }}
                        >
                          <button
                            type="button"
                            style={{
                              ...buttonStyle,
                              color:
                                employee.active
                                  ? "#b91c1c"
                                  : "#166534",
                            }}
                            disabled={
                              busyId !== null ||
                              loading
                            }
                            onClick={() =>
                              updateEmployee(
                                employee,
                                employee.active
                                  ? "deactivate"
                                  : "activate"
                              )
                            }
                          >
                            {busy
                              ? "Working..."
                              : employee.active
                                ? "Deactivate"
                                : "Reactivate"}
                          </button>

                          <button
                            type="button"
                            style={{
                              ...buttonStyle,
                              color: "#b91c1c",
                              borderColor:
                                "#fecaca",
                            }}
                            disabled={
                              busyId !== null ||
                              loading
                            }
                            onClick={() =>
                              deleteEmployee(
                                employee
                              )
                            }
                          >
                            {busy
                              ? "Working..."
                              : "Delete"}
                          </button>
                        </div>
                      ) : (
                        <span
                          style={{
                            color: "#94a3b8",
                          }}
                        >
                          —
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {employees.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      padding: "28px",
                      textAlign: "center",
                      color: "#64748b",
                    }}
                  >
                    No employees to display.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
