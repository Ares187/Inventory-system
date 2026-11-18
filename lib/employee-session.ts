
import "server-only";

import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "./supabase-admin";

export type EmployeeRole = "owner" | "chief" | "manager" | "employee";
export type LoggedInEmployee = {
  id: number;
  name: string;
  role: EmployeeRole;
};

export async function getLoggedInEmployee():
  Promise<LoggedInEmployee | null> {

  // Read the session cookie from the browser request
  const cookieStore = await cookies();
  const token = cookieStore.get("sf_session")?.value;

  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    return null;
  }

  // Hash the token before searching the database
  const tokenHash = createHash("sha256")
    .update(token)
    .digest("hex");

  const supabase = getSupabaseAdmin();

  // Look up the session and its associated employee
  const { data: session, error } = await supabase
    .from("employee_sessions")
    .select(`
        employee_id,
        expires_at,
        revoked_at,
        employees!employee_sessions_employee_id_fkey (
            id,
            name,
            role,
            active,
            deleted_at
        )
     `)
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) {
    console.error("Session lookup failed:", error.message);
    throw new Error("Unable to validate employee session");
  }

  if (!session) {
    return null;
  }

  // Reject expired or revoked sessions
  if (
    session.revoked_at ||
    new Date(session.expires_at).getTime() <= Date.now()
  ) {
    return null;
  }

  // Supabase returns the related employee record
  const employee = session.employees as unknown as {
  id: number;
  name: string;
  role: EmployeeRole;
  active: boolean;
  deleted_at: string | null;
} | null;

  // Reject employees whose accounts have been deactivated
  if (!employee || !employee.active || employee.deleted_at !== null) {
  return null;
}

  return {
    id: employee.id,
    name: employee.name,
    role: employee.role,
  };
}
