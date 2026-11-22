
import { NextResponse } from "next/server";
import { getLoggedInEmployee } from "../../../../lib/employee-session";
import { getSupabaseAdmin } from "../../../../lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const employee = await getLoggedInEmployee();

    if (!employee) {
      return NextResponse.json(
        { error: "Login required" },
        { status: 401 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("hike_sale_items")
      .select(`
        id,
        hike_sale_id,
        hike_outlet_id,
        product_name,
        sku,
        quantity,
        sale_date,
        status,
        test_mode,
        hike_unresolved_sales (
          reason
        )
      `)
      .eq("status", "unresolved")
      .order("sale_date", { ascending: false })
      .limit(500);

    if (error) throw error;

    const items = (data ?? []).map((item) => {
      const unresolved = item.hike_unresolved_sales;

      const reason = Array.isArray(unresolved)
        ? unresolved[0]?.reason ?? ""
        : (unresolved as { reason?: string } | null)?.reason ?? "";

      return {
        id: item.id,
        saleId: item.hike_sale_id,
        outletId: item.hike_outlet_id,
        productName: item.product_name,
        sku: item.sku,
        quantity: item.quantity,
        saleDate: item.sale_date,
        testMode: item.test_mode,
        reason
      };
    });

    const approved = items.filter((item) =>
      item.reason.startsWith("Approved shoe")
    );

    const other = items.filter(
      (item) =>
        !item.reason.startsWith("Approved shoe") &&
        !item.reason.startsWith("Product classification")
    );

    const classification = items.filter((item) =>
      item.reason.startsWith("Product classification")
    );

    return NextResponse.json({
      success: true,
      approved,
      other,
      classification,
      total: items.length,
      inventoryChanged: false
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to load Hike review queue",
        detail:
          error instanceof Error
            ? error.message
            : String(error)
      },
      { status: 500 }
    );
  }
}
