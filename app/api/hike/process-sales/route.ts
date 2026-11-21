
import { NextResponse } from "next/server";
import { getLoggedInEmployee } from "../../../../lib/employee-session";
import { getSupabaseAdmin } from "../../../../lib/supabase-admin";
import { decryptHikeToken } from "../../../../lib/hike-crypto";

export const dynamic = "force-dynamic";

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

type HikeSale = {
  id: string | number;
  outletId?: string | number;
  transactionDate?: string;
  status?: number;
  paymentStatus?: number;
  invoiceLineItems?: HikeLineItem[];
};

type SaleRecord = {
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
};

export async function GET() {
  try {
    // Owner authentication in production.
    // Local testing remains available without login.
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
          {
            error: "Owner access required",
            detectedRole: employee.role,
          },
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
        { error: "Unable to retrieve sync settings" },
        { status: 500 }
      );
    }

    const cutoff = settings.sales_cutoff
      ? Date.parse(settings.sales_cutoff)
      : null;

    if (cutoff !== null && !Number.isFinite(cutoff)) {
      return NextResponse.json(
        { error: "Invalid sales cutoff" },
        { status: 500 }
      );
    }

    // Both switches must be enabled, and a cutoff
    // must exist, before any records can be written.
    const recordingEnabled =
      settings.enabled === true &&
      settings.live_mode === true &&
      cutoff !== null;

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

    // Retrieve the number of Hike sales.
    const countResponse = await fetch(
      "https://api.hikeup.com/api/v1/sales/get_all?page_size=1",
      {
        headers,
        cache: "no-store",
      }
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

    if (
      !Number.isSafeInteger(totalSales) ||
      totalSales < 0
    ) {
      return NextResponse.json(
        { error: "Invalid Hike sales count" },
        { status: 502 }
      );
    }

    // Retrieve the last 100 sales by pagination.
    // This is not yet a complete automatic polling system.
    const pageSize = 100;
    const skipCount = Math.max(
      0,
      totalSales - pageSize
    );

    const salesResponse = await fetch(
      `https://api.hikeup.com/api/v1/sales/get_all?page_size=${pageSize}&skip_count=${skipCount}`,
      {
        headers,
        cache: "no-store",
      }
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

    const sales: HikeSale[] = Array.isArray(
      salesResult.items
    )
      ? salesResult.items
      : [];

    // Count all observed Hike status combinations.
    const statusCounts = new Map<
      string,
      {
        status: number | undefined;
        paymentStatus: number | undefined;
        count: number;
      }
    >();

    for (const sale of sales) {
      const key = `${sale.status}/${sale.paymentStatus}`;
      const existing = statusCounts.get(key);

      if (existing) {
        existing.count++;
      } else {
        statusCounts.set(key, {
          status: sale.status,
          paymentStatus: sale.paymentStatus,
          count: 1,
        });
      }
    }

    const saleStatusCounts = Array.from(
      statusCounts.values()
    );

    const saleStatusSamples = sales
      .slice(0, 20)
      .map((sale) => ({
        saleId: sale.id,
        transactionDate: sale.transactionDate,
        status: sale.status,
        paymentStatus: sale.paymentStatus,
        itemCount:
          sale.invoiceLineItems?.length ?? 0,
      }));

    const eligibleItems: SaleRecord[] = [];

    let skippedBeforeCutoff = 0;
    let skippedUnpaidOrIncomplete = 0;
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

      // Never import historical sales.
      if (cutoff === null || saleTime <= cutoff) {
        skippedBeforeCutoff++;
        continue;
      }

      // Only provisionally accept status 2/payment 2.
      // Other combinations are skipped, not deleted.
      if (
        sale.status !== 2 ||
        sale.paymentStatus !== 2
      ) {
        skippedUnpaidOrIncomplete++;
        continue;
      }

      if (
        sale.id == null ||
        sale.outletId == null ||
        !Array.isArray(sale.invoiceLineItems)
      ) {
        skippedInvalid++;
        continue;
      }

      for (const item of sale.invoiceLineItems) {
        const quantity = Number(
          item.quantity ?? 0
        );

        const refundedQuantity = Number(
          item.refundedQuantity ?? 0
        );

        // Refunds are handled manually in Feldryva.
        if (refundedQuantity > 0) {
          skippedRefunds++;
          continue;
        }

        if (
          item.id == null ||
          !Number.isSafeInteger(quantity) ||
          quantity <= 0
        ) {
          skippedInvalid++;
          continue;
        }

        const productId = String(
          item.invoiceItemValueParent ??
            item.invoiceItemValue ??
            ""
        );

        const variantId = String(
          item.invoiceItemValue ?? ""
        );

        eligibleItems.push({
          hike_sale_id: String(sale.id),
          hike_line_item_id: String(item.id),
          hike_outlet_id: String(sale.outletId),
          hike_product_id: productId,
          hike_variant_id: variantId,
          product_name: String(item.title ?? ""),
          sku: String(item.sku ?? ""),
          quantity,
          sale_date: String(sale.transactionDate),
          status: "unresolved",
        });
      }
    }

    // No database writes when synchronization is disabled.
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
        skippedUnpaidOrIncomplete,
        skippedRefunds,
        skippedInvalid,
        saleStatusCounts,
        saleStatusSamples,
        recordsWritten: 0,
        inventoryChanged: false,
      });
    }

    // Match using actual Hike variant IDs.
    // Never use SKU alone because duplicate SKUs exist.
    const variantIds = [
      ...new Set(
        eligibleItems
          .map((item) => item.hike_variant_id)
          .filter(Boolean)
      ),
    ];

    const { data: indexedVariants, error: indexError } =
      variantIds.length > 0
        ? await supabase
            .from("hike_product_index")
            .select(
              "hike_product_id,hike_variant_id,product_name,variant_name,size,width,classification"
            )
            .in("hike_variant_id", variantIds)
        : { data: [], error: null };

    if (indexError) {
      return NextResponse.json(
        {
          error: "Unable to match Hike variants",
          detail: indexError.message,
        },
        { status: 500 }
      );
    }

    const variantIndex = new Map(
      (indexedVariants ?? [])
        .filter(
          (variant) =>
            variant.hike_variant_id &&
            variant.hike_variant_id !== ""
        )
        .map((variant) => [
          String(variant.hike_variant_id),
          variant,
        ])
    );

    // Parent-only sales do not have a complete variant.
    // They remain unresolved until an employee identifies
    // the correct shoe.
    const records = eligibleItems.map((item) => {
      const match = variantIndex.get(
        item.hike_variant_id
      );

      const validShoe =
        match?.classification === "shoe" &&
        Boolean(match.size) &&
        Boolean(match.width) &&
        String(match.hike_product_id) ===
          item.hike_product_id &&
        String(match.hike_variant_id) !==
          item.hike_product_id;

      return {
        ...item,
        status: validShoe
          ? ("pending" as const)
          : ("unresolved" as const),
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

    // Prevent duplicate records using the existing
    // unique constraint on sale ID and line-item ID.
    const { data: written, error: writeError } =
      await supabase
        .from("hike_sale_items")
        .upsert(records, {
          onConflict:
            "hike_sale_id,hike_line_item_id",
          ignoreDuplicates: true,
        })
        .select("id,status");

    if (writeError) {
      return NextResponse.json(
        {
          error: "Unable to record Hike sales",
          detail: writeError.message,
        },
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
      skippedBeforeCutoff,
      skippedUnpaidOrIncomplete,
      skippedRefunds,
      skippedInvalid,
      saleStatusCounts,
      recordsWritten: written?.length ?? 0,
      pendingRecorded:
        written?.filter(
          (item) => item.status === "pending"
        ).length ?? 0,
      unresolvedRecorded:
        written?.filter(
          (item) => item.status === "unresolved"
        ).length ?? 0,
      inventoryChanged: false,
    });
  } catch (error) {
    console.error(
      "Hike sales processor error:",
      error
    );

    return NextResponse.json(
      { error: "Unable to process Hike sales" },
      { status: 500 }
    );
  }
}
