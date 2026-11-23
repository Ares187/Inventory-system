
import { NextResponse } from "next/server";
import { getLoggedInEmployee } from "../../../../lib/employee-session";
import { getSupabaseAdmin } from "../../../../lib/supabase-admin";
import { hikeFetch } from "../../../../lib/hike-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type HikeLine = {
  id?: string | number;
  title?: string;
  sku?: string;
  barcode?: string;
  quantity?: number;
  refundedQuantity?: number;
};

type HikeSale = {
  id: string | number;
  outletId?: string | number;
  transactionDate?: string;
  status?: number;
  paymentStatus?: number;
  invoiceLineItems?: HikeLine[];
};

type HikeResponse = {
  items?: HikeSale[];
  totalCount?: number;
};

function text(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

export async function POST(request: Request) {
  try {
    const employee = await getLoggedInEmployee();

    if (!employee || employee.role !== "owner") {
      return NextResponse.json(
        { error: "Owner access required" },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));

    if (body.dryRun !== true) {
      return NextResponse.json(
        { error: "Only dry-run synchronization is enabled" },
        { status: 409 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: settings, error: settingsError } =
      await supabase
        .from("hike_sync_settings")
        .select("sales_cutoff,enabled,live_mode")
        .eq("id", 1)
        .single();

    if (settingsError) throw settingsError;

    if (!settings.sales_cutoff) {
      throw new Error("Sales cutoff is not configured");
    }

    const cutoff = new Date(settings.sales_cutoff).getTime();

    if (!Number.isFinite(cutoff)) {
      throw new Error("Invalid sales cutoff");
    }

    const { data: mappings, error: mappingError } =
      await supabase
        .from("hike_outlet_mapping")
        .select("hike_outlet_id,store_id");

    if (mappingError) throw mappingError;

    const outlets = new Map(
      (mappings ?? []).map((row) => [
        String(row.hike_outlet_id),
        Number(row.store_id)
      ])
    );

    const { data: products, error: productError } =
      await supabase
        .from("products")
        .select("id,upc")
        .eq("active", true);

    if (productError) throw productError;

    const byUpc = new Map<string, number[]>();

    for (const product of products ?? []) {
      const upc = text(product.upc);
      if (!upc) continue;

      byUpc.set(upc, [
        ...(byUpc.get(upc) ?? []),
        Number(product.id)
      ]);
    }

    const countResponse = await hikeFetch(
      "https://api.hikeup.com/api/v1/sales/get_all?page_size=1"
    );

    if (!countResponse.ok) {
      throw new Error(
        `Hike count request failed: ${countResponse.status}`
      );
    }

    const countPayload: HikeResponse =
      await countResponse.json();

    const total = Number(countPayload.totalCount);

    if (!Number.isSafeInteger(total) || total < 0) {
      throw new Error("Invalid Hike sales count");
    }

    const pageSize = 100;
    const maxPages = 10;

    const counts = {
      pagesChecked: 0,
      salesChecked: 0,
      eligibleSales: 0,
      lineItemsChecked: 0,
      uniqueUpcMatches: 0,
      missingUpcMatches: 0,
      ambiguousUpcMatches: 0,
      unknownOutlets: 0,
      skippedRefundedLines: 0
    };

    const samples: {
      saleId: string;
      title: string;
      barcode: string;
      storeId: number;
      productId: number | null;
      result: string;
    }[] = [];

    let reachedCutoff = false;

    // Fetch the newest pages first.
    for (let page = 0; page < maxPages; page++) {
      const skip = Math.max(
        0,
        total - (page + 1) * pageSize
      );

      const remaining = total - skip;
      if (remaining <= 0) break;

      const url =
        "https://api.hikeup.com/api/v1/sales/get_all" +
        `?page_size=${Math.min(pageSize, remaining)}` +
        `&skip_count=${skip}`;

      const response = await hikeFetch(url);

      if (!response.ok) {
        throw new Error(
          `Hike page request failed: ${response.status}`
        );
      }

      const payload: HikeResponse = await response.json();
      const sales = payload.items ?? [];

      counts.pagesChecked++;
      counts.salesChecked += sales.length;

      if (sales.length === 0) break;

      let pageHasRecentSale = false;

      for (const sale of sales) {
        const date = Date.parse(sale.transactionDate ?? "");

        if (!Number.isFinite(date)) continue;
        if (date < cutoff) continue;

        pageHasRecentSale = true;

        if (sale.status !== 2 || sale.paymentStatus !== 2) {
          continue;
        }

        const outletId = text(sale.outletId);
        const storeId = outlets.get(outletId);

        if (!storeId || ![1, 2, 3].includes(storeId)) {
          counts.unknownOutlets++;
          continue;
        }

        counts.eligibleSales++;

        for (const line of sale.invoiceLineItems ?? []) {
          const quantity = Number(line.quantity ?? 0);
          const refunded = Number(
            line.refundedQuantity ?? 0
          );

          if (
            !Number.isSafeInteger(quantity) ||
            quantity <= 0 ||
            !Number.isFinite(refunded) ||
            refunded !== 0
          ) {
            counts.skippedRefundedLines++;
            continue;
          }

          counts.lineItemsChecked++;

          const barcode = text(line.barcode);
          const matches = barcode
            ? byUpc.get(barcode) ?? []
            : [];

          let result: string;
          let productId: number | null = null;

          if (matches.length === 1) {
            counts.uniqueUpcMatches++;
            productId = matches[0];
            result = "unique_upc_match";
          } else if (matches.length > 1) {
            counts.ambiguousUpcMatches++;
            result = "ambiguous_upc";
          } else {
            counts.missingUpcMatches++;
            result = "missing_upc_match";
          }

          if (samples.length < 30) {
            samples.push({
              saleId: text(sale.id),
              title: text(line.title),
              barcode,
              storeId,
              productId,
              result
            });
          }
        }
      }

      // This is a provisional stopping rule.
      // It assumes Hike's API pages are ordered by date.
      if (!pageHasRecentSale) {
        reachedCutoff = true;
        break;
      }

      if (skip === 0) {
        reachedCutoff = true;
        break;
      }
    }

    return NextResponse.json({
      success: true,
      mode: "dry_run",
      inventoryChanged: false,
      salesImported: 0,
      cutoff: settings.sales_cutoff,
      syncEnabled: settings.enabled,
      liveMode: settings.live_mode,
      totalHikeSales: total,
      reachedCutoff,
      completeScan: reachedCutoff,
      counts,
      samples
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        inventoryChanged: false,
        error:
          error instanceof Error
            ? error.message
            : String(error)
      },
      { status: 500 }
    );
  }
}
