
import { getLoggedInEmployee } from "../../../../lib/employee-session";
import { getSupabaseAdmin } from "../../../../lib/supabase-admin";

export async function POST(request: Request) {
  try {
    const employee = await getLoggedInEmployee();

    if (!employee) {
      return Response.json(
        { error: "Login required" },
        { status: 401 }
      );
    }

    const body = await request.json();

    const saleItemId = Number(body.saleItemId);
    const action = body.action;

    if (
      !Number.isSafeInteger(saleItemId) ||
      saleItemId <= 0
    ) {
      return Response.json(
        { error: "Invalid sale item" },
        { status: 400 }
      );
    }

    if (action !== "match" && action !== "ignore") {
      return Response.json(
        { error: "Invalid action" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    if (action === "ignore") {
      const { data, error } = await supabase.rpc(
        "ignore_hike_sale_item",
        {
          p_sale_item_id: saleItemId,
          p_employee_id: employee.id
        }
      );

      if (error) {
        return Response.json(
          { error: error.message },
          { status: 400 }
        );
      }

      return Response.json(data);
    }

    const productId = Number(body.productId);

    if (
      !Number.isSafeInteger(productId) ||
      productId <= 0
    ) {
      return Response.json(
        { error: "Select an inventory product" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase.rpc(
      "resolve_hike_sale_item",
      {
        p_sale_item_id: saleItemId,
        p_product_id: productId,
        p_employee_id: employee.id
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
    console.error("Hike sale resolution:", error);

    return Response.json(
      { error: "Unable to resolve sale" },
      { status: 500 }
    );
  }
}
