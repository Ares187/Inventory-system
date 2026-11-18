
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabase-admin";
import { getLoggedInEmployee } from "../../../../lib/employee-session";

const editableFields = [
  "gender",
  "brand",
  "model",
  "version",
  "size",
  "width",
  "color",
  "upc",
  "internal_sku",
  "retail_price",
] as const;

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const employee = await getLoggedInEmployee();

    if (!employee) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id } = await context.params;
    const productId = Number(id);

    if (!Number.isSafeInteger(productId) || productId <= 0) {
      return NextResponse.json(
        { error: "Invalid product ID" },
        { status: 400 }
      );
    }

    const body = await request.json();

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body)
    ) {
      return NextResponse.json(
        { error: "Invalid product information" },
        { status: 400 }
      );
    }

    const updates: Record<string, string | number | null> = {};

    for (const field of editableFields) {
      if (!Object.prototype.hasOwnProperty.call(body, field)) {
        continue;
      }

      if (field === "retail_price") {
        if (
          body[field] === "" ||
          body[field] === null ||
          typeof body[field] === "boolean"
        ) {
          return NextResponse.json(
            { error: "Invalid retail price" },
            { status: 400 }
          );
        }

        const price = Number(body[field]);

        if (!Number.isFinite(price) || price < 0) {
          return NextResponse.json(
            { error: "Invalid retail price" },
            { status: 400 }
          );
        }

        updates[field] = price;
        continue;
      }

      const value = body[field];

      if (typeof value !== "string") {
        return NextResponse.json(
          { error: `Invalid ${field}` },
          { status: 400 }
        );
      }

      const trimmed = value.trim();

      if (
        !trimmed &&
        !["version", "upc", "internal_sku"].includes(field)
      ) {
        return NextResponse.json(
          { error: `${field} cannot be empty` },
          { status: 400 }
        );
      }

      updates[field] = trimmed || null;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No changes provided" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: current, error: findError } = await supabase
      .from("products")
      .select("*")
      .eq("id", productId)
      .single();

    if (findError || !current) {
      return NextResponse.json(
        { error: "Product not found" },
        { status: 404 }
      );
    }

    const proposed = { ...current, ...updates };

    // Prevent duplicate UPCs.
    if (proposed.upc) {
      const { data: existing, error } = await supabase
        .from("products")
        .select("id")
        .eq("upc", proposed.upc)
        .neq("id", productId)
        .limit(1);

      if (error) throw error;

      if (existing && existing.length > 0) {
        return NextResponse.json(
          { error: "Another product already has this UPC" },
          { status: 409 }
        );
      }
    }

    // Prevent duplicate shoe variants.
    let duplicateQuery = supabase
      .from("products")
      .select("id")
      .eq("gender", proposed.gender)
      .eq("brand", proposed.brand)
      .eq("model", proposed.model)
      .eq("size", proposed.size)
      .eq("width", proposed.width)
      .eq("color", proposed.color)
      .neq("id", productId);

    duplicateQuery = proposed.version
      ? duplicateQuery.eq("version", proposed.version)
      : duplicateQuery.is("version", null);

    const { data: duplicates, error: duplicateError } =
      await duplicateQuery.limit(1);

    if (duplicateError) throw duplicateError;

    if (duplicates && duplicates.length > 0) {
      return NextResponse.json(
        { error: "This shoe variant already exists" },
        { status: 409 }
      );
    }

    const { data, error } = await supabase
      .from("products")
      .update(updates)
      .eq("id", productId)
      .select("id")
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      productId: data.id,
    });
  } catch (error) {
    console.error("Product update failed:", error);

    return NextResponse.json(
      { error: "Unable to update product" },
      { status: 500 }
    );
  }
}
