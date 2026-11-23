
import { NextResponse } from "next/server";
import { getLoggedInEmployee } from "../../../../lib/employee-session";
import { getSupabaseAdmin } from "../../../../lib/supabase-admin";
import { hikeFetch } from "../../../../lib/hike-auth";

export const dynamic = "force-dynamic";

type HikeLine = {
  id?: string | number;
  title?: string;
  sku?: string;
  barcode?: string;
  quantity?: number;
  refundedQuantity?: number;
  invoiceItemValue?: {
    id?: string | number;
    productId?: string | number;
    productVariantId?: string | number;
  };
  invoiceItemValueParent?: {
    id?: string | number;
    productId?: string | number;
  };
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
  hike_product_id: string | null;
  hike_variant_id: string | null;
  sku: string | null;
  barcode: string | null;
  product_name: string | null;
  variant_name: string | null;
  classification: string | null;
};

function str(value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return String(value);
}

function validDate(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const timestamp = Date.parse(value);

  return Number.isFinite(timestamp)
    ? new Date(timestamp).toISOString()
    : null;
}

function normalized(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
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

    if (body.testMode !== true) {
      return NextResponse.json(
        {
          error: "Live ingestion is not enabled yet",
          inventoryChanged: false
        },
        { status: 409 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: settings, error: settingsError } =
      await supabase
        .from("hike_sync_settings")
        .select("*")
        .eq("id", 1)
        .single();

    if (settingsError) throw settingsError;

    const cutoff = validDate(settings.sales_cutoff);

    if (!cutoff) {
      return NextResponse.json(
        {
          error: "Sales cutoff is not configured",
          inventoryChanged: false
        },
        { status: 409 }
      );
    }

    const { data: mappings, error: mappingError } =
      await supabase
        .from("hike_outlet_mapping")
        .select("hike_outlet_id,store_id");

    if (mappingError) throw mappingError;

    const outletMap = new Map(
      (mappings ?? []).map((m) => [
        String(m.hike_outlet_id),
        Number(m.store_id)
      ])
    );

    const { data: master, error: masterError } =
      await supabase
        .from("hike_shoe_master")
        .select("hike_parent_id,parent_sku,shoe_name");

    if (masterError) throw masterError;

    const approvedParents = new Set(
      (master ?? [])
        .map((m) => str(m.hike_parent_id))
        .filter((x): x is string => x !== null)
    );

    const approvedSkus = new Set(
      (master ?? [])
        .map((m) => str(m.parent_sku))
        .filter((x): x is string => x !== null)
    );

    const approvedNames = (master ?? [])
      .map((m) => normalized(m.shoe_name))
      .filter(Boolean);

    const countResponse = await hikeFetch(
      "https://api.hikeup.com/api/v1/sales/get_all?page_size=1"
    );

    if (!countResponse.ok) {
      throw new Error(
        `Hike count request failed: ${countResponse.status}`
      );
    }

    const countData = await countResponse.json();
    const total = Number(countData.totalCount);

    if (!Number.isSafeInteger(total) || total < 0) {
      throw new Error("Invalid Hike sales count");
    }

    const response = await hikeFetch(
      `https://api.hikeup.com/api/v1/sales/get_all?page_size=100&skip_count=${Math.max(0, total - 100)}`
    );

    if (!response.ok) {
      throw new Error(
        `Hike sales request failed: ${response.status}`
      );
    }

    const payload = await response.json();

    const sales: HikeSale[] = Array.isArray(payload.items)
      ? payload.items
      : [];

    // Collect identifiers from eligible sales.
    const productIds = new Set<string>();
    const variantIds = new Set<string>();
    const skus = new Set<string>();
    const barcodes = new Set<string>();

    const eligibleSales = sales.filter((sale) => {
      const date = validDate(sale.transactionDate);
      const outlet = str(sale.outletId);

      return (
        sale.status === 2 &&
        sale.paymentStatus === 2 &&
        date !== null &&
        date >= cutoff &&
        outlet !== null &&
        outletMap.has(outlet)
      );
    });

    for (const sale of eligibleSales) {
      for (const line of sale.invoiceLineItems ?? []) {
        const ids = [
          line.invoiceItemValueParent?.productId,
          line.invoiceItemValue?.productId,
          line.invoiceItemValueParent?.id
        ];

        for (const id of ids) {
          const value = str(id);
          if (value) productIds.add(value);
        }

        const variant = str(
          line.invoiceItemValue?.productVariantId
        );

        if (variant) variantIds.add(variant);

        const sku = str(line.sku);
        const barcode = str(line.barcode);

        if (sku) skus.add(sku);
        if (barcode) barcodes.add(barcode);
      }
    }

    const catalogRows: CatalogRow[] = [];

    async function loadCatalog(
      column: string,
      values: Set<string>
    ) {
      const identifiers = [...values];

      for (let i = 0; i < identifiers.length; i += 100) {
        const batch = identifiers.slice(i, i + 100);

        const { data, error } = await supabase
          .from("hike_product_index")
          .select(
            "hike_product_id,hike_variant_id,sku,barcode,product_name,variant_name,classification"
          )
          .in(column, batch)
          .limit(1000);

        if (error) throw error;

        catalogRows.push(...(data ?? []));
      }
    }

    await loadCatalog("hike_product_id", productIds);
    await loadCatalog("hike_variant_id", variantIds);
    await loadCatalog("sku", skus);
    await loadCatalog("barcode", barcodes);

    const byProduct = new Map<string, CatalogRow[]>();
    const byVariant = new Map<string, CatalogRow[]>();
    const bySku = new Map<string, CatalogRow[]>();
    const byBarcode = new Map<string, CatalogRow[]>();

    function add(
      map: Map<string, CatalogRow[]>,
      key: string | null,
      row: CatalogRow
    ) {
      if (!key) return;

      const existing = map.get(key) ?? [];
      existing.push(row);
      map.set(key, existing);
    }

    for (const row of catalogRows) {
      add(byProduct, row.hike_product_id, row);
      add(byVariant, row.hike_variant_id, row);
      add(bySku, row.sku, row);
      add(byBarcode, row.barcode, row);
    }

    const counts = {
      salesRetrieved: sales.length,
      completedSales: 0,
      olderThanCutoff: 0,
      unknownOutlet: 0,
      approvedShoes: 0,
      catalogMatched: 0,
      missingCatalogShoes: 0,
      excludedMerchandise: 0,
      needsManualReview: 0,
      alreadyImported: 0,
      inserted: 0,
      unresolvedCreated: 0,
      errors: 0
    };

    const samples: Record<string, unknown[]> = {
      approvedShoes: [],
      missingCatalogShoes: [],
      excludedMerchandise: [],
      needsManualReview: []
    };

    const errorSamples: string[] = [];

    for (const sale of sales) {
      if (sale.status !== 2 || sale.paymentStatus !== 2) {
        continue;
      }

      counts.completedSales++;

      const saleDate = validDate(sale.transactionDate);

      if (!saleDate || saleDate < cutoff) {
        counts.olderThanCutoff++;
        continue;
      }

      const outletId = str(sale.outletId);

      if (!outletId || !outletMap.has(outletId)) {
        counts.unknownOutlet++;
        continue;
      }

      for (const [index, line] of
        (sale.invoiceLineItems ?? []).entries()) {

        const quantity = Number(line.quantity ?? 0);
        const refunded = Number(line.refundedQuantity ?? 0);

        if (
          !Number.isFinite(quantity) ||
          quantity <= 0 ||
          !Number.isFinite(refunded) ||
          refunded !== 0
        ) {
          continue;
        }

        const productId =
          str(line.invoiceItemValueParent?.productId) ??
          str(line.invoiceItemValue?.productId) ??
          str(line.invoiceItemValueParent?.id);

        const variantId =
          str(line.invoiceItemValue?.productVariantId);

        const sku = str(line.sku);
        const barcode = str(line.barcode);

        // Prefer the most specific identifiers.
        const matches = [
          ...(variantId ? byVariant.get(variantId) ?? [] : []),
          ...(barcode ? byBarcode.get(barcode) ?? [] : []),
          ...(sku ? bySku.get(sku) ?? [] : []),
          ...(productId ? byProduct.get(productId) ?? [] : [])
        ];

        const catalog = matches[0] ?? null;

        const title = normalized(line.title);
        const catalogName = normalized(catalog?.product_name);

        const approved =
          (productId !== null &&
            approvedParents.has(productId)) ||
          (sku !== null && approvedSkus.has(sku)) ||
          (catalog !== null &&
            catalog.hike_product_id !== null &&
            approvedParents.has(
              String(catalog.hike_product_id)
            )) ||
          approvedNames.some(
            (name) =>
              name === title ||
              name === catalogName ||
              title.startsWith(name + " /") ||
              catalogName.startsWith(name + " /")
          );

        const classification =
          normalized(catalog?.classification);

        let category:
          | "approvedShoes"
          | "missingCatalogShoes"
          | "excludedMerchandise"
          | "needsManualReview";

        
const nonFootwearClassification =
  classification.includes("non-shoe") ||
  classification.includes("non shoe") ||
  classification.includes("accessory") ||
  classification.includes("apparel") ||
  classification.includes("clothing") ||
  classification.includes("nutrition") ||
  classification.includes("electronics") ||
  classification.includes("merchandise");

const footwearClassification =
  !nonFootwearClassification &&
  (
    classification.includes("footwear") ||
    classification.includes("running shoe") ||
    classification.includes("track spike") ||
    classification.includes("racing spike")
  );

if (approved) {
  category = "approvedShoes";
} else if (nonFootwearClassification) {
  category = "excludedMerchandise";
} else if (footwearClassification) {
  category = "missingCatalogShoes";
} else {
  category = "needsManualReview";
}


        counts[category]++;

        if (catalog) counts.catalogMatched++;

        if (samples[category].length < 5) {
          samples[category].push({
            saleId: sale.id,
            outletId,
            title: line.title ?? null,
            sku,
            productId,
            variantId,
            catalogName: catalog?.product_name ?? null,
            classification: catalog?.classification ?? null
          });
        }

        if (category === "excludedMerchandise") {
          continue;
        }

        const saleId = String(sale.id);
        const lineId = str(line.id) ?? `index-${index}`;

        const record = {
          hike_sale_id: saleId,
          hike_line_item_id: lineId,
          hike_outlet_id: outletId,
          hike_product_id: productId,
          hike_variant_id: variantId,
          product_name: line.title ?? null,
          sku,
          barcode,
          quantity,
          sale_date: saleDate,
          status: "unresolved",
          inventory_product_id: null,
          test_mode: true
        };

        try {
          const { data: existing, error: lookupError } =
            await supabase
              .from("hike_sale_items")
              .select("id")
              .eq("hike_sale_id", saleId)
              .eq("hike_line_item_id", lineId)
              .maybeSingle();

          if (lookupError) throw lookupError;

          if (existing) {
            counts.alreadyImported++;
            continue;
          }

          const { data: inserted, error: insertError } =
            await supabase
              .from("hike_sale_items")
              .insert(record)
              .select("id")
              .single();

          if (insertError) throw insertError;

          counts.inserted++;

          const { error: unresolvedError } =
            await supabase
              .from("hike_unresolved_sales")
              .insert({
                sale_item_id: inserted.id,
                reason:
                  category === "approvedShoes"
                    ? "Approved shoe requires exact variant matching"
                    : category === "missingCatalogShoes"
                      ? "Shoe missing from approved catalog"
                      : "Product classification requires review"
              });

          if (unresolvedError) throw unresolvedError;

          counts.unresolvedCreated++;
        } catch (error) {
          counts.errors++;

          if (errorSamples.length < 5) {
            errorSamples.push(
              error instanceof Error
                ? error.message
                : String(error)
            );
          }
        }
      }
    }

    return NextResponse.json({
      success: counts.errors === 0,
      mode: "test_only",
      testMode: true,
      cutoff,
      syncEnabled: settings.enabled,
      liveMode: settings.live_mode,
      ...counts,
      samples,
      errorSamples,
      inventoryChanged: false
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Hike sales ingestion failed",
        detail:
          error instanceof Error
            ? error.message
            : String(error),
        inventoryChanged: false
      },
      { status: 500 }
    );
  }
}
