
import { NextResponse } from "next/server";
import { getLoggedInEmployee } from "../../../../lib/employee-session";
import { getSupabaseAdmin } from "../../../../lib/supabase-admin";

export async function POST(request: Request) {
  try {
    const employee = await getLoggedInEmployee();

    if (!employee) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { productId, storeId, quantity, upc } = body;

    if (
      !Number.isSafeInteger(productId) ||
      productId <= 0 ||
      !Number.isSafeInteger(storeId) ||
      storeId <= 0 ||
      !Number.isSafeInteger(quantity) ||
      quantity <= 0 ||
      (upc != null && typeof upc !== "string")
    ) {
      return NextResponse.json(
        { error: "Invalid receiving information" },
        { status: 400 }
      );
    }

    const normalizedUpc = upc?.trim() || null;

    if (normalizedUpc && !/^[0-9]{12,14}$/.test(normalizedUpc)) {
      return NextResponse.json(
        { error: "UPC must contain 12 to 14 digits" },
        { status: 400 }
      );
    }

    const db = getSupabaseAdmin();

    const { data, error } = await db.rpc(
      "receive_inventory_with_upc",
      {
        p_store_id: storeId,
        p_product_id: productId,
        p_quantity: quantity,
        p_employee_id: employee.id,
        p_upc: normalizedUpc,
      }
    );

    if (error) {
      console.error("Receiving error:", error);

      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      productId,
      storeId,
      quantity,
      newQuantity: data,
    });
  } catch (error) {
    console.error("Receiving error:", error);

    return NextResponse.json(
      { error: "Unable to process receiving request" },
      { status: 500 }
    );
  }
}
