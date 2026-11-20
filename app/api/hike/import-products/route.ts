
import { NextRequest, NextResponse } from "next/server";
import { getLoggedInEmployee } from "../../../../lib/employee-session";
import { getSupabaseAdmin } from "../../../../lib/supabase-admin";
import { decryptHikeToken } from "../../../../lib/hike-crypto";
import { classifyHikeProduct } from "../../../../lib/hike-classification";

export const dynamic = "force-dynamic";

type HikeAttribute = {
  variant_attribute_name?: string;
  variant_sub_value_name?: string;
};

function getAttribute(
  attributes: HikeAttribute[] | undefined,
  name: string
): string | null {
  return (
    (attributes ?? []).find(
      (attribute) =>
        attribute.variant_attribute_name?.toLowerCase() ===
        name.toLowerCase()
    )?.variant_sub_value_name ?? null
  );
}

export async function GET(request: NextRequest) {
  try {
    // Production: Owner access only.
    if (process.env.NODE_ENV === "production") {
      const employee = await getLoggedInEmployee();

      if (!employee || employee.role !== "owner") {
        return NextResponse.json(
          { error: "Owner access required" },
          { status: 403 }
        );
      }
    }

    const supabase = getSupabaseAdmin();

    const { data: connection, error: connectionError } =
      await supabase
        .from("hike_connections")
        .select("access_token")
        .eq("store_name", "Sneaker Factory")
        .single();

    if (connectionError || !connection) {
      return NextResponse.json(
        { error: "Hike is not connected" },
        { status: 400 }
      );
    }

    const accessToken = decryptHikeToken(
      connection.access_token
    );

    const pageSize = 100;
    const requestedPage = Number(
      request.nextUrl.searchParams.get("page") ?? "0"
    );

    if (
      !Number.isSafeInteger(requestedPage) ||
      requestedPage < 0
    ) {
      return NextResponse.json(
        { error: "Invalid page number" },
        { status: 400 }
      );
    }

    const skipCount = requestedPage * pageSize;

    const response = await fetch(
      `https://api.hikeup.com/api/v1/products/get_all?page_size=${pageSize}&skip_count=${skipCount}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
        cache: "no-store",
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        {
          error: "Hike product request failed",
          hikeStatus: response.status,
        },
        { status: 502 }
      );
    }

    const result = await response.json();

    const products = Array.isArray(result?.items)
      ? result.items
      : [];

    const rows: Record<string, unknown>[] = [];

    for (const product of products) {
      const classification = classifyHikeProduct(product);

      const variants = Array.isArray(product.product_variants)
        ? product.product_variants
        : [];

      if (variants.length === 0) {
        rows.push({
          hike_product_id: String(product.id),
          hike_variant_id: "",
          sku: product.sku ?? null,
          barcode: product.barcode ?? null,
          product_name: product.name ?? null,
          variant_name: null,
          size: null,
          width: null,
          color: null,
          classification: classification.classification,
          classification_reason: classification.reason,
          active: product.isActive ?? null,
          updated_at: new Date().toISOString(),
        });

        continue;
      }

      for (const variant of variants) {
        rows.push({
          hike_product_id: String(product.id),
          hike_variant_id: String(variant.prod_variant_id),
          sku: variant.sku ?? product.sku ?? null,
          barcode: variant.barcode ?? product.barcode ?? null,
          product_name: product.name ?? null,
          variant_name: variant.variant_name ?? null,
          size: getAttribute(variant.variant_sub_values, "size"),
          width: getAttribute(variant.variant_sub_values, "width"),
          color: getAttribute(variant.variant_sub_values, "color"),
          classification: classification.classification,
          classification_reason: classification.reason,
          active: product.isActive ?? null,
          updated_at: new Date().toISOString(),
        });
      }
    }

    // Update existing records, insert new records.
    // This prevents duplicate records on subsequent imports.
    const { error: upsertError } = await supabase
      .from("hike_product_index")
      .upsert(rows, {
        onConflict: "hike_product_id,hike_variant_id",
      });

    if (upsertError) {
      return NextResponse.json(
        {
          error: "Unable to save Hike product index",
          details: upsertError.message,
        },
        { status: 500 }
      );
    }

    const totalProducts = Number(result.totalCount ?? 0);

    return NextResponse.json({
      success: true,
      mode: "catalog_import",
      page: requestedPage,
      productsRetrieved: products.length,
      variantsIndexed: rows.length,
      totalHikeProducts: totalProducts,
      nextPage:
        skipCount + products.length < totalProducts
          ? requestedPage + 1
          : null,
      inventoryChanged: false,
    });
  } catch (error) {
    console.error("Hike product import error:", error);

    return NextResponse.json(
      { error: "Unable to import Hike products" },
      { status: 500 }
    );
  }
}
