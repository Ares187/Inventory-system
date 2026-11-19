
import { NextResponse } from "next/server";
import { getLoggedInEmployee } from "../../../../lib/employee-session";
import { getSupabaseAdmin } from "../../../../lib/supabase-admin";
import { decryptHikeToken } from "../../../../lib/hike-crypto";

export async function GET() {
  try {
    const employee = await getLoggedInEmployee();

    if (!employee || employee.role !== "owner") {
      return NextResponse.json(
        { error: "Owner access required" },
        { status: 403 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: connection, error } = await supabase
      .from("hike_connections")
      .select("access_token")
      .eq("store_name", "Sneaker Factory")
      .single();

    if (error || !connection) {
      return NextResponse.json(
        { error: "Hike connection not found" },
        { status: 404 }
      );
    }

    const accessToken = decryptHikeToken(
      connection.access_token
    );

    const url = new URL(
      "https://api.hikeup.com/api/v1/products/get_all"
    );

    url.searchParams.set("page_size", "5");

    const hikeResponse = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (hikeResponse.status === 401) {
      return NextResponse.json(
        { error: "Hike access token expired; refresh needed" },
        { status: 401 }
      );
    }

    if (!hikeResponse.ok) {
      return NextResponse.json(
        {
          error: "Hike sales request failed",
          status: hikeResponse.status,
          retryAfter:
            hikeResponse.headers.get("retry-after"),
        },
        { status: 502 }
      );
    }

    const sales = await hikeResponse.json();
    const firstProduct =
  Array.isArray(sales?.items) && sales.items.length > 0
    ? sales.items[0]
    : null;

const productFields =
  firstProduct && typeof firstProduct === "object"
    ? Object.keys(firstProduct)
    : [];
    const firstSale =
  Array.isArray(sales?.items) && sales.items.length > 0
    ? sales.items[0]
    : null;

const saleFields =
  firstSale && typeof firstSale === "object"
    ? Object.keys(firstSale)
    : [];
    const lineItems = Array.isArray(firstSale?.invoiceLineItems)
  ? firstSale.invoiceLineItems
  : [];

const firstLineItem = lineItems[0] ?? null;

const lineItemFields =
  firstLineItem && typeof firstLineItem === "object"
    ? Object.keys(firstLineItem)
    : [];
    // Server-side diagnostic only: avoid returning
    // customer details or entire sales records.
    const shape = Array.isArray(sales)
      ? "array"
      : typeof sales;

    const topLevelKeys =
      sales &&
      typeof sales === "object" &&
      !Array.isArray(sales)
        ? Object.keys(sales)
        : [];

   return NextResponse.json({
  success: true,
  totalCount: sales?.totalCount ?? null,
  returnedCount: Array.isArray(sales?.items)
    ? sales.items.length
    : 0,
  productFields,
});
  } catch (error) {
    console.error("Hike sales test failed", error);

    return NextResponse.json(
      { error: "Unable to retrieve Hike sales" },
      { status: 500 }
    );
  }
}
