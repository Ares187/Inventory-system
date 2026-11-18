
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

    const body = await request.json();

    const {
      fromStoreId,
      toStoreId,
      productId,
      quantity,
    } = body;

    if (
      !Number.isSafeInteger(fromStoreId) ||
      fromStoreId <= 0 ||
      !Number.isSafeInteger(toStoreId) ||
      toStoreId <= 0 ||
      !Number.isSafeInteger(productId) ||
      productId <= 0 ||
      !Number.isSafeInteger(quantity) ||
      quantity <= 0
    ) {
      return NextResponse.json(
        { error: "Invalid transfer information" },
        { status: 400 }
      );
    }

    if (fromStoreId === toStoreId) {
      return NextResponse.json(
        { error: "Select a different destination store" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { error } = await supabase.rpc(
      "transfer_inventory",
      {
        p_from_store_id: fromStoreId,
        p_to_store_id: toStoreId,
        p_product_id: productId,
        p_quantity: quantity,
        p_reason: "Employee store transfer",
        p_employee_id: employee.id,
      }
    );

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Transfer failed:", error);

    return NextResponse.json(
      { error: "Transfer failed" },
      { status: 500 }
    );
  }
}
