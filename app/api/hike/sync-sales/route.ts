
import { NextResponse } from "next/server";
import { getLoggedInEmployee } from "../../../../lib/employee-session";
import { getSupabaseAdmin } from "../../../../lib/supabase-admin";
import { scanHikeSales } from "../../../../lib/hike-sales-scan";

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

type CatalogRow = {
  sku: string | null;
  barcode: string | null;
  classification: string | null;
  hike_product_id: string | null;
};

type ProductRow = {
  id: number;
  upc: string | null;
};

function clean(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function isExcludedClassification(value: string): boolean {
  return value.trim().toLowerCase() === "ignored";
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

    const cutoff = Date.parse(settings.sales_cutoff ?? "");

    if (!Number.isFinite(cutoff)) {
      throw new Error("Invalid sales cutoff");
    }

    const { data: mappings, error: mappingError } =
      await supabase
        .from("hike_outlet_mapping")
        .select("hike_outlet_id,store_id");

    if (mappingError) throw mappingError;

    const outlets = new Map<string, number>(
      (mappings ?? []).map((row) => [
        clean(row.hike_outlet_id),
        Number(row.store_id)
      ])
    );

    const { data: products, error: productError } =
      await supabase
        .from("products")
        .select("id,upc")
        .eq("active", true);

    if (productError) throw productError;

    const productsByUpc = new Map<string, number[]>();

    for (const product of (products ?? []) as ProductRow[]) {
      const upc = clean(product.upc);
      if (!upc) continue;

      productsByUpc.set(upc, [
        ...(productsByUpc.get(upc) ?? []),
        Number(product.id)
      ]);
    }

    const { data: master, error: masterError } =
      await supabase
        .from("hike_shoe_master")
        .select("hike_parent_id,parent_sku");

    if (masterError) throw masterError;

    const approvedParents = new Set(
      (master ?? [])
        .map((row) => clean(row.hike_parent_id))
        .filter(Boolean)
    );

    const approvedSkus = new Set(
      (master ?? [])
        .map((row) => clean(row.parent_sku))
        .filter(Boolean)
    );

    const { sales, pagesChecked, total } = await scanHikeSales<HikeSale>(
      new Date(cutoff).toISOString()
    );

    const eligibleSales = sales.filter((sale) => {
      const date = Date.parse(sale.transactionDate ?? "");

      return (
        sale.status === 2 &&
        sale.paymentStatus === 2 &&
        Number.isFinite(date) &&
        date >= cutoff &&
        [1, 2, 3].includes(
          outlets.get(clean(sale.outletId)) ?? -1
        )
      );
    });

    const skus = unique(
      eligibleSales.flatMap((sale) =>
        (sale.invoiceLineItems ?? [])
          .map((line) => clean(line.sku))
      )
    );

    const catalog: CatalogRow[] = [];

    for (let i = 0; i < skus.length; i += 100) {
      const batch = skus.slice(i, i + 100);

      const { data, error } = await supabase
        .from("hike_product_index")
        .select(
          "sku,barcode,classification,hike_product_id"
        )
        .in("sku", batch)
        .limit(1000);

      if (error) throw error;

      catalog.push(...(data ?? []));
    }

    const catalogBySku = new Map<string, CatalogRow[]>();

    for (const row of catalog) {
      const sku = clean(row.sku);
      if (!sku) continue;

      catalogBySku.set(sku, [
        ...(catalogBySku.get(sku) ?? []),
        row
      ]);
    }

    const counts = {
      pagesChecked,
      salesChecked: sales.length,
      eligibleSales: eligibleSales.length,
      lineItemsChecked: 0,
      approvedShoeLines: 0,
      excludedMerchandise: 0,
      needsClassification: 0,
      uniqueUpcMatches: 0,
      missingCatalogSku: 0,
      missingCatalogBarcode: 0,
      ambiguousCatalogBarcode: 0,
      missingInventoryProduct: 0,
      ambiguousInventoryProduct: 0,
      skippedRefundedLines: 0
    };

    const samples: Record<string, unknown>[] = [];

    for (const sale of eligibleSales) {
      const storeId = outlets.get(clean(sale.outletId));

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

        const sku = clean(line.sku);
        const rows = catalogBySku.get(sku) ?? [];

        let result = "";
        let barcode = "";
        let productId: number | null = null;

        if (rows.length === 0) {
          counts.missingCatalogSku++;
          result = "sku_not_in_catalog";
        } else {
          const classifications = unique(
            rows.map((row) =>
              clean(row.classification).toLowerCase()
            )
          );

          const excluded = classifications.some(
            isExcludedClassification
          );

          const approved = rows.some(
            (row) =>
              approvedParents.has(
                clean(row.hike_product_id)
              ) ||
              approvedSkus.has(sku)
          );

          if (excluded) {
            counts.excludedMerchandise++;
            result = "excluded_merchandise";
          } else if (!approved) {
            counts.needsClassification++;
            result = "needs_classification";
          } else {
            counts.approvedShoeLines++;

            const barcodes = unique(
              rows.map((row) => clean(row.barcode))
            );

            if (barcodes.length === 0) {
              counts.missingCatalogBarcode++;
              result = "missing_catalog_barcode";
            } else if (barcodes.length > 1) {
              counts.ambiguousCatalogBarcode++;
              result = "ambiguous_catalog_barcode";
            } else {
              barcode = barcodes[0];

              const matches =
                productsByUpc.get(barcode) ?? [];

              if (matches.length === 1) {
                counts.uniqueUpcMatches++;
                productId = matches[0];
                result = "exact_upc_match";
              } else if (matches.length > 1) {
                counts.ambiguousInventoryProduct++;
                result = "ambiguous_inventory_product";
              } else {
                counts.missingInventoryProduct++;
                result = "inventory_product_not_loaded";
              }
            }
          }
        }

        if (samples.length < 40) {
          samples.push({
            saleId: clean(sale.id),
            storeId,
            title: clean(line.title),
            sku,
            barcode,
            productId,
            result
          });
        }
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
      reachedCutoff: true,
      reachedBeginning: false,
      completeScan: true,
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
