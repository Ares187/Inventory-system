
import { NextResponse } from "next/server";
import { getLoggedInEmployee } from "../../../../lib/employee-session";
import { getSupabaseAdmin } from "../../../../lib/supabase-admin";
import { decryptHikeToken } from "../../../../lib/hike-crypto";

export const dynamic = "force-dynamic";

type HikeSale = {
  id: string | number;
  outletId?: string | number;
  transactionDate?: string;
  status?: number;
  paymentStatus?: number;
  invoiceLineItems?: HikeLineItem[];
};

type HikeLineItem = {
  id: string | number;
  title?: string;
  sku?: string;
  quantity?: number;
  refundedQuantity?: number;
  invoiceItemValue?: string | number;
  invoiceItemValueParent?: string | number;
  actionType?: number;
};

export async function GET() {
  try {
    // Only the owner can manually run synchronization.
    if (process.env.NODE_ENV === "production") {
  const employee = await getLoggedInEmployee();

  if (!employee) {
    return NextResponse.json(
      { error: "No valid employee session" },
      { status: 401 }
    );
  }

  if (employee.role !== "owner") {
    return NextResponse.json(
      { error: "Owner access required", detectedRole: employee.role },
      { status: 403 }
    );
  }
}

    const supabase = getSupabaseAdmin();

    const { data: settings, error: settingsError } =
      await supabase
        .from("hike_sync_settings")
        .select("enabled,live_mode,sales_cutoff")
        .eq("id", 1)
        .single();

    if (settingsError || !settings) {
      return NextResponse.json(
        { error: "Unable to retrieve synchronization settings" },
        { status: 500 }
      );
    }

    // Absolutely no recording without explicit activation.
    const recordingEnabled =
      settings.enabled === true &&
      Boolean(settings.sales_cutoff);

    const cutoff = settings.sales_cutoff
      ? new Date(settings.sales_cutoff).getTime()
      : null;

    if (cutoff !== null && !Number.isFinite(cutoff)) {
      return NextResponse.json(
        { error: "Invalid sales cutoff timestamp" },
        { status: 500 }
      );
    }

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

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    };

    // Get total number of Hike sales.
    const countResponse = await fetch(
      "https://api.hikeup.com/api/v1/sales/get_all?page_size=1",
      { headers, cache: "no-store" }
    );

    if (!countResponse.ok) {
      return NextResponse.json(
        {
          error: "Unable to retrieve Hike sales count",
          hikeStatus: countResponse.status,
        },
        { status: 502 }
      );
    }

    const countResult = await countResponse.json();
    const totalSales = Number(countResult.totalCount);

    if (!Number.isSafeInteger(totalSales) || totalSales < 0) {
      return NextResponse.json(
        { error: "Invalid Hike sales count" },
        { status: 502 }
      );
    }

    // Retrieve the last 100 sales by pagination.
    const pageSize = 100;
    const skipCount = Math.max(0, totalSales - pageSize);

    const salesResponse = await fetch(
      `https://api.hikeup.com/api/v1/sales/get_all?page_size=${pageSize}&skip_count=${skipCount}`,
      { headers, cache: "no-store" }
    );

    if (!salesResponse.ok) {
      return NextResponse.json(
        {
          error: "Unable to retrieve Hike sales",
          hikeStatus: salesResponse.status,
        },
        { status: 502 }
      );
    }

    const salesResult = await salesResponse.json();

    const sales: HikeSale[] = Array.isArray(salesResult.items)
      ? salesResult.items
      : [];

    const eligibleItems: Array<{
      hike_sale_id: string;
      hike_line_item_id: string;
      hike_outlet_id: string;
      hike_product_id: string;
      hike_variant_id: string;
      product_name: string;
      sku: string;
      quantity: number;
      sale_date: string;
      status: "pending" | "unresolved";
    }> = [];

    let skippedBeforeCutoff = 0;
    let skippedRefunds = 0;
    let skippedInvalid = 0;

    for (const sale of sales) {
      const saleTime = Date.parse(
        String(sale.transactionDate ?? "")
      );

      if (!Number.isFinite(saleTime)) {
        skippedInvalid++;
        continue;
      }

      if (cutoff === null || saleTime <= cutoff) {
        skippedBeforeCutoff++;
        continue;
      }

      for (const item of sale.invoiceLineItems ?? []) {
        const quantity = Number(item.quantity ?? 0);
        const refundedQuantity = Number(
          item.refundedQuantity ?? 0
        );

        // Refund handling stays manual in Feldryva.
        if (refundedQuantity > 0 || quantity <= 0) {
          skippedRefunds++;
          continue;
        }

        if (
          sale.id == null ||
          item.id == null ||
          !Number.isFinite(quantity)
        ) {
          skippedInvalid++;
          continue;
        }

        eligibleItems.push({
          hike_sale_id: String(sale.id),
          hike_line_item_id: String(item.id),
          hike_outlet_id: String(sale.outletId ?? ""),
          hike_product_id: String(
            item.invoiceItemValueParent ??
              item.invoiceItemValue ??
              ""
          ),
          hike_variant_id: String(
            item.invoiceItemValue ?? ""
          ),
          product_name: String(item.title ?? ""),
          sku: String(item.sku ?? ""),
          quantity,
          sale_date: String(sale.transactionDate),
          status: "pending",
        });
      }
    }

    // Read-only until explicitly activated.
    if (!recordingEnabled) {
      return NextResponse.json({
        success: true,
        mode: "read_only",
        syncEnabled: settings.enabled,
        liveMode: settings.live_mode,
        salesCutoff: settings.sales_cutoff,
        salesRetrieved: sales.length,
        eligibleItems: eligibleItems.length,
        skippedBeforeCutoff,
        skippedRefunds,
        skippedInvalid,
        inventoryChanged: false,
        recordsWritten: 0,
      });
    }

    const variantIds = [
      ...new Set(
        eligibleItems
          .map((item) => item.hike_variant_id)
          .filter(Boolean)
      ),
    ];

    const { data: indexedVariants, error: indexError } =
      variantIds.length
        ? await supabase
            .from("hike_product_index")
            .select(
              "hike_product_id,hike_variant_id,product_name,variant_name,size,width,classification"
            )
            .in("hike_variant_id", variantIds)
        : { data: [], error: null };

    if (indexError) {
      return NextResponse.json(
        { error: indexError.message },
        { status: 500 }
      );
    }

    const variantIndex = new Map(
      (indexedVariants ?? []).map((variant) => [
        String(variant.hike_variant_id),
        variant,
      ])
    );

    const records = eligibleItems.map((item) => {
      const match = variantIndex.get(item.hike_variant_id);

      const validShoe =
        match?.classification === "shoe" &&
        Boolean(match.size) &&
        Boolean(match.width);

      return {
        ...item,
        status: validShoe ? "pending" : "unresolved",
      };
    });

    if (records.length === 0) {
      return NextResponse.json({
        success: true,
        mode: "recording",
        salesRetrieved: sales.length,
        eligibleItems: 0,
        recordsWritten: 0,
        inventoryChanged: false,
      });
    }

    // Unique constraint on (hike_sale_id, hike_line_item_id)
    // prevents duplicate records across repeated syncs.
    const { data: written, error: writeError } =
      await supabase
        .from("hike_sale_items")
        .upsert(records, {
          onConflict: "hike_sale_id,hike_line_item_id",
          ignoreDuplicates: true,
        })
        .select("id,status");

    if (writeError) {
      return NextResponse.json(
        { error: writeError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      mode: "recording",
      syncEnabled: settings.enabled,
      liveMode: settings.live_mode,
      salesCutoff: settings.sales_cutoff,
      salesRetrieved: sales.length,
      eligibleItems: eligibleItems.length,
      recordsWritten: written?.length ?? 0,
      pendingRecorded:
        written?.filter((item) => item.status === "pending")
          .length ?? 0,
      unresolvedRecorded:
        written?.filter((item) => item.status === "unresolved")
          .length ?? 0,
      inventoryChanged: false,
    });
  } catch (error) {
    console.error("Hike sales processor error:", error);

    return NextResponse.json(
      { error: "Unable to process Hike sales" },
      { status: 500 }
    );
  }
}
