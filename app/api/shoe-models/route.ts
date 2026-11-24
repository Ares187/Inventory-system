
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../lib/supabase-admin";
import { getLoggedInEmployee } from "../../../lib/employee-session";

function canManageCatalog(role: string) {
  return (
    role === "owner" ||
    role === "chief" ||
    role === "manager"
  );
}

function parseModel(body: Record<string, unknown>) {
  const brand =
    typeof body.brand === "string"
      ? body.brand.trim()
      : "";

  const model =
    typeof body.model === "string"
      ? body.model.trim()
      : "";

  const version =
    typeof body.version === "string"
      ? body.version.trim() || null
      : null;

  const price = Number(body.retail_price);

  if (!brand || !model) {
    return { error: "Brand and model are required" };
  }

  if (
    body.retail_price === "" ||
    body.retail_price == null ||
    !Number.isFinite(price) ||
    price < 0
  ) {
    return { error: "Enter a valid retail price" };
  }

  return {
    brand,
    model,
    version,
    price,
  };
}

// Get approved shoe models
export async function GET(request: Request) {
  try {
    const employee = await getLoggedInEmployee();

    if (!employee) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const supabase = getSupabaseAdmin();

    const includeInactive = new URL(request.url).searchParams.get("manage") === "1";
    if (includeInactive && !canManageCatalog(employee.role)) {
      return NextResponse.json({ error: "Manager access required" }, { status: 403 });
    }

    const query = supabase
      .from("shoe_models")
      .select("id, brand, model, version, retail_price, active")
      .order("brand")
      .order("model");

    const { data, error } = await (includeInactive ? query : query.eq("active", true));

    if (error) throw error;

    return NextResponse.json({ models: data });
  } catch (error) {
    console.error("Shoe catalog lookup failed:", error);

    return NextResponse.json(
      { error: "Unable to load shoe models" },
      { status: 500 }
    );
  }
}

// Create an approved shoe model
export async function POST(request: Request) {
  try {
    const employee = await getLoggedInEmployee();

    if (!employee) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    if (!canManageCatalog(employee.role)) {
      return NextResponse.json(
        { error: "Manager access required" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = parseModel(body);

    if ("error" in parsed) {
      return NextResponse.json(
        { error: parsed.error },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase.rpc(
      "manage_shoe_model",
      {
        p_actor_id: employee.id,
        p_action: "create",
        p_id: null,
        p_brand: parsed.brand,
        p_model: parsed.model,
        p_version: parsed.version,
        p_retail_price: parsed.price,
      }
    );

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "This shoe model already exists" },
          { status: 409 }
        );
      }

      console.error("Shoe model creation RPC failed:", error);

      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        shoeModelId: data,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Shoe model creation failed:", error);

    return NextResponse.json(
      { error: "Unable to create shoe model" },
      { status: 500 }
    );
  }
}

// Update an approved shoe model
export async function PATCH(request: Request) {
  try {
    const employee = await getLoggedInEmployee();

    if (!employee) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    if (!canManageCatalog(employee.role)) {
      return NextResponse.json(
        { error: "Manager access required" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const id = Number(body.id);

    if (!Number.isSafeInteger(id) || id <= 0) {
      return NextResponse.json(
        { error: "Invalid shoe model ID" },
        { status: 400 }
      );
    }

    if (typeof body.active === "boolean") {
      const { data, error } = await getSupabaseAdmin()
        .from("shoe_models")
        .update({ active: body.active })
        .eq("id", id)
        .select("id")
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        return NextResponse.json({ error: "Shoe model not found" }, { status: 404 });
      }

      return NextResponse.json({ success: true });
    }

    const parsed = parseModel(body);

    if ("error" in parsed) {
      return NextResponse.json(
        { error: parsed.error },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { error } = await supabase.rpc(
      "manage_shoe_model",
      {
        p_actor_id: employee.id,
        p_action: "update",
        p_id: id,
        p_brand: parsed.brand,
        p_model: parsed.model,
        p_version: parsed.version,
        p_retail_price: parsed.price,
      }
    );

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "This shoe model already exists" },
          { status: 409 }
        );
      }

      if (error.message.includes("Shoe model not found")) {
        return NextResponse.json(
          { error: "Shoe model not found" },
          { status: 404 }
        );
      }

      console.error("Shoe model update RPC failed:", error);

      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Shoe model update failed:", error);

    return NextResponse.json(
      { error: "Unable to update shoe model" },
      { status: 500 }
    );
  }
}
