
import { NextResponse } from "next/server";
import { getLoggedInEmployee } from "../../../../lib/employee-session";
import { getSupabaseAdmin } from "../../../../lib/supabase-admin";
import { decryptHikeToken } from "../../../../lib/hike-crypto";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Allow unauthenticated testing only in local development.
    // Production still requires an Owner session.
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

// First request: retrieve the current total number of sales.
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

// Second request: retrieve the newest 20 sales.
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

    const saleItems = sales.flatMap((sale: any) =>
      (Array.isArray(sale.invoiceLineItems)
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
    });
  } catch (error) {
    console.error("Hike sales processor error:", error);

    return NextResponse.json(
      { error: "Unable to process Hike sales" },
      { status: 500 }
    );
  }
}
