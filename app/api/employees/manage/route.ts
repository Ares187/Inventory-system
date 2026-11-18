
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabase-admin";
import { getLoggedInEmployee } from "../../../../lib/employee-session";

type Role = "owner" | "chief" | "manager" | "employee";

function canManage(role: string) {
  return ["owner", "chief", "manager"].includes(role);
}

function canCreateRole(actor: Role, target: Role) {
  if (actor === "owner") {
    return ["chief", "manager", "employee"].includes(target);
  }

  if (actor === "chief") {
    return ["manager", "employee"].includes(target);
  }

  if (actor === "manager") {
    return ["manager", "employee"].includes(target);
  }

  return false;
}

function canModifyTarget(
  actor: Role,
  target: Role,
  action: string,
  newRole?: Role
) {
  if (actor === "owner") {
    if (target === "owner") {
      return action === "pin";
    }

    return true;
  }

  if (target === "owner" || target === "chief") {
    return false;
  }

  if (actor === "chief") {
    return newRole !== "chief" && newRole !== "owner";
  }

  if (actor === "manager") {
    if (target === "manager") {
      return false;
    }

    if (action === "role") {
      return newRole === "employee" || newRole === "manager";
    }

    return target === "employee";
  }

  return false;
}

export async function GET() {
  try {
    const employee = await getLoggedInEmployee();

    if (!employee) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    if (!canManage(employee.role)) {
      return NextResponse.json(
        { error: "Management permission required" },
        { status: 403 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("employees")
      .select("id, name, role, active, created_at")
      .is("deleted_at", null)
      .order("name");

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      employees: data,
      viewerRole: employee.role,
    });
  } catch (error) {
    console.error("Employee management error:", error);

    return NextResponse.json(
      { error: "Unable to load employees" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const employee = await getLoggedInEmployee();

    if (!employee) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    if (!canManage(employee.role)) {
      return NextResponse.json(
        { error: "Management permission required" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, pin, role } = body;

    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof pin !== "string" ||
      !/^[0-9]{4}$/.test(pin) ||
      !["employee", "manager", "chief"].includes(role)
    ) {
      return NextResponse.json(
        { error: "Invalid employee information" },
        { status: 400 }
      );
    }

    if (!canCreateRole(employee.role as Role, role as Role)) {
      return NextResponse.json(
        { error: "You cannot create an employee with this role" },
        { status: 403 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase.rpc(
      "create_employee",
      {
        p_name: name.trim(),
        p_pin: pin,
        p_role: role,
        p_actor_id: employee.id,
      }
    );

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      employeeId: data,
    });
  } catch (error) {
    console.error("Employee creation error:", error);

    return NextResponse.json(
      { error: "Unable to create employee" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const employee = await getLoggedInEmployee();

    if (!employee) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    if (!canManage(employee.role)) {
      return NextResponse.json(
        { error: "Management permission required" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { employeeId, action, value } = body;

    if (
      !Number.isSafeInteger(employeeId) ||
      employeeId <= 0 ||
      !["role", "pin", "activate", "deactivate"].includes(action)
    ) {
      return NextResponse.json(
        { error: "Invalid employee update" },
        { status: 400 }
      );
    }

    if (
      (action === "role" &&
        !["employee", "manager", "chief"].includes(value)) ||
      (action === "pin" &&
        (typeof value !== "string" ||
          !/^[0-9]{4}$/.test(value)))
    ) {
      return NextResponse.json(
        { error: "Invalid role or PIN" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: target, error: targetError } = await supabase
      .from("employees")
      .select("id, role")
      .eq("id", employeeId)
      .single();

    if (targetError || !target) {
      return NextResponse.json(
        { error: "Employee not found" },
        { status: 404 }
      );
    }

    if (
      !canModifyTarget(
        employee.role as Role,
        target.role as Role,
        action,
        action === "role" ? (value as Role) : undefined
      )
    ) {
      return NextResponse.json(
        { error: "You cannot modify this employee" },
        { status: 403 }
      );
    }

    const { error } = await supabase.rpc("update_employee", {
      p_actor_id: employee.id,
      p_target_id: employeeId,
      p_action: action,
      p_value:
        action === "activate" || action === "deactivate"
          ? ""
          : value,
    });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Employee update error:", error);

    return NextResponse.json(
      { error: "Unable to update employee" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const employee = await getLoggedInEmployee();

    if (!employee) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    if (!canManage(employee.role)) {
      return NextResponse.json(
        { error: "Management permission required" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { employeeId } = body;

    if (!Number.isSafeInteger(employeeId) || employeeId <= 0) {
      return NextResponse.json(
        { error: "Invalid employee ID" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: target, error: targetError } = await supabase
      .from("employees")
      .select("id, role, active")
      .eq("id", employeeId)
      .single();

    if (targetError || !target) {
      return NextResponse.json(
        { error: "Employee not found" },
        { status: 404 }
      );
    }

    if (
      employee.id === employeeId ||
      !canModifyTarget(
        employee.role as Role,
        target.role as Role,
        "delete"
      )
    ) {
      return NextResponse.json(
        { error: "You cannot delete this employee" },
        { status: 403 }
      );
    }

    // Deactivate through the existing audited database function.
    const { error: updateError } = await supabase.rpc(
      "update_employee",
      {
        p_actor_id: employee.id,
        p_target_id: employeeId,
        p_action: "deactivate",
        p_value: "",
      }
    );

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 400 }
      );
    }

    
const { error: deleteError } = await supabase
  .from("employees")
  .update({
    deleted_at: new Date().toISOString(),
    active: false,
  })
  .eq("id", employeeId);

if (deleteError) {
  return NextResponse.json(
    { error: deleteError.message },
    { status: 500 }
  );
}

return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Employee deletion error:", error);

    return NextResponse.json(
      { error: "Unable to delete employee" },
      { status: 500 }
    );
  }
}
