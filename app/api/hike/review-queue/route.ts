
import { NextResponse } from "next/server";
import { getLoggedInEmployee } from "../../../../lib/employee-session";
import { getSupabaseAdmin } from "../../../../lib/supabase-admin";

function requiresClassification(reason: string) {
  return reason.startsWith("Product classification") ||
    reason === "SKU requires classification review";
}

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

    const { data, error } = await supabase.rpc("get_hike_review_items");

    if (error) throw error;

    const items = ((data ?? []) as {
      id: number;
      hike_sale_id: string;
      hike_outlet_id: string;
      product_name: string | null;
      sku: string | null;
      quantity: number;
      sale_date: string | null;
      test_mode: boolean;
      reason: string;
    }[]).map((item) => {
      return {
        id: item.id,
        saleId: item.hike_sale_id,
        outletId: item.hike_outlet_id,
        productName: item.product_name,
        sku: item.sku,
        quantity: item.quantity,
        saleDate: item.sale_date,
        testMode: item.test_mode,
        reason: item.reason
      };
    });

    const approved = items.filter((item) =>
      item.reason.startsWith("Approved shoe")
    );

    const other = items.filter(
      (item) =>
        !item.reason.startsWith("Approved shoe") &&
        !requiresClassification(item.reason)
    );

    const classification = items.filter((item) =>
      requiresClassification(item.reason)
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
