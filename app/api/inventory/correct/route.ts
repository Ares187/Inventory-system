
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabase-admin";
import { getLoggedInEmployee } from "../../../../lib/employee-session";

export async function POST(request: Request) {
  try {
    const employee = await getLoggedInEmployee();

    if (!employee) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    if (
      employee.role !== "owner" &&
      employee.role !== "chief" &&
      employee.role !== "manager"
    ) {
      return NextResponse.json(
        { error: "Manager permission required" },
        { status: 403 }
      );
    }

    const body = await request.json();

    const { storeId, productId, newQuantity } = body;

    if (
      !Number.isSafeInteger(storeId) ||
      storeId <= 0 ||
      !Number.isSafeInteger(productId) ||
      productId <= 0 ||
      !Number.isSafeInteger(newQuantity) ||
      newQuantity < 0
    ) {
      return NextResponse.json(
        { error: "Invalid inventory correction" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase.rpc(
      "correct_inventory",
      {
        p_store_id: storeId,
        p_product_id: productId,
        p_new_quantity: newQuantity,
        p_reason: `Manager correction to ${newQuantity}`,
        p_employee_id: employee.id,
      }
    );

    if (error) {
      console.error("Inventory correction failed:", error);

      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Inventory corrected successfully",
      quantity: data,
    });
  } catch (error) {
    console.error("Inventory correction failed:", error);

    return NextResponse.json(
      { error: "Inventory correction failed" },
      { status: 500 }
    );
  }
}
