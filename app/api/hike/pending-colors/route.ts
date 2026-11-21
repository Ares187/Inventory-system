import { getLoggedInEmployee } from "../../../../lib/employee-session";
import { getSupabaseAdmin } from "../../../../lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const employee = await getLoggedInEmployee();

  if (!employee) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("hike_sale_items")
    .select(
      "id,hike_sale_id,hike_outlet_id,product_name,sku,quantity,sale_date,hike_variant_id"
    )
    .eq("status", "pending")
    .order("sale_date", { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const variantIds = [
    ...new Set(
      (data ?? [])
        .map((sale) => sale.hike_variant_id)
        .filter(Boolean)
    ),
  ];

  if (variantIds.length === 0) {
    return Response.json({ sales: [] });
  }

  const { data: variants, error: variantsError } = await supabase
    .from("hike_product_index")
    .select("hike_variant_id,size,width")
    .in("hike_variant_id", variantIds);

  if (variantsError) {
    return Response.json(
      { error: variantsError.message },
      { status: 500 }
    );
  }

  const byVariantId = new Map(
    (variants ?? []).map((variant) => [
      variant.hike_variant_id,
      variant,
    ])
  );

  const sales = (data ?? []).map((sale) => {
    const variant = byVariantId.get(sale.hike_variant_id);

    return {
      ...sale,
      size: variant?.size ?? null,
      width: variant?.width ?? null,
    };
  });

  return Response.json({ sales });
}