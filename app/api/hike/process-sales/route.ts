
import { NextResponse } from "next/server";
import { getLoggedInEmployee } from "../../../../lib/employee-session";
import { getSupabaseAdmin } from "../../../../lib/supabase-admin";
import { decryptHikeToken } from "../../../../lib/hike-crypto";
import { classifyHikeProduct } from "../../../../lib/hike-classification";
import { matchHikeSku } from "../../../../lib/hike-product-matching";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Production requires an Owner session.
    // Local development allows testing without login.
    if (process.env.NODE_ENV === "production") {
      const employee = await getLoggedInEmployee();

      if (!employee) {
        return NextResponse.json(
          {
            error: "No valid employee session",
            diagnostic: "Session cookie missing, expired, or invalid",
          },
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

    // Retrieve synchronization settings.
    const { data: settings, error: settingsError } =
      await supabase
        .from("hike_sync_settings")
        .select("enabled, live_mode, sales_cutoff")
        .eq("id", 1)
        .single();

    if (settingsError || !settings) {
      return NextResponse.json(
        { error: "Hike sync settings unavailable" },
        { status: 500 }
      );
    }

    // Retrieve encrypted Hike connection.
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

    const hikeHeaders = {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    };

    // STEP 1: Get the actual sales count.
    const countResponse = await fetch(
      "https://api.hikeup.com/api/v1/sales/get_all?page_size=1",
      {
        headers: hikeHeaders,
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

    if (!Number.isSafeInteger(totalSales) || totalSales < 0) {
      return NextResponse.json(
        { error: "Invalid Hike sales count" },
        { status: 502 }
      );
    }

    // STEP 2: Retrieve the latest 20 sales.
    const pageSize = 20;
    const skipCount = Math.max(0, totalSales - pageSize);

    const response = await fetch(
      `https://api.hikeup.com/api/v1/sales/get_all?page_size=${pageSize}&skip_count=${skipCount}`,
      {
        headers: hikeHeaders,
        cache: "no-store",
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        {
          error: "Unable to retrieve recent Hike sales",
          hikeStatus: response.status,
        },
        { status: 502 }
      );
    }

    const result = await response.json();

    const sales = Array.isArray(result?.items)
      ? result.items
      : [];

    // STEP 3: Test whether Hike supports direct SKU filtering.
    // SKU 100693 corresponds to M Glycerin 23 in recent sales.
    const requestedSku = "100693";

    const productResponse = await fetch(
      `https://api.hikeup.com/api/v1/products/get_all?page_size=100&sku=${requestedSku}`,
      {
        headers: hikeHeaders,
        cache: "no-store",
      }
    );

    if (!productResponse.ok) {
      return NextResponse.json(
        {
          error: "Unable to retrieve Hike products",
          hikeStatus: productResponse.status,
        },
        { status: 502 }
      );
    }

    const productResult = await productResponse.json();

    const products = Array.isArray(productResult?.items)
      ? productResult.items
      : [];

    // STEP 4: Classify returned products.
    const classificationSamples = products
      .slice(0, 20)
      .map((product: any) => ({
        name: product.name,
        category: product.product_type,
        ...classifyHikeProduct(product),
      }));

    // STEP 5: Extract line items from recent sales.
    const saleItems = sales.flatMap((sale: any) =>
      (
        Array.isArray(sale.invoiceLineItems)
          ? sale.invoiceLineItems
          : []
      ).map((item: any) => ({
        saleId: sale.id,
        lineItemId: item.id,
        outletId: sale.outletId,
        transactionDate: sale.transactionDate,
        saleStatus: sale.status,
        paymentStatus: sale.paymentStatus,
        productName: item.title,
        sku: item.sku,
        quantity: item.quantity,
        refundedQuantity: item.refundedQuantity,
        actionType: item.actionType,
      }))
    );

    // STEP 6: Return diagnostic results only.
    // No database writes or inventory deductions.
    return NextResponse.json({
      success: true,
      mode: "read_only",

      syncEnabled: settings.enabled,
      liveMode: settings.live_mode,
      salesCutoff: settings.sales_cutoff,

      salesRetrieved: sales.length,
      lineItemsRetrieved: saleItems.length,

      oldestSaleDate: sales.length
        ? sales[sales.length - 1].transactionDate
        : null,

      newestSaleDate: sales.length
        ? sales[0].transactionDate
        : null,

      sampleItems: saleItems.slice(0, 5),

      inventoryChanged: false,

      // Primary diagnostic for this test.
      productLookupTest: {
        requestedSku,
        totalCount: productResult.totalCount,
        returnedProducts: products.length,
        firstFive: products.slice(0, 5).map(
          (product: any) => ({
            name: product.name,
            sku: product.sku,
          })
        ),
        exactParentSkuMatches: products
          .filter(
            (product: any) =>
              String(product.sku ?? "").trim() ===
              requestedSku
          )
          .length,
        exactVariantSkuMatches: products.reduce(
          (count: number, product: any) =>
            count +
            (
              Array.isArray(product.product_variants)
                ? product.product_variants
                : []
            ).filter(
              (variant: any) =>
                String(variant.sku ?? "").trim() ===
                requestedSku
            ).length,
          0
        ),
      },

      saleMatchSamples: saleItems
        .slice(0, 10)
        .map((item: any) => ({
          saleId: item.saleId,
          productName: item.productName,
          sku: item.sku,
          match: matchHikeSku(item.sku, products),
        })),

      classificationSamples,
    });
  } catch (error) {
    console.error("Hike sales processor error:", error);

    return NextResponse.json(
      { error: "Unable to process Hike sales" },
      { status: 500 }
    );
  }
}
