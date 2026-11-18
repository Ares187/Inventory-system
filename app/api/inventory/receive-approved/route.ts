
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

    const shoeModelId = Number(body.shoeModelId);
    const storeId = Number(body.storeId);
    const quantity = Number(body.quantity);

    const gender = body.gender;
    const size = body.size;
    const width = body.width;
    const color = body.color;
    const upc = body.upc;

    // Identify exactly which fields fail validation.
    const errors: string[] = [];

    if (!Number.isSafeInteger(shoeModelId) || shoeModelId <= 0) {
      errors.push("Invalid shoe model ID");
    }

    if (!Number.isSafeInteger(storeId) || storeId <= 0) {
      errors.push("Invalid store ID");
    }

    if (typeof gender !== "string" || !gender.trim()) {
      errors.push("Invalid gender");
    }

    if (
      (typeof size !== "string" && typeof size !== "number") ||
      !String(size).trim()
    ) {
      errors.push("Invalid size");
    }

    if (typeof width !== "string" || !width.trim()) {
      errors.push("Invalid width");
    }

    if (typeof color !== "string" || !color.trim()) {
      errors.push("Invalid color");
    }

    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      errors.push("Invalid quantity");
    }

    if (upc != null && typeof upc !== "string") {
      errors.push("Invalid UPC type");
    }

    if (
      typeof upc === "string" &&
      upc.trim() !== "" &&
      !/^[0-9]{12,14}$/.test(upc.trim())
    ) {
      errors.push("UPC must contain 12 to 14 digits");
    }

    if (errors.length > 0) {
      console.error("Receiving validation failed:", errors);

      return NextResponse.json(
        { error: errors.join("; ") },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase.rpc(
      "receive_approved_shoe",
      {
        p_shoe_model_id: shoeModelId,
        p_store_id: storeId,
        p_gender: String(gender).trim(),
        p_size: String(size).trim(),
        p_width: String(width).trim(),
        p_color: String(color).trim(),
        p_quantity: quantity,
        p_upc: typeof upc === "string" ? upc.trim() || null : null,
        p_employee_id: employee.id,
      }
    );

    if (error) {
      console.error("Receiving failed:", error.message);

      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      result: data,
    });
  } catch (error) {
    console.error("Receiving API error:", error);

    return NextResponse.json(
      { error: "Unable to receive stock" },
      { status: 500 }
    );
  }
}
