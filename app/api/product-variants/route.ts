
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../lib/supabase-admin";
import { getLoggedInEmployee } from "../../../lib/employee-session";

function isManager(role: string) {
  return (
    role === "owner" ||
    role === "chief" ||
    role === "manager"
  );
}

export async function GET() {
  const employee = await getLoggedInEmployee();

  if (!employee) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  if (!isManager(employee.role)) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403 }
    );
  }

  const supabase = getSupabaseAdmin();

  const [productsResult, modelsResult] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id,gender,brand,model,version,size,width,color,upc,shoe_model_id,retail_price"
      )
      .order("brand")
      .order("model")
      .order("size"),
    supabase
      .from("shoe_models")
      .select("id,brand,model,version,retail_price,active")
      .order("brand")
      .order("model"),
  ]);

  if (productsResult.error || modelsResult.error) {
    return NextResponse.json(
      { error: "Unable to load product variants" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    products: productsResult.data ?? [],
    models: modelsResult.data ?? [],
  });
}

export async function PATCH(request: NextRequest) {
  const employee = await getLoggedInEmployee();

  if (!employee) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  if (!isManager(employee.role)) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const productId = Number(body.productId);

    if (!Number.isSafeInteger(productId) || productId <= 0) {
      return NextResponse.json(
        { error: "Invalid product ID" },
        { status: 400 }
      );
    }

    const changeUpc = Object.prototype.hasOwnProperty.call(
      body,
      "upc"
    );

    const changeModel = Object.prototype.hasOwnProperty.call(
      body,
      "shoeModelId"
    );

    if (!changeUpc && !changeModel) {
      return NextResponse.json(
        { error: "No changes supplied" },
        { status: 400 }
      );
    }

    let upc: string | null = null;
    let shoeModelId: number | null = null;

    if (changeUpc) {
      if (body.upc !== null && typeof body.upc !== "string") {
        return NextResponse.json(
          { error: "UPC must be text" },
          { status: 400 }
        );
      }

      upc = typeof body.upc === "string"
        ? body.upc.trim() || null
        : null;

      if (upc && !/^\d{8,14}$/.test(upc)) {
        return NextResponse.json(
          { error: "UPC must contain 8 to 14 digits" },
          { status: 400 }
        );
      }
    }

    if (changeModel) {
      if (body.shoeModelId === null) {
        return NextResponse.json(
          { error: "Removing catalog links is not supported" },
          { status: 400 }
        );
      }

      shoeModelId = Number(body.shoeModelId);

      if (
        !Number.isSafeInteger(shoeModelId) ||
        shoeModelId <= 0
      ) {
        return NextResponse.json(
          { error: "Invalid shoe model ID" },
          { status: 400 }
        );
      }
    }

    const supabase = getSupabaseAdmin();

    const { error } = await supabase.rpc(
      "update_product_variant",
      {
        p_actor_id: employee.id,
        p_product_id: productId,
        p_change_upc: changeUpc,
        p_upc: upc,
        p_change_model: changeModel,
        p_shoe_model_id: shoeModelId,
      }
    );

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "This UPC is already assigned to another shoe" },
          { status: 409 }
        );
      }

      const message = error.message;

      if (message.includes("Product not found")) {
        return NextResponse.json(
          { error: message },
          { status: 404 }
        );
      }

      if (
        message.includes("Invalid") ||
        message.includes("UPC must") ||
        message.includes("Approved model") ||
        message.includes("Brand, model") ||
        message.includes("already linked")
      ) {
        return NextResponse.json(
          { error: message },
          { status: 400 }
        );
      }

      console.error("Product variant update failed:", error);

      return NextResponse.json(
        { error: "Unable to save product variant" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Product variant request failed:", error);

    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400 }
    );
  }
}
