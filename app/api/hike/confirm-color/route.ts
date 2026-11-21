import { getLoggedInEmployee } from "../../../../lib/employee-session";
import { getSupabaseAdmin } from "../../../../lib/supabase-admin";

export async function POST(request: Request) {
  try {
    const employee = await getLoggedInEmployee();

    if (!employee) {
      return Response.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();

    const saleItemId = Number(body.saleItemId);
    const productId = Number(body.productId);

    if (
      !Number.isSafeInteger(saleItemId) ||
      saleItemId <= 0 ||
      !Number.isSafeInteger(productId) ||
      productId <= 0
    ) {
      return Response.json(
        { error: "Invalid sale or product ID" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    // Employee identity comes from the authenticated session,
    // never from the browser request.
    const { data, error } = await supabase.rpc(
      "confirm_hike_sale_color",
      {
        p_sale_item_id: saleItemId,
        p_product_id: productId,
        p_employee_id: employee.id,
      }
    );

    if (error) {
      return Response.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return Response.json(data);
  } catch (error) {
    console.error("Color confirmation error:", error);

    return Response.json(
      { error: "Unable to confirm color" },
      { status: 500 }
    );
  }
}